# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon judges for the "AI Control Layer" task (HackYeah 2026, partner Goldman Sachs): security engineers and managers who evaluate many submissions quickly. Most first see the project as an animated GIF in the GitHub README and a 10-slide PDF; some later run it, type their own prompts and edit the policy file live. Secondary: a security team operating the control layer.

## Product Purpose

Shpont Probe sits next to an AI control layer (Shpont-Shield) and proves how good it is. Poligon fires a corpus of attacks and legitimate requests at the live layer, continuously, and turns the result into a measured posture score. Tripwire plants decoys that nothing legitimate touches. Success: a judge understands in about ten seconds that editing one line of the policy has a measured, named consequence.

## Positioning

Other submissions show a filter and claim it works. This one measures the filter against itself after every configuration change and names the attacks the change opened.

## Operating Context

- First contact is a short looping screen recording embedded in a README, viewed at roughly 800 px wide, without sound or narration.
- Live use: a laptop next to a judge who edits `policy.yaml` or the signature feed and watches the reaction within about three seconds.
- Everything runs locally; no paid APIs.

## Capabilities and Constraints

- Live data from `/api/stage`: controls in evaluation order with their state (enforcing, log-only, shadow, off), per-payload outcomes, posture, impact of the last configuration change, decoys and incidents, real traffic.
- Judging criteria: robustness of guardrails 30%, architecture and performance 20%, security reporting 20%, self-testing suite 15-20%, implementability 10-15%.
- Single static HTML file served by FastAPI, no build step.

## Brand Commitments

Name: Shpont (team HackNuggets). The user rejected: dark neon "hacker" radar, a conventional tile dashboard, anything that needs narration to read, anything toy-like. It must not look like a typical AI-generated interface.

## Evidence on Hand

Measured on Shield with the keyword stand-in for the decision model: posture 91.4/100, 69 of 73 attacks stopped, 1 of 30 legitimate requests stopped, 92 of 203 rewrites stopped, 320 payloads in 0.4 s. A two-control policy edit moved posture 91.4 to 62.2 and opened 61 attacks. No customers, no production deployment.

## Product Principles

1. The config edit and its consequence are shown together, never one without the other.
2. Every number on screen is measured from the live layer.
3. Readable without explanation at README size.
4. Honest about what gets through.
