"""Adapters that let one corpus be fired at every control layer the team built.

Each adapter turns a corpus case into that gateway's own evaluation call and its answer back into a
Decision. "Stopped" means the payload would not reach the model or tool as sent: blocked, redacted, or
held for a human.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from ..core.target import GatewayTarget
from ..core.types import Case, Decision

# Each gateway's own words for a payload that does not go through as sent.
STOP_WORDS = {"block", "redact", "review", "quarantine", "deny"}


class Unsupported(Exception):
    """This gateway has no way to evaluate this kind of message."""


class WardenGateway:
    """Shpont-Shield-Behavior (warden): the admin playground runs the full pipeline for a named principal."""

    def __init__(self, name: str, url: str, token: str):
        self.name = name
        self.http = httpx.Client(base_url=url, headers={"x-admin-token": token}, timeout=30)

    def evaluate(self, case: Case) -> Decision:
        t = time.perf_counter()
        try:
            r = self.http.post(
                "/admin/playground", json={"text": case.text, "direction": case.direction, "principal": case.principal}
            )
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            return Decision("error", error=f"{type(e).__name__}: {e}")
        if "action" not in body:
            return Decision("error", error=f"HTTP {r.status_code}: {str(body)[:160]}")
        return Decision(str(body["action"]).lower(), _findings(body.get("findings")), _ms(body.get("latency_ms"), t))


class SzpontGateway:
    """SzpontShield: /api/analyze checks a prompt for one destination and use case. Prompts only."""

    def __init__(self, name: str, url: str, destination: str | None = None, use_case: str = "development"):
        self.name = name
        self.http = httpx.Client(base_url=url, timeout=30)
        self.use_case = use_case
        self._destination = destination

    def destination(self) -> str:
        if not self._destination:
            cfg = self.http.get("/api/config").json()
            dests = cfg.get("destinations") or {}
            # Prefer an external model, where policy should be strictest about what leaves.
            ext = [k for k, v in dests.items() if "extern" in str(v).lower() or "public" in str(v).lower()]
            self._destination = (ext or list(dests))[0]
        return self._destination

    def evaluate(self, case: Case) -> Decision:
        if case.direction != "input":
            raise Unsupported(case.direction)
        t = time.perf_counter()
        try:
            r = self.http.post(
                "/api/analyze", json={"text": case.text, "destination": self.destination(), "use_case": self.use_case}
            )
            body = r.json()
        except (httpx.HTTPError, ValueError, IndexError) as e:
            return Decision("error", error=f"{type(e).__name__}: {e}")
        if "action" not in body:
            return Decision("error", error=f"HTTP {r.status_code}: {str(body)[:160]}")
        rules = [{"control": m.get("id"), "category": m.get("action")} for m in body.get("matched_rules", [])]
        return Decision(
            str(body["action"]).lower(), rules, float(body.get("duration_ms") or (time.perf_counter() - t) * 1000)
        )


def _findings(items: Any) -> list[dict[str, Any]]:
    return [
        {"control": f.get("control"), "category": f.get("category"), "action": f.get("action")} for f in items or []
    ]


def _ms(latency: Any, t: float) -> float:
    if isinstance(latency, dict):
        total = latency.get("total") or sum(v for v in latency.values() if isinstance(v, (int, float)))
        return float(total)
    if isinstance(latency, (int, float)):
        return float(latency)
    return (time.perf_counter() - t) * 1000


def build(spec: dict[str, Any]):
    kind, name, url = spec.get("kind", "shield"), spec.get("name", spec.get("url")), spec["url"]
    if kind == "shield":
        g = GatewayTarget(url, spec.get("token", "demo-admin-token"))
        g.name = name
        return g
    if kind == "warden":
        return WardenGateway(name, url, spec.get("token", "demo-admin"))
    if kind == "szpont":
        return SzpontGateway(name, url, spec.get("destination"), spec.get("use_case", "development"))
    raise ValueError(f"unknown gateway kind {kind!r}")
