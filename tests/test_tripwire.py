"""Tripwire: honeytokens, detection through obfuscation, the published feed, alert attribution."""

from __future__ import annotations

import base64
import re

import pytest

from shpont_probe.poligon.feedcheck import check_feed
from shpont_probe.tripwire.alerts import AlertStore
from shpont_probe.tripwire.detector import Detector
from shpont_probe.tripwire.drills import drill_cases
from shpont_probe.tripwire.feed import build_feed, signature
from shpont_probe.tripwire.plant import patch_policy
from shpont_probe.tripwire.registry import Registry
from shpont_probe.tripwire.tokens import KINDS, mint
from tests.conftest import DECOYS

# --- honeytokens -------------------------------------------------------------------


def test_tokens_are_deterministic_per_seed_and_label():
    for kind in KINDS:
        assert mint(kind, "s", "a") == mint(kind, "s", "a")
        assert mint(kind, "s", "a") != mint(kind, "other", "a")
        assert mint(kind, "s", "a") != mint(kind, "s", "b")


def test_tokens_look_like_the_real_thing():
    assert re.fullmatch(r"AKIA[A-Z0-9]{16}", mint("aws_key", "s", "x"))
    assert re.fullmatch(r"ghp_[A-Za-z0-9]{36}", mint("github_token", "s", "x"))


def test_registry_rejects_bad_config():
    with pytest.raises(ValueError, match="class"):
        Registry.from_config({"decoys": [{"id": "a", "class": "bomb", "kind": "canary"}]})
    with pytest.raises(ValueError, match="too short"):
        Registry.from_config({"decoys": [{"id": "a", "kind": "literal", "value": "abc"}]})
    with pytest.raises(ValueError, match="duplicate"):
        Registry.from_config({"decoys": [{"id": "a", "kind": "canary"}, {"id": "a", "kind": "canary"}]})


# --- detection: positive cases --------------------------------------------------------


def test_detects_plain_token(registry):
    hits = Detector(registry).scan("the code is ZEBRA-ORCHID-7741, use it")
    assert [h.decoy.id for h in hits] == ["fixed"]


@pytest.mark.parametrize(
    "disguise",
    [
        lambda v: v.lower(),
        lambda v: " ".join(v),
        lambda v: "​".join(v),
        lambda v: v.replace("-", " _ "),
        lambda v: base64.b64encode(v.encode()).decode(),
        lambda v: v.encode().hex(),
        lambda v: v[::-1],
    ],
)
def test_detects_token_through_obfuscation(registry, disguise):
    text = "payload: " + disguise("ZEBRA-ORCHID-7741") + " end"
    assert [h.decoy.id for h in Detector(registry).scan(text)] == ["fixed"]


def test_direction_decides_whether_a_decoy_trips(registry):
    det = Detector(registry)
    ghost = registry.get("ghost").value
    canary = registry.get("prompt").value
    assert not det.scan(ghost, "tool_result")  # reading the record is normal work
    assert det.scan(ghost, "tool_call")  # moving it on is not
    assert not det.scan(canary, "input")  # the system prompt itself carries it
    assert det.scan(canary, "output")
    assert det.scan(registry.get("vault").value, "tool_result")  # a trap trips anywhere


# --- detection: negative cases --------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Refactor this function and add tests",
        "AKIAIOSFODNN7EXAMPLE",  # a real-looking key that is not ours
        "ZEBRA-ORCHID-7740",  # one character off
        "ZEBRA-ORCHID",  # a prefix
        "",
    ],
)
def test_clean_text_never_trips(registry, text):
    assert Detector(registry).scan(text) == []


# --- the published feed ----------------------------------------------------------------


def test_feed_keeps_base_signatures_and_appends_decoys(registry):
    base = {"feed_version": "7", "source": "secops", "signatures": [{"id": "SIG-1", "pattern": "x"}]}
    feed = build_feed(base, registry)
    ids = [s["id"] for s in feed["signatures"]]
    assert ids[0] == "SIG-1" and "TRIP-VAULT" in ids and len(ids) == 5
    assert feed["feed_version"].startswith("7+trip.")


def test_feed_version_changes_when_decoys_change(registry):
    other = Registry.from_config({**DECOYS, "seed": "rotated"})
    assert build_feed(None, registry)["feed_version"] != build_feed(None, other)["feed_version"]


def test_rebuilding_does_not_duplicate_decoys(registry):
    once = build_feed(None, registry)
    assert len(build_feed(once, registry)["signatures"]) == len(once["signatures"])


def test_every_decoy_signature_passes_its_own_vectors(registry):
    res = check_feed(build_feed(None, registry))
    assert res["broken"] == 0 and res["self_tested"] == len(registry.decoys)


def test_signature_pattern_matches_like_the_control_layer_will(registry):
    d = registry.get("fixed")
    sig = signature(d)
    pat = re.compile(sig["pattern"], re.IGNORECASE)
    assert pat.search("x ZEBRA-ORCHID-7741 y") and pat.search("z e b r a  o r c h i d 7 7 4 1")
    assert pat.search(base64.b64encode(d.value.encode()).decode())
    assert not pat.search("ZEBRA-ORCHID-7740") and not pat.search("an ordinary sentence")
    assert sig["category"] == "tripwire" and sig["directions"] == d.directions


