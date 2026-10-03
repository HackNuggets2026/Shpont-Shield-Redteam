"""Reach map: capabilities per identity, the dangerous combination, and the single change that breaks it."""

from __future__ import annotations

from shield_redteam.reach.graph import build

POLICY = {
    "identity": {
        "api_keys": {
            "k1": {"principal": "dev", "team": "eng", "role": "developer", "kind": "human"},
            "k2": {"principal": "dev-bot", "team": "eng", "role": "developer", "kind": "agent", "owner": "dev"},
            "k3": {"principal": "intern", "team": "interns", "role": "intern", "kind": "human"},
        }
    },
    "tool_access": {
        "enabled": True,
        "mode": "block",
        "roles": {"developer": ["read_*", "http_get"], "intern": ["search_*"]},
        "irreversible": ["send_email"],
    },
    "resources": {
        "crm": {"sensitivity": "high", "scopes": ["read"], "entitled": {"teams": ["eng"]}},
        "tickets": {
            "sensitivity": "low",
            "scopes": ["read", "external_share"],
            "entitled": {"teams": ["interns"]},
            "scope_entitlements": {"external_share": {"teams": ["support"]}},
        },
    },
}
CFG = {"untrusted_resources": ["tickets"]}


def _by_id(result):
    return {i["id"]: i for i in result["identities"]}


def test_identity_with_all_three_capabilities_is_flagged():
    r = build(POLICY, [], CFG)
    ids = _by_id(r)
    assert set(r["flagged"]) == {"dev", "dev-bot"}
    dev = ids["dev"]["legs"]
    assert {s["id"] for s in dev["private"]} == {"read_file", "crm"}
    assert {s["id"] for s in dev["egress"]} == {"http_get"}


def test_irreversible_tools_and_unentitled_scopes_give_nothing():
    ids = _by_id(build(POLICY, [], CFG))
    assert ids["intern"]["trifecta"] is False
    assert not ids["intern"]["legs"]["egress"]  # external_share is entitled to support only
    assert all(s["id"] != "send_email" for leg in ids["dev"]["legs"].values() for s in leg)


def test_agents_get_resources_only_through_grants():
    ids = _by_id(build(POLICY, [], CFG))
    assert all(s["kind"] == "tool" for leg in ids["dev-bot"]["legs"].values() for s in leg)
    granted = _by_id(build(POLICY, [{"agent": "dev-bot", "resource": "crm", "scopes": ["read"], "active": True}], CFG))
    assert any(s["id"] == "crm" and s["via"] == "grant:dev" for s in granted["dev-bot"]["legs"]["private"])


def test_best_fix_breaks_the_most_combinations_with_the_least_collateral():
    fixes = build(POLICY, [], CFG)["fixes"]
    top = fixes[0]
    assert top["key"] == "tool:developer:http_get" and set(top["fixes"]) == {"dev", "dev-bot"}
    assert top["change"] == "Remove http_get from the developer role"


def test_switching_tool_access_off_grants_every_tool():
    policy = {**POLICY, "tool_access": {**POLICY["tool_access"], "enabled": False}}
    r = build(policy, [], CFG)
    assert "intern" in r["flagged"]
    ids = _by_id(r)
    assert any(s["id"] == "send_email" for s in ids["intern"]["legs"]["egress"])


def test_graph_links_identities_to_sources_to_capabilities():
    g = build(POLICY, [], CFG)["graph"]
    ids = {n["id"] for n in g["nodes"]}
    assert {"p:dev", "t:http_get", "r:crm", "l:egress"} <= ids
    assert {"from": "t:http_get", "to": "l:egress", "via": []} in g["edges"]
