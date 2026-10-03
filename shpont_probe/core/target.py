"""Targets: the thing under test. Anything that can judge a payload and name its configuration."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, Protocol

import httpx

from .types import Case, Decision


class Target(Protocol):
    name: str

    def evaluate(self, case: Case) -> Decision: ...

    def fingerprint(self) -> str:
        """Changes whenever the target's configuration (policy or feed) changes."""

    def describe(self) -> dict[str, Any]: ...

    def events(self, limit: int = 200) -> list[dict[str, Any]]: ...


class GatewayTarget:
    """A running Shpont-Shield gateway, driven through its admin API.

    Cases go through /admin/try, which the gateway evaluates with the full pipeline but does not
    meter or score, so self-testing never spends a budget or raises anyone's insider-risk level.
    """

    def __init__(self, base_url: str, admin_token: str, timeout: float = 30.0):
        self.name = base_url
        self.http = httpx.Client(base_url=base_url, headers={"x-admin-token": admin_token}, timeout=timeout)

    def evaluate(self, case: Case) -> Decision:
        t = time.perf_counter()
        try:
            r = self.http.post(
                "/admin/try", json={"principal": case.principal, "direction": case.direction, "text": case.text}
            )
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            return Decision("error", error=f"{type(e).__name__}: {e}")
        if "action" not in body:
            return Decision("error", error=f"HTTP {r.status_code}: {str(body)[:200]}")
        inner = (body.get("latency_ms") or {}).get("total")
        ms = float(inner) if inner is not None else (time.perf_counter() - t) * 1000
        return Decision(body["action"], body.get("findings") or [], ms)

    def _summary(self) -> dict[str, Any]:
        return self.http.get("/admin/summary").json()

    def fingerprint(self) -> str:
        """`key=value` segments, so a change can be traced to its cause (policy, feed, risk level...)."""
        s = self._summary()
        controls = ",".join(f"{c['name']}:{int(c['enabled'])}{c['mode']}{int(c['shadow'])}" for c in s["controls"])
        # A person under watch gets a stricter policy, which changes what the corpus measures.
        try:
            people = self.http.get("/admin/risk").json().get("principals", [])
            risk = ",".join(sorted(f"{p['principal']}:{p['level']}" for p in people if p["level"] != "normal"))
        except (httpx.HTTPError, ValueError, KeyError):
            risk = "unknown"
        return "|".join(
            [
                f"policy={s['policy']['version']}",
                f"feed={s['feed']['version']}",
                f"signatures={s['feed']['signatures']}",
                f"semantic={s['semantic']['backend']}",
                f"controls={controls}",
                f"risk_levels={risk or 'all normal'}",
            ]
        )

    def _policy_doc(self) -> dict[str, Any]:
        try:
            return self.http.get("/admin/policy").json().get("policy", {})
        except (httpx.HTTPError, ValueError):
            return {}

    def describe(self) -> dict[str, Any]:
        s = self._summary()
        return {
            "name": self.name,
            "policy": s["policy"],
            "feed": s["feed"],
            "semantic": s["semantic"],
            "controls": s["controls"],
            "policy_doc": self._policy_doc(),
        }

    def events(self, limit: int = 200) -> list[dict[str, Any]]:
        return self.http.get("/admin/events", params={"limit": limit}).json()


class CallableTarget:
    """An in-process target: any function from Case to Decision. Used by tests and by the
    in-process integration once the modules live inside the control layer itself."""

    def __init__(
        self, fn: Callable[[Case], Decision], name: str = "in-process", config: Callable[[], str] | None = None
    ):
        self.name = name
        self._fn = fn
        self._config = config or (lambda: "static")
        self.event_log: list[dict[str, Any]] = []

    def evaluate(self, case: Case) -> Decision:
        return self._fn(case)

    def fingerprint(self) -> str:
        return self._config()

    def describe(self) -> dict[str, Any]:
        return {"name": self.name}

    def events(self, limit: int = 200) -> list[dict[str, Any]]:
        return self.event_log[-limit:][::-1]
