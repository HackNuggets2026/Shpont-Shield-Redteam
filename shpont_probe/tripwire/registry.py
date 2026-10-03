"""The decoy registry: what is planted, where, and on which traffic it must trip.

Three classes of decoy, differing only in which directions count as a trip:

  trap    a resource or credential nobody has a reason to touch. Any sighting, anywhere, trips.
  marker  a fake record planted inside real data. Reading it is normal; it trips only when it
          leaves through a tool call (the moment data moves on to somewhere else).
  canary  a string placed in a system prompt. It trips when a model reply or a tool call
          contains it, which means the hidden instructions leaked.
"""

from __future__ import annotations

import base64
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .tokens import KINDS, mint

TRIP_ON = {
    "trap": ["input", "output", "tool_call", "tool_result", "tool_description"],
    "marker": ["tool_call"],
    "canary": ["output", "tool_call"],
}


@dataclass
class Decoy:
    id: str
    cls: str  # trap | marker | canary
    kind: str  # honeytoken kind, or "literal"
    value: str
    label: str = ""
    planted_in: str = ""
    severity: str = "critical"
    action: str = "block"
    directions: list[str] = field(default_factory=list)

    @property
    def sig_id(self) -> str:
        return f"TRIP-{self.id.upper()}"

    def variants(self) -> dict[str, str]:
        """The value and the encodings an exfiltrating agent would reach for first."""
        v = self.value
        out = {
            "plain": v,
            "base64": base64.b64encode(v.encode()).decode().rstrip("="),
            "hex": v.encode().hex(),
            "reversed": v[::-1],
        }
        quoted = urllib.parse.quote(v, safe="")
        if quoted != v:
            out["urlencoded"] = quoted
        return out

    def public(self) -> dict[str, Any]:
        masked = self.value[:6] + "…" + self.value[-3:] if len(self.value) > 12 else self.value[:3] + "…"
        return {
            "id": self.id,
            "sig_id": self.sig_id,
            "class": self.cls,
            "kind": self.kind,
            "label": self.label,
            "planted_in": self.planted_in,
            "directions": self.directions,
            "action": self.action,
            "value_masked": masked,
        }


class Registry:
    def __init__(self, decoys: list[Decoy], seed: str = ""):
        self.decoys = decoys
        self.seed = seed
        ids = [d.id for d in decoys]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate decoy id")

    def get(self, decoy_id: str) -> Decoy | None:
        return next((d for d in self.decoys if d.id == decoy_id), None)

    def by_sig(self, sig_id: str) -> Decoy | None:
        return next((d for d in self.decoys if d.sig_id == sig_id), None)

    @classmethod
    def from_config(cls, cfg: dict[str, Any]) -> Registry:
        seed = str(cfg.get("seed", "change-me"))
        decoys = []
        for raw in cfg.get("decoys", []):
            dcls = raw.get("class", "trap")
            if dcls not in TRIP_ON:
                raise ValueError(f"decoy {raw.get('id')}: class must be one of {list(TRIP_ON)}")
            kind = raw.get("kind", "literal")
            if kind == "literal":
                value = str(raw["value"])
            elif kind in KINDS:
                value = mint(kind, seed, raw["id"])
            else:
                raise ValueError(f"decoy {raw.get('id')}: unknown kind {kind!r}")
            if len(value) < 8:
                raise ValueError(f"decoy {raw['id']}: value too short to be a safe tripwire")
            decoys.append(
                Decoy(
                    id=str(raw["id"]),
                    cls=dcls,
                    kind=kind,
                    value=value,
                    label=raw.get("label", raw["id"]),
                    planted_in=raw.get("planted_in", ""),
                    severity=raw.get("severity", "critical"),
                    action=raw.get("action", "block"),
                    directions=raw.get("directions") or TRIP_ON[dcls],
                )
            )
        return cls(decoys, seed)

    @classmethod
    def from_file(cls, path: Path) -> Registry:
        return cls.from_config(yaml.safe_load(path.read_text()) or {})