# --- alerts -----------------------------------------------------------------------------


def _event(rid, principal, detail, channel="mcp", category="tripwire"):
    return {
        "ts": 1.0,
        "request_id": rid,
        "principal": principal,
        "team": "eng",
        "role": "developer",
        "channel": channel,
        "direction": "tool_call",
        "tool": "http_get",
        "findings": [{"control": "signatures", "category": category, "action": "block", "detail": detail}],
    }


def test_alert_names_who_tripped_what(registry, tmp_path):
    store = AlertStore(registry, tmp_path / "alerts.jsonl")
    new = store.ingest([_event("r1", "alice-coder", "TRIP-VAULT Tripwire trap: Vault root (decoy planted in catalog)")])
    assert len(new) == 1
    a = new[0]
    assert (a["principal"], a["decoy"], a["label"], a["tool"], a["drill"]) == (
        "alice-coder",
        "vault",
        "Vault root",
        "http_get",
        False,
    )
    assert store.state()["incidents"] == 1 and store.state()["by_principal"] == [["alice-coder", 1]]


def test_alerts_are_deduplicated_and_survive_restart(registry, tmp_path):
    sink = tmp_path / "alerts.jsonl"
    ev = [_event("r1", "bob", "TRIP-GHOST x")]
    store = AlertStore(registry, sink)
    store.ingest(ev)
    assert store.ingest(ev) == []
    again = AlertStore(registry, sink)
    assert again.state()["incidents"] == 1 and again.ingest(ev) == []


def test_self_test_traffic_is_a_drill_not_an_incident(registry, tmp_path):
    store = AlertStore(registry, tmp_path / "a.jsonl")
    store.ingest([_event("r1", "alice", "TRIP-VAULT x", channel="dashboard")])
    s = store.state()
    assert s["incidents"] == 0 and s["drills"] == 1 and not (tmp_path / "a.jsonl").exists()


def test_ordinary_findings_are_not_alerts(registry):
    store = AlertStore(registry)
    assert store.ingest([_event("r1", "alice", "SIG-PICKLE-001 pickle", category="rce")]) == []


# --- planting and drills --------------------------------------------------------------------


def test_patch_policy_adds_trap_resource_and_marker_without_touching_the_original(registry):
    policy = {
        "signatures": {"mode": "block", "feed": "feeds/x.json"},
        "resources": {"crm": {"type": "saas", "connection": {}}},
    }
    cfg = [
        {"id": "vault", "resource": {"id": "vault-root", "name": "Vault", "mock": "pw: {value}"}},
        {"id": "ghost", "plant": {"resource": "crm", "path": "GET /accounts", "body": '[{"name": "{value}"}]'}},
        {"id": "prompt", "plant": {"resource": "missing", "path": "GET /", "body": "{value}"}},
    ]
    out, notes = patch_policy(policy, registry, cfg, "http://probe/feed.json")
    assert out["signatures"] == {"mode": "block", "feed": "http://probe/feed.json", "refresh_seconds": 2}
    assert registry.get("vault").value in out["resources"]["vault-root"]["connection"]["mock_default"]
    assert registry.get("ghost").value in out["resources"]["crm"]["connection"]["mock_responses"]["GET /accounts"]
    assert any("SKIPPED" in n for n in notes)
    assert policy["signatures"]["feed"] == "feeds/x.json" and "vault-root" not in policy["resources"]


def test_drills_cover_every_decoy_and_are_caught_by_the_detector(registry):
    cases = drill_cases(registry)
    assert {c.id.split("-")[1] for c in cases} == {d.id for d in registry.decoys}
    det = Detector(registry)
    assert all(det.scan(c.text, c.direction) for c in cases)
    assert all(c.must_stop and not c.mutable for c in cases)


def test_patch_policy_leaves_service_backed_resources_alone(registry):
    policy = {"signatures": {}, "resources": {"crm": {"type": "service", "connection": {"service": "crm"}}}}
    cfg = [{"id": "ghost", "plant": {"resource": "crm", "path": "GET /accounts", "body": "{value}"}}]
    out, notes = patch_policy(policy, registry, cfg, "http://probe/feed.json")
    assert out["resources"] == policy["resources"] and out["signatures"]["feed"] == "http://probe/feed.json"
    assert any("SKIPPED planting ghost" in n for n in notes)


def test_self_test_traffic_never_pushes_out_a_real_incident(registry):
    store = AlertStore(registry, size=5)
    store.ingest([_event("real", "bob", "TRIP-GHOST x")])
    store.ingest([_event(f"d{i}", "alice", "TRIP-VAULT x", channel="dashboard") for i in range(50)])
    s = store.state()
    assert s["incidents"] == 1 and s["alerts"][0]["principal"] == "bob" and s["drills"] == 50
