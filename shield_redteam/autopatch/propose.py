"""Turn attacks that get through into signature patches, and keep only patches that are proven.

A candidate is a phrase taken from the attack itself that never occurs in any legitimate request of the
corpus. A patch is offered only after the real control layer, run in a sandbox with the patch added,
stops the attack and blocks no legitimate request it did not block before.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Any

from ..core.types import Case

_WORD = re.compile(r"[^\W_]+", re.UNICODE)
# Words that carry the technique of an attack rather than one payload's details; they rank phrases.
_SIGNAL = {
    "ignore",
    "ignoruj",
    "zignoruj",
    "disregard",
    "forget",
    "previous",
    "prior",
    "poprzednie",
    "instructions",
    "instrukcje",
    "polecenia",
    "system",
    "prompt",
    "role",
    "override",
    "unrestricted",
    "jailbreak",
    "developer",
    "trust",
    "remote",
    "code",
    "exec",
    "eval",
    "rm",
    "rf",
    "root",
    "preserve",
    "reveal",
    "password",
    "secret",
    "credentials",
    "exfiltrate",
    "upload",
    "void",
}
# A quoted token without spaces ('model.bin', 'org/name') or a JSON key ("command":) names this payload, not the attack.
_INSTANCE = re.compile(r"""(['"])([^'"\s]+)\1(?!\s*:)|(['"])([^'"]+)\3\s*:""")
_FILLER = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "be",
    "it",
    "this",
    "that",
    "no",
    "i",
    "you",
    "your",
    "me",
    "my",
    "we",
    "our",
    "as",
    "at",
    "by",
    "from",
    "now",
    "all",
    "any",
    "please",
}


def _ngrams(words: list[str], n: int) -> list[tuple[str, ...]]:
    return [tuple(words[i : i + n]) for i in range(len(words) - n + 1)]


def _pattern(phrase: tuple[str, ...]) -> str:
    return r"(?<![^\W_])" + r"[\W_]+".join(re.escape(w) for w in phrase) + r"(?![^\W_])"


def _words(text: str) -> list[str]:
    return [w.casefold() for w in _WORD.findall(text)]


def candidate(case: Case, benign: list[Case], vocab: Counter[str] | None = None) -> dict[str, Any] | None:
    """A phrase of the attack that no legitimate request contains, as a feed signature.

    Among safe phrases, the one made of words that recur across attacks wins, so the rule targets the
    technique ("previous system prompt") rather than one payload's details (a model name, a host).
    """
    words = _words(case.text)
    instance = {w for m in _INSTANCE.finditer(case.text) for w in _words(m.group(2) or m.group(4) or "")}
    clean = [c.text for c in benign]
    vocab = vocab or Counter()
    options = []
    for n in (4, 3, 2):
        for ph in _ngrams(words, n):
            if sum(w not in _FILLER for w in ph) < 2 or all(len(w) < 3 for w in ph) or set(ph) & instance:
                continue
            rx = re.compile(_pattern(ph), re.IGNORECASE)
            if rx.search(case.text) and not any(rx.search(t) for t in clean):
                options.append(ph)
    if options:
        phrase = max(
            options, key=lambda ph: (sum(w in _SIGNAL for w in ph), sum(vocab[w] >= 2 for w in ph), len(ph), ph)
        )
        digest = hashlib.sha256(" ".join(phrase).encode()).hexdigest()[:6].upper()
        return {
            "id": f"PATCH-{digest}",
            "name": f"Autopatch: {case.category.replace('_', ' ')} ({' '.join(phrase)})",
            "reference": f"proposed from corpus case {case.id}",
            "category": case.category,
            "pattern": _pattern(phrase),
            "flags": "i",
            "directions": [case.direction],
            "severity": "high",
            "action": "block",
            "tests": {"match": [case.text], "clean": clean[:5]},
            "case": case.id,
        }
    return None


def candidates(open_cases: list[Case], benign: list[Case], attacks: list[Case] | None = None) -> list[dict[str, Any]]:
    vocab: Counter[str] = Counter()
    for c in attacks or open_cases:
        vocab.update(set(_words(c.text)))
    out, seen = [], set()
    for c in open_cases:
        sig = candidate(c, benign, vocab)
        if sig and sig["id"] not in seen:
            seen.add(sig["id"])
            out.append(sig)
    return out
