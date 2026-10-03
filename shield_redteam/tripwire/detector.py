"""Find decoys in text. No model, no probability: a decoy is there or it is not.

Besides the literal value and its common encodings, the text is also searched in a squeezed
form (lower-cased, with spaces, punctuation and zero-width characters removed), so a token
written as `A K I A - ...` or interleaved with invisible characters still trips.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from .registry import Decoy, Registry

_DROP = re.compile(r"[\W_]+", re.UNICODE)


def squeeze(text: str) -> str:
    text = "".join(ch for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch) != "Cf")
    return _DROP.sub("", text).casefold()


@dataclass
class Hit:
    decoy: Decoy
    variant: str

    def as_dict(self) -> dict[str, str]:
        return {"decoy": self.decoy.id, "sig_id": self.decoy.sig_id, "variant": self.variant, "class": self.decoy.cls}


class Detector:
    def __init__(self, registry: Registry):
        self.registry = registry
        self._needles: list[tuple[Decoy, str, str, str]] = []
        for d in registry.decoys:
            for name, v in d.variants().items():
                self._needles.append((d, name, v.casefold(), squeeze(v)))

    def scan(self, text: str, direction: str | None = None) -> list[Hit]:
        folded, squeezed = text.casefold(), squeeze(text)
        hits: dict[str, Hit] = {}
        for decoy, name, needle, tight in self._needles:
            if decoy.id in hits or (direction and direction not in decoy.directions):
                continue
            if needle in folded:
                hits[decoy.id] = Hit(decoy, name)
            elif len(tight) >= 8 and tight in squeezed:
                hits[decoy.id] = Hit(decoy, f"{name}+obfuscated")
        return list(hits.values())
