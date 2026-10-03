"""Data trail: learn sensitive values from tool results, publish egress-only signatures, link incidents."""

from __future__ import annotations

import json
import re
import time

from shield_redteam.trail.trail import Trail, values_in

RECORD = json.dumps({"customer": {"name": "Halina Kordecka", "contract": "UM-2026-004815", "segment": "private"}})


def _event(direction, text, rid="r1", principal="bob-assistant", findings=None, channel="mcp", ts=None):
    return {
        "ts": time.time() if ts is None else ts,
        "request_id": rid,
        "principal": principal,
        "team": "finance",
        "direction": direction,
        "channel": channel,
        "tool": "search_crm",
        "raw_text": text,
        "findings": findings or [],
    }


def test_only_sensitive_fields_are_learned():
    assert set(values_in(RECORD)) == {("name", "Halina Kordecka"), ("contract", "UM-2026-004815")}
    assert values_in("not json") == []
    assert values_in(json.dumps({"name": "<PRIVATE_PERSON_1>"})) == []


def test_learned_values_become_egress_only_signatures():
    t = Trail()
    assert t.learn([_event("tool_result", RECORD)]) == 2
    sigs = t.signatures()
    assert {s["directions"][0] for s in sigs} == {"tool_call"} and all(s["category"] == "trail" for s in sigs)
    name = next(s for s in sigs if "name" in s["name"])
    assert re.search(name["pattern"], "send halina   kordecka now", re.I)


def test_self_test_traffic_and_other_directions_teach_nothing():
    t = Trail()
    assert t.learn([_event("tool_result", RECORD, channel="dashboard"), _event("input", RECORD)]) == 0


def test_a_stopped_attempt_is_linked_to_the_read():
    t = Trail()
    t.learn([_event("tool_result", RECORD)])
    sig = t.signatures()[0]["id"]
    hit = _event(
        "tool_call",
        "...",
        rid="r2",
        principal="ops-agent",
        ts=2.0,
        findings=[{"category": "trail", "action": "block", "detail": f"{sig} Data trail"}],
    )
    inc = t.watch([hit])
    assert len(inc) == 1 and inc[0]["moved_by"] == "ops-agent" and inc[0]["read"]["reader"] == "bob-assistant"
    assert t.watch([hit]) == []


def test_values_expire():
    t = Trail(ttl_hours=0)
    t.learn([_event("tool_result", RECORD, ts=0.0)])
    t.learn([])
    assert t.state()["count"] == 0
