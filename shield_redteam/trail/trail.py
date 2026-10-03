"""Data trail: follow sensitive values from where an agent read them to where they try to leave.

Detectors recognise card numbers and keys, but not a customer's name or a contract number. Each step of a
leak can look harmless on its own: one agent reads a CRM record, a later call sends a name to an outside
site. The trail learns the values that tool results actually returned for sensitive fields, publishes them
as signatures that apply only to outgoing tool calls, and links every stopped attempt back to the read it
came from.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Any

from ..tripwire.feed import _flex

SENSITIVE_KEY = re.compile(
    r"(name|customer|client|account|iban|email|phone|address|contract|national|pesel|card|salary)", re.I
)
_PLACEHOLDER = re.compile(r"<[A-Z_]+_\d+>|\*{3,}|\[REDACTED|█")
_SIG = re.compile(r"\b(TRAIL-[0-9A-F]{10})")


@dataclass
class Traced:
    id: str
    value: str
    field: str
    reader: str
    tool: str | None
    read_at: float
    request_id: str

    @property
    def sig_id(self) -> str:
        return f"TRAIL-{self.id}"

    def public(self) -> dict[str, Any]:
        v = self.value
        masked = v[:2] + "…" + v[-2:] if len(v) > 6 else v[:1] + "…"
        return {
            "id": self.id,
            "sig_id": self.sig_id,
            "masked": masked,
            "field": self.field,
            "reader": self.reader,
            "tool": self.tool,
            "read_at": self.read_at,
        }


def values_in(text: str) -> list[tuple[str, str]]:
    """(field, value) pairs from a JSON tool result whose field name suggests personal or customer data."""
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return []
    out: list[tuple[str, str]] = []

    def walk(node: Any, key: str = "") -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, str(k))
        elif isinstance(node, list):
            for v in node:
                walk(v, key)
        elif isinstance(node, str) and SENSITIVE_KEY.search(key):
            v = node.strip()
            if 6 <= len(v) <= 80 and sum(ch.isalnum() for ch in v) >= 6 and not _PLACEHOLDER.search(v):
                out.append((key, v))

    walk(data)
    return out


class Trail:
    def __init__(self, ttl_hours: float = 24.0, cap: int = 500):
        self.ttl, self.cap = ttl_hours * 3600, cap
        self.items: dict[str, Traced] = {}
        self.incidents: deque[dict[str, Any]] = deque(maxlen=200)
        self._seen_events: set[str] = set()
        self._lock = threading.Lock()

    def learn(self, events: list[dict[str, Any]]) -> int:
        """Read tool results of real traffic (oldest first) and remember their sensitive values."""
        added = 0
        now = time.time()
        for e in sorted(events, key=lambda x: x.get("ts", 0)):
            if e.get("direction") != "tool_result" or e.get("channel") == "dashboard":
                continue
            text = e.get("raw_text") or e.get("text") or ""
            for field, value in values_in(text):
                key = hashlib.sha256(value.casefold().encode()).hexdigest()[:10].upper()
                with self._lock:
                    if key not in self.items:
                        self.items[key] = Traced(
                            key,
                            value,
                            field,
                            str(e.get("principal")),
                            e.get("tool"),
                            float(e.get("ts", now)),
                            str(e.get("request_id")),
                        )
                        added += 1
        self._expire(now)
        return added

    def _expire(self, now: float) -> None:
        with self._lock:
            for k in [k for k, t in self.items.items() if now - t.read_at > self.ttl]:
                del self.items[k]
            if len(self.items) > self.cap:
                for k, _ in sorted(self.items.items(), key=lambda kv: kv[1].read_at)[: len(self.items) - self.cap]:
                    del self.items[k]

    def signatures(self) -> list[dict[str, Any]]:
        """One signature per traced value, applied only to outgoing tool calls."""
        with self._lock:
            items = list(self.items.values())
        return [
            {
                "id": t.sig_id,
                "name": f"Data trail: {t.field} read by {t.reader}" + (f" via {t.tool}" if t.tool else ""),
                "reference": f"read in request {t.request_id}",
                "category": "trail",
                "pattern": "(?:" + _flex(t.value) + ")",
                "flags": "i",
                "directions": ["tool_call"],
                "severity": "high",
                "action": "block",
                "tests": {"match": [t.value], "clean": ["quarterly report for the platform team"]},
            }
            for t in items
        ]

    def watch(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Turn control-layer events that hit a trail signature into incidents linking the read to the attempt."""
        new = []
        for e in sorted(events, key=lambda x: x.get("ts", 0)):
            for f in e.get("findings", []):
                m = _SIG.search(f.get("detail", "")) if f.get("category") == "trail" else None
                if not m or e.get("channel") == "dashboard":
                    continue
                rid = f"{e.get('request_id')}:{m.group(1)}"
                if rid in self._seen_events:
                    continue
                self._seen_events.add(rid)
                t = self.items.get(m.group(1)[len("TRAIL-") :])
                inc = {
                    "ts": e.get("ts"),
                    "sig_id": m.group(1),
                    "action": f.get("action"),
                    "moved_by": e.get("principal"),
                    "team": e.get("team"),
                    "tool": e.get("tool"),
                    "direction": e.get("direction"),
                    "read": t.public() if t else None,
                }
                self.incidents.appendleft(inc)
                new.append(inc)
        return new

    def state(self) -> dict[str, Any]:
        with self._lock:
            items = sorted(self.items.values(), key=lambda t: -t.read_at)
        return {
            "traced": [t.public() for t in items[:200]],
            "count": len(items),
            "incidents": list(self.incidents)[:50],
        }

    def dump(self) -> list[dict[str, Any]]:
        return [asdict(t) for t in self.items.values()]
