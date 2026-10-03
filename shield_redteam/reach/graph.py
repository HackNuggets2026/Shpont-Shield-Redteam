"""Reach map: what each person or agent can touch, and who holds a dangerous combination of capabilities.

An AI agent becomes dangerous when one identity can (1) read private data, (2) take in content written by
outsiders, and (3) send something out of the company. Any one of these is ordinary; all three on the same
identity means a single planted instruction can move private data out. Each capability comes from a role's
tool patterns, a resource entitlement or an agent grant, so removing one source can break the combination.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from fnmatch import fnmatch
from typing import Any

LEGS = ("private", "untrusted", "egress")
LEG_LABEL = {"private": "Reads private data", "untrusted": "Takes in outside content", "egress": "Can send data out"}

DEFAULTS: dict[str, Any] = {
    # Concrete tool names the role patterns are resolved against, by the capability each one gives.
    "tools": {
        "private": ["read_file"],
        "untrusted": ["read_file", "search_docs", "http_get", "get_weather"],
        "egress": ["http_get", "send_email"],
    },
    # Resources: private if sensitive or holding personal data; untrusted if outsiders write into them;
    # egress through a scope that shares outside, or a write/exec scope on an outward-facing service.
    "private_sensitivity": ["high"],
    "private_scopes": ["pii"],
    "untrusted_resources": ["zendesk", "notion", "slack", "github-acme", "google-drive"],
    "egress_scopes": ["external_share"],
    "egress_resources": {"slack": ["write"], "zapier": ["exec"], "sendgrid": ["write"]},
}


@dataclass
class Source:
    kind: str  # tool | resource
    id: str
    via: str  # role:<role> | entitled | grant:<owner>
    leg: str

    @property
    def key(self) -> str:
        """What an admin would change to remove this source."""
        if self.kind == "tool":
            return f"tool:{self.via.split(':', 1)[1]}:{self.id}"
        return f"resource:{self.id}:{self.via}"


@dataclass
class Identity:
    id: str
    kind: str
    team: str
    role: str
    owner: str | None
    sources: list[Source] = field(default_factory=list)

    def legs(self, removed: frozenset[str] = frozenset()) -> dict[str, list[Source]]:
        out: dict[str, list[Source]] = {leg: [] for leg in LEGS}
        for s in self.sources:
            if s.key not in removed:
                out[s.leg].append(s)
        return out

    def trifecta(self, removed: frozenset[str] = frozenset()) -> bool:
        return all(self.legs(removed).values())


def _identities(policy: dict[str, Any]) -> list[Identity]:
    seen, out = set(), []
    for k in (policy.get("identity") or {}).get("api_keys", {}).values():
        if k["principal"] in seen:
            continue
        seen.add(k["principal"])
        out.append(
            Identity(k["principal"], k.get("kind") or "human", k.get("team", ""), k.get("role", ""), k.get("owner"))
        )
    return out


def _entitled_scopes(res: dict[str, Any], who: Identity) -> list[str]:
    ent = res.get("entitled") or {}
    if not (
        who.id in ent.get("principals", []) or who.team in ent.get("teams", []) or who.role in ent.get("roles", [])
    ):
        return []
    scopes = []
    for s in res.get("scopes", []):
        rule = (res.get("scope_entitlements") or {}).get(s)
        if rule and not (
            who.id in rule.get("principals", [])
            or who.team in rule.get("teams", [])
            or who.role in rule.get("roles", [])
        ):
            continue
        scopes.append(s)
    return scopes


def _resource_legs(rid: str, res: dict[str, Any], scopes: list[str], cfg: dict[str, Any]) -> list[str]:
    legs = []
    if res.get("sensitivity") in cfg["private_sensitivity"] or set(scopes) & set(cfg["private_scopes"]):
        legs.append("private")
    if rid in cfg["untrusted_resources"]:
        legs.append("untrusted")
    if set(scopes) & set(cfg["egress_scopes"]) or set(scopes) & set(cfg["egress_resources"].get(rid, [])):
        legs.append("egress")
    return legs


def build(policy: dict[str, Any], grants: list[dict[str, Any]], config: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = {**DEFAULTS, **(config or {})}
    ta = policy.get("tool_access") or {}
    tool_rbac = ta.get("enabled", True) and ta.get("mode", "block") == "block" and not ta.get("shadow", False)
    irreversible = ta.get("irreversible", []) if tool_rbac else []
    resources = policy.get("resources") or {}
    people = _identities(policy)
    by_id = {p.id: p for p in people}

    for who in people:
        # Tools: the role's patterns resolved against known tool names; irreversible ones need a human.
        patterns = ta.get("roles", {}).get(who.role, []) if tool_rbac else ["*"]
        for leg, names in cfg["tools"].items():
            for name in names:
                if any(fnmatch(name, p) for p in patterns) and not any(fnmatch(name, p) for p in irreversible):
                    who.sources.append(Source("tool", name, f"role:{who.role}", leg))
        # Resources: a human's own entitlements; an agent only what its owner granted it.
        if who.kind == "agent":
            for g in grants:
                if g.get("agent") == who.id and g.get("active", True) and g.get("resource") in resources:
                    rid = g["resource"]
                    for leg in _resource_legs(rid, resources[rid], list(g.get("scopes", [])), cfg):
                        who.sources.append(Source("resource", rid, f"grant:{who.owner}", leg))
        else:
            for rid, res in resources.items():
                if res.get("suspended"):
                    continue
                scopes = _entitled_scopes(res, who)
                if scopes:
                    for leg in _resource_legs(rid, res, scopes, cfg):
                        who.sources.append(Source("resource", rid, "entitled", leg))

    flagged = [p for p in people if p.trifecta()]
    return {
        "identities": [_identity_view(p) for p in people],
        "flagged": [p.id for p in flagged],
        "fixes": _fixes(people, flagged),
        "graph": _graph(people, resources),
        "legs": LEG_LABEL,
        "owners": {p.id: p.owner for p in people if p.owner and p.owner in by_id},
    }


def _identity_view(p: Identity) -> dict[str, Any]:
    legs = p.legs()
    weakest = min(LEGS, key=lambda leg: len(legs[leg])) if p.trifecta() else None
    return {
        "id": p.id,
        "kind": p.kind,
        "team": p.team,
        "role": p.role,
        "owner": p.owner,
        "trifecta": p.trifecta(),
        "weakest": weakest,
        "legs": {
            leg: [{"kind": s.kind, "id": s.id, "via": s.via, "key": s.key} for s in srcs] for leg, srcs in legs.items()
        },
    }


def _fixes(people: list[Identity], flagged: list[Identity], limit: int = 6) -> list[dict[str, Any]]:
    """Single changes ranked by how many dangerous combinations they break, then by how little they take away."""
    keys: dict[str, Source] = {}
    for p in flagged:
        for s in p.sources:
            keys.setdefault(s.key, s)
    scored = []
    for key, src in keys.items():
        removed = frozenset({key})
        fixed = [p.id for p in flagged if not p.trifecta(removed)]
        if not fixed:
            continue
        affected = sorted({p.id for p in people if any(s.key == key for s in p.sources)})
        scored.append(
            {
                "key": key,
                "kind": src.kind,
                "id": src.id,
                "via": src.via,
                "leg": src.leg,
                "fixes": fixed,
                "affects": affected,
                "change": _describe(src),
            }
        )
    scored.sort(key=lambda f: (-len(f["fixes"]), len(f["affects"]), f["key"]))
    return scored[:limit]


def _describe(s: Source) -> str:
    if s.kind == "tool":
        return f"Remove {s.id} from the {s.via.split(':', 1)[1]} role"
    if s.via.startswith("grant:"):
        return f"Revoke the {s.id} grant {s.via.split(':', 1)[1]} gave an agent"
    return f"Narrow the {s.id} entitlement"


def _graph(people: list[Identity], resources: dict[str, Any]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[tuple[str, str], set[str]] = defaultdict(set)
    for p in people:
        nodes[f"p:{p.id}"] = {
            "id": f"p:{p.id}",
            "col": 0,
            "label": p.id,
            "kind": p.kind,
            "trifecta": p.trifecta(),
            "sub": f"{p.team}/{p.role}",
        }
        for s in p.sources:
            sid = f"{s.kind[0]}:{s.id}"
            label = resources.get(s.id, {}).get("name", s.id) if s.kind == "resource" else s.id
            nodes.setdefault(sid, {"id": sid, "col": 1, "label": label, "kind": s.kind, "legs": []})
            if s.leg not in nodes[sid]["legs"]:
                nodes[sid]["legs"].append(s.leg)
            edges[(f"p:{p.id}", sid)].add(s.via)
            edges[(sid, f"l:{s.leg}")].add("")
    for leg in LEGS:
        nodes[f"l:{leg}"] = {"id": f"l:{leg}", "col": 2, "label": LEG_LABEL[leg], "kind": "leg"}
    return {
        "nodes": list(nodes.values()),
        "edges": [{"from": a, "to": b, "via": sorted(v - {""})} for (a, b), v in edges.items()],
    }
