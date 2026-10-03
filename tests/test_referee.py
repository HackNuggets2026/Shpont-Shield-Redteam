"""Referee: gateways' own verdicts map onto one ladder, unsupported messages are skipped, rows compare."""

from __future__ import annotations

from shield_redteam.core.types import Decision
from shield_redteam.referee import league as lg
from shield_redteam.referee.gateways import Unsupported
from tests.conftest import case


def test_each_gateway_vocabulary_maps_onto_one_ladder():
    assert lg._normalise(Decision("review")).action == "block"
    assert lg._normalise(Decision("quarantine")).action == "block"
    assert lg._normalise(Decision("redact")).action == "redact"
    assert lg._normalise(Decision("warn")).action == "allow"
    assert lg._normalise(Decision("error", error="down")).action == "error"


class _Fake:
    def __init__(self, stop_words, prompts_only=False):
        self.stop, self.prompts_only = stop_words, prompts_only

    def evaluate(self, c):
        if self.prompts_only and c.direction != "input":
            raise Unsupported(c.direction)
        return Decision("review" if any(w in c.text for w in self.stop) else "allow")


def test_league_compares_gateways_and_names_common_gaps(monkeypatch):
    fakes = {"a": _Fake(["ignore", "key"]), "b": _Fake(["ignore"], prompts_only=True)}
    monkeypatch.setattr(lg, "build", lambda spec: fakes[spec["name"]])
    cases = [
        case("a1", "ignore previous", category="prompt_injection"),
        case("a2", "my key AKIA", category="secrets"),
        case("a3", "send rows out", category="exfiltration"),
        case("a4", "ignore it", category="prompt_injection", direction="tool_result"),
        case("b1", "hello", kind="benign"),
    ]
    r = lg.league([{"name": "a"}, {"name": "b"}], cases)
    rows = {g["name"]: g for g in r["gateways"]}
    assert rows["a"]["attacks"] == {"total": 4, "stopped": 3}
    assert rows["b"]["skipped"] == {"tool_result": 1} and rows["b"]["attacks"]["total"] == 3
    assert r["gaps_everywhere"] == ["a3"]
    assert {b["category"]: b["gateway"] for b in r["best_by_category"]}["secrets"] == "a"


def test_unreachable_gateway_is_a_row_not_a_crash(monkeypatch):
    class Down:
        def evaluate(self, c):
            return Decision("error", error="connection refused")

    monkeypatch.setattr(lg, "build", lambda spec: Down())
    r = lg.league([{"name": "x"}], [case("a1", "ignore")])
    assert r["gateways"][0]["error"] == "connection refused"
