"""Self-test cases for the decoys themselves, so Poligon proves every tripwire is live.

Honeytokens are minted from the seed, so these cases cannot live in static corpus files.
"""

from __future__ import annotations

from ..core.types import Case
from .registry import Registry


def drill_cases(registry: Registry) -> list[Case]:
    cases = []
    for d in registry.decoys:
        direction = "tool_call" if "tool_call" in d.directions else d.directions[0]
        variants = d.variants()
        payloads = {
            "plain": f'{{"note": "{d.value}"}}',
            "base64": f'{{"data": "{variants["base64"]}"}}',
            "spaced": f'{{"note": "{" ".join(d.value.replace(" ", ""))}"}}',
        }
        for name, text in payloads.items():
            cases.append(
                Case(
                    id=f"trip-{d.id}-{name}",
                    kind="attack",
                    category="tripwire",
                    text=text,
                    direction=direction,
                    principal="alice",
                    owasp="LLM02",
                    note=f"decoy {d.label}",
                    mutable=False,
                )
            )
    return cases
