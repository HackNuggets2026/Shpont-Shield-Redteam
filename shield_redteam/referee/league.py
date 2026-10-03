"""Fire one corpus at every gateway the team built and put the results side by side."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from ..core.types import Case, Decision, Outcome
from ..poligon.runner import Run
from ..poligon.score import report
from .gateways import STOP_WORDS, Unsupported, build


def _normalise(d: Decision) -> Decision:
    """Map each gateway's own words onto the shared ladder: block, redact or allow."""
    if d.error:
        return d
    if d.action == "redact":
        return d
    d.action = "block" if d.action in STOP_WORDS else "allow"
    return d


def play(spec: dict[str, Any], cases: list[Case], workers: int = 4) -> dict[str, Any]:
    """One gateway, the whole corpus. Cases the gateway cannot evaluate are counted, not scored."""
    name = spec.get("name", spec.get("url"))
    try:
        gw = build(spec)
    except Exception as e:  # noqa: BLE001 - a misconfigured gateway is a row in the table, not a crash
        return {"name": name, "url": spec.get("url"), "kind": spec.get("kind"), "error": str(e)}

    def one(c: Case) -> Decision | None:
        try:
            return _normalise(gw.evaluate(c))
        except Unsupported:
            return None

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(one, cases))
    pairs = [(c, d) for c, d in zip(cases, results, strict=True) if d is not None]
    skipped: dict[str, int] = {}
    for c, d in zip(cases, results, strict=True):
        if d is None:
            skipped[c.direction] = skipped.get(c.direction, 0) + 1
    errors = [d.error for _, d in pairs if d.error]
    base = {
        "name": name,
        "url": spec.get("url"),
        "kind": spec.get("kind"),
        "owner": spec.get("owner", ""),
        "skipped": skipped,
        "evaluated": len(pairs),
        "errors": len(errors),
    }
    if not pairs or len(errors) == len(pairs):
        return {**base, "error": errors[0] if errors else "this gateway evaluated none of the test messages"}

    rep = report(Run(name, [Outcome(c, d) for c, d in pairs], seconds=time.perf_counter() - started))
    return {
        **base,
        "error": "",
        "posture": rep["posture"],
        "protection": rep["protection"],
        "friction": rep["friction"],
        "evasion": rep["evasion"],
        "attacks": rep["attacks"],
        "benign": rep["benign"],
        "mutants": rep["mutants"],
        "latency_ms": rep["latency_ms"],
        "seconds": rep["seconds"],
        "by_category": rep["by_category"],
        "open": [o["id"] for o in rep["open_attacks"]],
        "attack_ids": [c.id for c, _ in pairs if c.must_stop and not c.parent],
        "false_positives": [o["id"] for o in rep["false_positives"]],
    }


def league(specs: list[dict[str, Any]], cases: list[Case]) -> dict[str, Any]:
    rows = [play(s, cases) for s in specs]
    ok = [r for r in rows if not r.get("error")]
    # For every attack class, which gateway stops the largest share: the parts worth keeping when merging.
    best: dict[str, dict[str, Any]] = {}
    for r in ok:
        for g in r["by_category"]:
            if not g["attacks"]:
                continue
            cur = best.get(g["name"])
            if cur is None or (g["protection"] or 0) > cur["protection"]:
                best[g["name"]] = {"category": g["name"], "gateway": r["name"], "protection": g["protection"] or 0}
    # Attacks that every gateway able to evaluate them lets through: gaps the merged product would still have.
    seen = set().union(*(set(r["attack_ids"]) for r in ok)) if ok else set()
    common_gaps = sorted(a for a in seen if all(a in r["open"] for r in ok if a in r["attack_ids"]))
    return {
        "ran_at": time.time(),
        "gateways": rows,
        "best_by_category": sorted(best.values(), key=lambda b: b["category"]),
        "gaps_everywhere": common_gaps,
    }
