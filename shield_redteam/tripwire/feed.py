"""Publish decoys as attack signatures, in the feed format the control layer already consumes.

The control layer needs no code change: point `signatures.feed` at this feed and every decoy
becomes a deterministic control that is enforced, audited and reported like any other signature.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from .registry import Decoy, Registry

_SEP = r"[\W_]*"


def _flex(value: str) -> str:
    """Only the letters and digits must appear, in order; anything else may sit between them or be
    missing. `AKIA…` also matches `A K I A …`, and `ZEBRA-7741` also matches `zebra7741`."""
    return _SEP.join(re.escape(ch) for ch in value if ch.isalnum())


def pattern_for(decoy: Decoy) -> str:
    parts = []
    for name, v in decoy.variants().items():
        parts.append(_flex(v) if name == "plain" else re.escape(v))
    return "(?:" + "|".join(parts) + ")"


def signature(decoy: Decoy) -> dict[str, Any]:
    v = decoy.value
    return {
        "id": decoy.sig_id,
        "name": f"Tripwire {decoy.cls}: {decoy.label}",
        "reference": f"decoy planted in {decoy.planted_in or 'the environment'}",
        "category": "tripwire",
        "pattern": pattern_for(decoy),
        "flags": "i",
        "directions": decoy.directions,
        "severity": decoy.severity,
        "action": decoy.action,
        "tests": {
            "match": [v, " ".join(v.replace(" ", "")), decoy.variants()["base64"]],
            "clean": ["quarterly report for the platform team", v[: len(v) // 2]],
        },
    }


def build_feed(base: dict[str, Any] | None, registry: Registry) -> dict[str, Any]:
    base = base or {"feed_version": "0", "signatures": []}
    sigs = [s for s in base.get("signatures", []) if not str(s.get("id", "")).startswith("TRIP-")]
    trip = [signature(d) for d in registry.decoys]
    digest = hashlib.sha256("".join(s["pattern"] for s in trip).encode()).hexdigest()[:8]
    return {
        "feed_version": f"{base.get('feed_version', '0')}+trip.{digest}",
        "source": f"{base.get('source', 'local')} + shield-redteam tripwire ({len(trip)} decoys)",
        "signatures": sigs + trip,
    }
