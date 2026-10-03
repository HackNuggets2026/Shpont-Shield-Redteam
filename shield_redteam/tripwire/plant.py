"""Plant decoys into a control-layer policy file, and point its signature feed at Tripwire.

The output is a new policy file; the original is never modified. A decoy may declare:

  resource: {id, name, type, ...}       a new catalog entry that exists only as a trap
  plant: {resource, path, body}         a fake record inside an existing resource's data

`{value}` in a body is replaced by the decoy's honeytoken.
"""

from __future__ import annotations

import copy
from typing import Any

from .registry import Registry


def patch_policy(
    policy: dict[str, Any], registry: Registry, decoy_cfg: list[dict[str, Any]], feed_url: str, refresh_seconds: int = 2
) -> tuple[dict[str, Any], list[str]]:
    out = copy.deepcopy(policy)  # a round-trip document keeps its comments through the copy
    notes = []
    if out.get("signatures") is None:
        out["signatures"] = {}
    out["signatures"]["feed"] = feed_url
    out["signatures"]["refresh_seconds"] = refresh_seconds
    notes.append(f"signatures.feed -> {feed_url} (refresh {refresh_seconds}s)")

    resources = out.get("resources") or {}
    # Newer Shield versions keep resource data in code (controllayer.services), not in the policy,
    # so there is nothing in the file to plant into: those decoys stay feed-only.
    brokered = any(r.get("type") == "service" for r in resources.values())
    for raw in decoy_cfg:
        decoy = registry.get(str(raw["id"]))
        if decoy is None or not ({"resource", "plant"} & raw.keys()):
            continue
        if brokered:
            notes.append(f"SKIPPED planting {decoy.id}: this policy keeps resource data in service code")
            continue
        if "resource" in raw:
            r = dict(raw["resource"])
            rid = r.pop("id")
            body = str(r.pop("mock", "{value}")).replace("{value}", decoy.value)
            resources[rid] = {
                "type": r.pop("type", "credential"),
                "name": r.pop("name", decoy.label),
                "description": r.pop("description", ""),
                "sensitivity": r.pop("sensitivity", "high"),
                "scopes": r.pop("scopes", ["read"]),
                "entitled": r.pop("entitled", {}),
                "connection": {"base_url": f"mock://{rid}", "secret_env": "TRIPWIRE_UNUSED", "mock_default": body},
            }
            notes.append(f"trap resource {rid!r} added to the catalog")
        if "plant" in raw:
            p = raw["plant"]
            target = resources.get(p["resource"])
            if target is None:
                notes.append(f"SKIPPED {decoy.id}: resource {p['resource']!r} is not in the policy")
                continue
            conn = dict(target.get("connection") or {})
            mocks = dict(conn.get("mock_responses") or {})
            mocks[p["path"]] = str(p["body"]).replace("{value}", decoy.value)
            conn["mock_responses"] = mocks
            target["connection"] = conn
            notes.append(f"{decoy.cls} {decoy.id!r} planted in {p['resource']} at {p['path']!r}")
    if resources and "resources" not in out:
        out["resources"] = resources
    return out, notes
