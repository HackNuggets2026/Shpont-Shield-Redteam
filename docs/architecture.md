# Architecture

## Layout

```
shield_redteam/
  core/          shared by every module
    types.py     Case, Decision, Outcome, the enforcement ladder
    target.py    Target protocol; GatewayTarget (HTTP), CallableTarget (in-process)
  poligon/       corpus -> runner -> score (report, impact) -> service (re-fire on change)
    mutate.py    evasion rewrites
    feedcheck.py signature feed self-test
  tripwire/      tokens -> registry -> detector | feed | plant | drills | alerts
  reach/         capability graph and single-change fixes from Shield's identities and grants
  whatif/        sandboxed copy of Shield; preview of a change on the corpus and real requests
  autopatch/     signatures written from open attacks, proven in the sandbox, stored for the feed
  referee/       adapters for the team's other gateways; one corpus against all of them, side by side
  memory/        memory API for agents: provenance, quarantine via Shield, labelled recall, namespaces
  trail/         values read from tool results, published as tool_call-only signatures, linked to stopped attempts
  server/        FastAPI app, console views (static/console/views/redteam.js), hands-on actions, Markdown report
  config.py      redteam.yaml
  cli.py         serve | run | feed | tokens | plant
corpus/          attacks/*.yaml, benign/*.yaml
tests/           unit tests on a fake layer + integration tests on the real Shield
web/             the dashboard source (React + Tailwind + shadcn/ui); builds into shield_redteam/server/static/app
demo/            up.sh, referee-up.sh, traffic.py, trail.py, intruder.py
```

## Two seams, on purpose

1. **`Target`** is the only thing Poligon knows about the control layer: `evaluate(case)`, `fingerprint()`, `describe()`, `events()`. `GatewayTarget` speaks HTTP to a running gateway. `CallableTarget` wraps a function, which is how the modules run inside the control layer after the repositories are merged: `layer.evaluate(Context(..., metered=False, scored=False))`.
2. **The signature feed** is the only way Tripwire, Data trail and Autopatch reach into enforcement. Decoys, traced values and proven patches are published as ordinary signatures (categories `tripwire`, `trail`, `autopatch`), so the control layer applies its own mode, shadow flag, audit masking and reporting to them. The feed carries traced customer values, so it requires a token.

Neither seam requires a change in Shield.

## Merging into Shield

| This repo | Lands in Shield as |
|---|---|
| `shield_redteam/poligon/` | `controllayer/poligon/`, with an in-process target |
| `shield_redteam/tripwire/` | `controllayer/tripwire/`, registry configured under a `tripwire:` key in `policy.yaml` |
| `redteam.yaml` decoys | `policy.yaml` section, hot-reloaded with everything else |
| `static/console/views/redteam.js` | `controllayer/dashboard/views/redteam.js`, five tabs in the security console |
| `shield_redteam/memory/`, `trail/` | `controllayer/memory/`, `controllayer/trail/`, in-process instead of over the admin API |
| `corpus/` | `tests/corpus/`, run by `pytest` and by the live service |

Two small requests to Shield that would remove the current limits: let `/admin/try` accept `tool` and `model`, and tag self-test events with their own channel.

## Seams for the next modules

Each planned module is a new package next to the others, reusing `core/`. Memory Firewall, planned here earlier, is built as `memory/`; Waterline's source-to-sink matching is built as `trail/`.

| Module | Idea | What it reuses |
|---|---|---|
| **Mandate** | permissions derived from the task, narrowed at every agent-to-agent hop | `Target.evaluate` already carries principal and direction; a mandate token becomes one more field on `Case`; Poligon corpus class `out_of_mandate` |
| **Exposure budget** | the amount of customer data each principal moved, summed over time, with a limit | `trail/` already links every traced value to who read it and who tried to move it; incidents become a running counter per principal |

Poligon is the common ground: every new control ships with corpus cases, and the posture score picks them up without code changes.
