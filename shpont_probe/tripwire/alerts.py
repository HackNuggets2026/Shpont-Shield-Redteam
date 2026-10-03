"""Turn control-layer audit events into tripwire alerts with attribution.

A tripped decoy is not a probability. Nothing legitimate ever carries one, so each alert is a
confirmed incident and names who did it: principal, team, role, channel, tool.
"""

from __future__ import annotations

import contextlib
import json
import re
import time
from collections import deque
from pathlib import Path
from typing import Any

from .registry import Registry

_SIG = re.compile(r"\b(TRIP-[A-Z0-9_\-]+)")


class AlertStore:
    def __init__(self, registry: Registry, sink: Path | None = None, size: int = 500):
        self.registry = registry
        self.sink = sink
        self.alerts: deque[dict[str, Any]] = deque(maxlen=size)
        self._seen: set[tuple[str, str]] = set()
        if sink:
            sink.parent.mkdir(parents=True, exist_ok=True)
            if sink.exists():  # incidents survive a restart
                for line in sink.read_text().splitlines():
                    with contextlib.suppress(ValueError, KeyError):
                        a = json.loads(line)
                        self._seen.add((str(a["request_id"]), a["sig_id"]))
                        self.alerts.appendleft(a)

    def ingest(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Scan audit events (newest first, as the control layer returns them) for tripped decoys."""
        new = []
        for e in reversed(events):
            for f in e.get("findings", []):
                m = _SIG.search(f.get("detail", "")) if f.get("category") == "tripwire" else None
                if not m:
                    continue
                key = (str(e.get("request_id")), m.group(1))
                if key in self._seen:
                    continue
                self._seen.add(key)
                decoy = self.registry.by_sig(m.group(1))
                alert = {
                    "ts": e.get("ts", time.time()),
                    "sig_id": m.group(1),
                    "decoy": decoy.id if decoy else "?",
                    "label": decoy.label if decoy else "unknown decoy (registry changed)",
                    "class": decoy.cls if decoy else "?",
                    "planted_in": decoy.planted_in if decoy else "",
                    "principal": e.get("principal"),
                    "team": e.get("team"),
                    "role": e.get("role"),
                    "channel": e.get("channel"),
                    "direction": e.get("direction"),
                    "tool": e.get("tool"),
                    "action": f.get("action"),
                    "request_id": e.get("request_id"),
                    # Self-test traffic and dashboard playground runs trip decoys on purpose.
                    "drill": e.get("channel") == "dashboard",
                }
                self.alerts.appendleft(alert)
                new.append(alert)
                if self.sink and not alert["drill"]:
                    with self.sink.open("a") as fh:
                        fh.write(json.dumps(alert) + "\n")
        return new

    def state(self) -> dict[str, Any]:
        real = [a for a in self.alerts if not a["drill"]]
        return {
            "decoys": [d.public() for d in self.registry.decoys],
            "alerts": real[:50],
            "drills": sum(a["drill"] for a in self.alerts),
            "incidents": len(real),
            "by_principal": _count(real, "principal"),
        }


def _count(rows: list[dict[str, Any]], key: str) -> list[list[Any]]:
    out: dict[str, int] = {}
    for r in rows:
        out[str(r.get(key))] = out.get(str(r.get(key)), 0) + 1
    return sorted(([k, v] for k, v in out.items()), key=lambda kv: -kv[1])
