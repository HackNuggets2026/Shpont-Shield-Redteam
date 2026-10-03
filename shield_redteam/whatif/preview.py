"""Preview a configuration change on the corpus and on recent real requests, before it is applied."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from ..core import yamlio
from ..core.types import STOPPING, Case
from ..poligon.runner import run
from ..poligon.score import impact, report
from .sandbox import Sandbox, apply_changes


def real_requests(events: list[dict[str, Any]], limit: int = 150) -> list[dict[str, Any]]:
    """Recent requests people and agents actually sent, newest first; self-test traffic excluded."""
    out, seen = [], set()
    for e in events:
        text = e.get("raw_text") or e.get("text")
        if not text or e.get("channel") == "dashboard" or not e.get("principal") or e.get("request_id") in seen:
            continue
        seen.add(e.get("request_id"))
        out.append(
            {
                "principal": e["principal"],
                "direction": e.get("direction", "input"),
                "text": text,
                "masked": not e.get("raw_text"),
                "ts": e.get("ts"),
                "channel": e.get("channel"),
            }
        )
        if len(out) >= limit:
            break
    return out


def preview(
    shield_path: Path,
    policy_file: Path,
    feed: dict[str, Any],
    cases: list[Case],
    events: list[dict[str, Any]],
    changes: list[dict[str, Any]] | None = None,
    extra_signatures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    current = yamlio.load(policy_file)
    candidate = copy.deepcopy(current)
    apply_changes(candidate, changes or [])
    cand_feed = {**feed, "signatures": list(feed.get("signatures", [])) + list(extra_signatures or [])}
    traffic = real_requests(events)
    replay = [
        Case(f"real-{i}", "benign", "real", t["text"], direction=t["direction"], principal=t["principal"])
        for i, t in enumerate(traffic)
    ]

    with Sandbox(shield_path, copy.deepcopy(current), feed) as now, Sandbox(shield_path, candidate, cand_feed) as then:
        before, after = run(now, cases, "current", workers=1), run(then, cases, "candidate", workers=1)
        old = [now.evaluate(c) for c in replay]
        new = [then.evaluate(c) for c in replay]

    flips = []
    for t, a, b in zip(traffic, old, new, strict=True):
        if (a.action in STOPPING) != (b.action in STOPPING) or a.action != b.action:
            flips.append(
                {
                    **t,
                    "before": a.action,
                    "after": b.action,
                    "stopped_now": b.action in STOPPING,
                    "by": sorted({f"{f.get('control')}" for f in b.findings}),
                }
            )
    return {
        "changes": changes or [],
        "signatures": [s.get("id") for s in extra_signatures or []],
        "before": _summary(report(before)),
        "after": _summary(report(after)),
        "impact": impact(before, after),
        "traffic": {
            "replayed": len(traffic),
            "masked": sum(t["masked"] for t in traffic),
            "newly_stopped": [f for f in flips if f["stopped_now"]],
            "newly_allowed": [f for f in flips if not f["stopped_now"]],
        },
    }


def _summary(r: dict[str, Any]) -> dict[str, Any]:
    return {k: r[k] for k in ("posture", "protection", "friction", "evasion", "attacks", "benign", "mutants")}
