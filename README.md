# Shpont Shield Redteam

Two modules that sit next to an AI control layer and answer the two questions a message filter cannot:

- **Poligon**: *how good is the control layer right now, and what did my last config edit just open?*
  It fires a corpus of attacks and legitimate requests at the live layer, continuously, and turns the result into a measured posture score. When the policy or the signature feed changes, it re-fires within seconds and lists the attacks the change let through.
- **Tripwire**: *is someone inside already misusing access?*
  It plants decoys: credentials, records and resources that belong to nobody. Nothing legitimate ever touches one, so a hit is a confirmed incident with a name on it. No model, no threshold, no false positives.

Built against [Shpont-Shield](https://github.com/HackNuggets2026/Shpont-Shield) and needs **no change in its code**: Poligon drives the gateway's admin API, Tripwire publishes its decoys through the signature feed the gateway already consumes.

```mermaid
flowchart LR
  subgraph Redteam[Shpont Shield Redteam :8799]
    C[(corpus<br/>attacks + benign)] --> P[Poligon<br/>fire · score · diff]
    R[(decoy registry<br/>seeded honeytokens)] --> F[feed builder]
    R --> D[drills] --> P
    A[alert store<br/>who tripped what]
    UI[dashboard · report]
  end
  subgraph Shield[Control layer :8787]
    G[gateway pipeline]
    POL[(policy.yaml)]
    AUD[(audit events)]
  end
  M[(managed<br/>signature feed)] --> F
  F -- "/feed/signatures.json" --> G
  P -- "/admin/try (unmetered, unscored)" --> G
  POL -. "edit" .-> G
  G -- "policy + feed version" --> P
  AUD -- "/admin/events" --> A
  P & A --> UI
```

## Three more modules

- **Reach map** (`shield_redteam/reach/`). Reads people, agents, role tool permissions, resource entitlements and agent grants from Shield and finds identities that hold three capabilities at once: reading private data, taking in content written by outsiders, and sending data out. That combination is what turns one planted instruction into a data leak. For each, it names the capability with the fewest sources and ranks single changes (a tool removed from a role, a grant revoked) by how many combinations they break. `GET /api/reach`.
- **What-if** (`shield_redteam/whatif/`). Runs a private copy of Shield (same code, candidate policy, no live traffic) and replays both the corpus and recent real requests through the current and the candidate configuration. Shows the score change, the attacks a change would open or close, and which real people's requests would now be blocked. `POST /api/whatif`, then `POST /api/whatif/apply` to write the change to the live policy file. Real requests are replayed unmasked only when the policy keeps raw audit text (`plant --record-raw`, demo only); otherwise masked text is replayed.
- **Autopatch** (`shield_redteam/autopatch/`). For every attack that gets through, writes a signature from a phrase of that attack which no legitimate test message contains, then proves it in the sandbox: it must stop the attack and block no legitimate test message or real request that was not blocked before. Proven patches are applied with one click and published through the same signature feed Shield already reads. `GET /api/patches`, `POST /api/patches/apply`, `POST /api/patches/revert`. Disguised (encoded, spaced-out) variants need input normalisation in Shield, which one pattern cannot provide.

## The dashboard

`/` is a React app (`web/`: React, TypeScript, Tailwind, shadcn/ui, Recharts) with a left navigation, light and dark themes, and five sections. Every block is titled with the question it answers and is drawn from the live layer. The built bundle ships inside the Python package, so there is no Node at runtime.

| Section | Shows | Wired to |
|---|---|---|
| **Overview** | four key numbers; the score ring; a pipeline drawing (attacks and normal requests pass five stages; each lane narrows by what a stage caught, and the safeguards under each stage are switches); score per run with a dot on every settings change and a change log that opens the affected attacks; live test messages | the last corpus run and Poligon's change log; clicking a safeguard under a stage switches it off |
| **Safeguards** | every control grouped by stage, with a switch and a stopped / got-through bar | the switch flips `enabled` in Shield's real policy file, the corpus is re-fired, a toast offers undo |
| **Attacks** | coverage map (attack type by channel), disguise radar, filterable lists of attacks that pass, wrong blocks and evasions, with a detail drawer per case | per-case outcomes and evasion mutants |
| **Traps** | one card per Tripwire decoy with "Simulate theft", and an incident timeline naming who used it | a real request with an agent key, then Shield's audit trail |
| **Playground** | write any message, pick the channel, see which safeguard reacted and how fast | the live layer, unmetered |
| **Reach map** | who can reach what, the identities holding all three dangerous capabilities, and the single changes that break them | Shield's identities, roles, entitlements and grants |
| **What-if** | draft a settings change, preview it on test attacks and real requests, then apply it | a sandboxed copy of Shield |
| **Autopatch** | proposed rules with their proof (score before and after, cases closed, legitimate requests affected), apply and revert | the sandbox, then the signature feed |

`/console` shows the same data as five tabs inside the Shield security console shell: Redteam's part there is one file, `shield_redteam/server/static/console/views/redteam.js`, written against Shield's `docs/console-contract.md`. To merge into Shield: copy it into `controllayer/dashboard/views/`, add its script tag to `panel.html`, set `window.REDTEAM_API` to the Redteam service.

The switches need `target.policy_file` in `redteam.yaml` (set by `demo/up.sh`); the theft button needs `target.demo_agent_key`.

## Quick start

```bash
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m pytest          # 58 tests, ~2 s; 4 of them run against the real Shield in-process

# Shield checked out next to this repo, with its own .venv (see its README):
demo/up.sh                          # starts both, decoys planted
.venv/bin/python demo/intruder.py   # a scripted break-in: 6 of 7 steps stopped, 1 passes by design
.venv/bin/shield-redteam run          # one corpus run in the terminal; --min-posture 85 for CI
```

Open http://127.0.0.1:8799/, then edit `.run/policy.yaml` (set a control's `mode: log`, raise a threshold, delete a signature from the feed). The score and the "What the last settings change did" card update within about three seconds.

## Poligon

| Number | Meaning |
|---|---|
| **protection** | share of attacks stopped (blocked or redacted) |
| **friction** | share of legitimate requests stopped: what the guardrails cost developers |
| **evasion** | share of rewritten attacks still stopped, counted only for attacks whose original is stopped |
| **posture** | `protection x (1 - friction)`, 0 to 100. Blocking everything scores 0, and so does blocking nothing |

- **Corpus** (`corpus/`): YAML, one file per attack class. `attacks/` must be stopped, `benign/` must pass. `benign/hard.yaml` holds legitimate requests that use security vocabulary, which is where over-eager guardrails show. Add a case by adding three lines.
- **Mutators** (`poligon/mutate.py`): upper-case, leetspeak, homoglyphs, zero-width characters, letter spacing, base64 wrapping, role-play framing. Classes whose payload a rewrite would destroy (keys, card numbers, exploit strings) are marked `mutable: false`.
- **Impact of a change**: every re-run is compared with the previous one case by case. The log names the attacks that opened or closed, the false positives that appeared or went away, and which part of the configuration changed (policy, feed, controls, semantic backend, insider-risk levels).
- **Feed self-test**: a signature may carry `tests: {match: [...], clean: [...]}`. One that does not compile, misses its own example or fires on clean text is reported as broken (`shield-redteam feed --check`).

Self-test traffic goes through the gateway's `/admin/try`, which runs the full pipeline but spends no budget and adds no insider-risk points.

## Tripwire

| Class | What it is | Trips on |
|---|---|---|
| **trap** | a credential or resource nobody has a reason to touch | any sighting, in any direction |
| **marker** | a fake record inside real data | `tool_call` only: reading it is normal work, moving it on is not |
| **canary** | a string placed in a system prompt | `output` and `tool_call`: the hidden instructions leaked |

Honeytokens are derived from a seed with HMAC (`tripwire/tokens.py`): the same seed gives the same tokens after a restart, and they cannot be guessed without it. Each decoy becomes one signature in the feed. The pattern requires only the letters and digits in order, so `A K I A ...`, a dash-less or a lower-cased copy still trips, and the base64, hex, reversed and URL-encoded forms are matched too.

Alerts come from the control layer's own audit trail, so they carry principal, team, role, channel, direction and tool. Trips caused by Poligon's drills are counted separately and never raise an incident.

```bash
.venv/bin/shield-redteam tokens            # what is planted, values masked
.venv/bin/shield-redteam tokens --reveal   # full values, e.g. to paste the canary into a system prompt
.venv/bin/shield-redteam plant --policy ../Shpont-Shield/policy.yaml --out .run/policy.yaml
```

## Configuration

Everything is in [`redteam.yaml`](redteam.yaml): the target, the corpus, the decoys and where each one is planted.

## Endpoints

| Endpoint | For |
|---|---|
| `/` | the dashboard |
| `/console` | the same data as tabs in the Shield console shell |
| `/api/stage` | controls in evaluation order with live state, and where each payload stopped |
| `/feed/signatures.json` | the managed feed plus one signature per decoy; point the control layer's `signatures.feed` here |
| `/api/state` | everything the dashboard shows, as JSON |
| `/api/report.md`, `/api/report.json` | posture report for management and for the security team |
| `POST /api/run` | fire the corpus now |
| `POST /api/control`, `/api/try`, `/api/steal` | the three hands-on actions of the panel |
| `POST /api/scan` | check any text against the decoys directly (SDK-style use, no gateway needed) |

## What was measured on Shield

With the shipped policy and the keyword stand-in for the decision model (no GPU), on a laptop:

| | |
|---|---|
| posture | 91.4 / 100 |
| protection | 69 of 73 attacks stopped |
| friction | 1 of 30 legitimate requests stopped |
| evasion | 92 of 203 rewrites stopped |
| a full run | 320 cases in 0.4 s, in-layer p95 2.9 ms |

The four open attacks, the false positive and the weak evasion techniques (base64 wrapping, letter spacing, homoglyphs, leetspeak) are listed on the dashboard and in [docs/findings.md](docs/findings.md). They are expected to move once the real decision models replace the keyword stand-in.

## Limits

- Poligon measures against the corpus it has. A score of 100 means "stops everything we know", not "secure".
- `/admin/try` takes no tool name or model, so tool-RBAC and model-allowlist rules are not exercised by the corpus yet.
- Self-test runs appear in the control layer's audit trail under the `dashboard` channel.
- A decoy only catches what touches it. It complements content inspection, it does not replace it.
- State is in memory, except tripwire alerts, which are appended to `data/tripwire-alerts.jsonl`.

See [docs/architecture.md](docs/architecture.md) for the layout and the seams left for the next modules.
