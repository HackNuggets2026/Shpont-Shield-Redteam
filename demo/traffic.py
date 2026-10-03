"""Send a few minutes' worth of ordinary employee traffic through the control layer.

It gives the What-if preview real requests to replay. Run it after demo/up.sh: python demo/traffic.py
"""

from __future__ import annotations

import argparse

import httpx

REQUESTS = [
    ("dev-alice-key", "input", "Refactor the billing module to use dependency injection."),
    ("dev-alice-key", "input", "Why does the login test fail only on CI? The log says connection refused."),
    (
        "dev-alice-key",
        "input",
        "Reply to the client that the fix ships Friday, their contact is jan.nowak@example.com.",
    ),
    ("dev-alice-key", "input", "Draft release notes for version 2.4 from these commit messages."),
    ("fin-bob-key", "input", "Summarize Q3 revenue by region in three bullet points."),
    ("fin-bob-key", "input", "Write a polite reminder to the vendor about invoice 2026/09/114."),
    ("fin-bob-key", "input", "Call the customer back on +48 600 123 456 about the refund."),
    ("fin-bob-key", "input", "Compare our churn this quarter with the last one and explain the difference."),
    ("intern-key", "input", "Explain what a pull request review checklist should contain."),
    ("intern-key", "input", "Translate the onboarding page into German."),
    ("ops-agent-key", "tool_call", '{"path": "docs/runbook.md"}'),
    ("ops-agent-key", "tool_result", "Runbook: restart the worker, then check the queue depth in Datadog."),
    ("alice-agent-key", "tool_call", '{"query": "open issues labelled bug"}'),
    ("alice-agent-key", "tool_result", '[{"number": 31, "title": "Crash on empty cart"}]'),
    ("bob-agent-key", "input", "Prepare a short summary of the meeting with the bank for bob."),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gateway", default="http://127.0.0.1:8787")
    args = ap.parse_args()
    with httpx.Client(base_url=args.gateway, timeout=30) as http:
        for key, direction, text in REQUESTS:
            r = http.post("/v1/guard", headers={"x-api-key": key}, json={"direction": direction, "text": text})
            print(f"{r.json().get('action', r.status_code):7} {key:16} {text[:70]}")


if __name__ == "__main__":
    main()
