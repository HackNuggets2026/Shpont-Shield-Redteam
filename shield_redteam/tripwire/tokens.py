"""Honeytokens: values that look real, belong to nobody and are known only to Tripwire.

They are derived from a seed with HMAC, so the same seed always yields the same tokens (the
gateway and Tripwire agree after a restart) and nobody without the seed can predict them.
"""

from __future__ import annotations

import hashlib
import hmac
import string

_UPPER = string.ascii_uppercase + string.digits
_ALNUM = string.ascii_letters + string.digits
_WORDS = ["HALCYON", "OSPREY", "BASALT", "MERIDIAN", "TUNDRA", "COBALT", "LANTERN", "QUARRY"]
_FIRST = ["Zenon", "Hieronim", "Kunegunda", "Bonifacy", "Eustachy", "Leokadia"]
_LAST = ["Wrzesinski", "Kolodziejczak", "Szczepankiewicz", "Brzozowiecki", "Dziewulski"]


def _stream(seed: str, label: str, n: int) -> bytes:
    out, i = b"", 0
    while len(out) < n:
        out += hmac.new(seed.encode(), f"{label}:{i}".encode(), hashlib.sha256).digest()
        i += 1
    return out[:n]


def _pick(seed: str, label: str, alphabet: str, n: int) -> str:
    return "".join(alphabet[b % len(alphabet)] for b in _stream(seed, label, n))


def mint(kind: str, seed: str, label: str) -> str:
    raw = _stream(seed, label, 8)
    if kind == "aws_key":
        return "AKIA" + _pick(seed, label, _UPPER, 16)
    if kind == "github_token":
        return "ghp_" + _pick(seed, label, _ALNUM, 36)
    if kind == "password":
        return "Tw!" + _pick(seed, label, _ALNUM, 18)
    if kind == "codename":
        return f"PROJECT {_WORDS[raw[0] % len(_WORDS)]}-{_pick(seed, label, _UPPER, 4)}"
    if kind == "person":
        return f"{_FIRST[raw[0] % len(_FIRST)]} {_LAST[raw[1] % len(_LAST)]}-{_pick(seed, label, _UPPER, 3)}"
    if kind == "hostname":
        return f"vault-{_pick(seed, label, string.ascii_lowercase + string.digits, 6)}.corp.internal"
    if kind == "canary":
        return "CANARY-" + _pick(seed, label, _UPPER, 12)
    raise ValueError(f"unknown honeytoken kind {kind!r}")


KINDS = ("aws_key", "github_token", "password", "codename", "person", "hostname", "canary")
