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
  server/        FastAPI app, console views (static/console/views/redteam.js), hands-on actions, Markdown report
  config.py      redteam.yaml
  cli.py         serve | run | feed | tokens | plant
corpus/          attacks/*.yaml, benign/*.yaml
tests/           unit tests on a fake layer + integration tests on the real Shield
demo/            up.sh, intruder.py
```

## Two seams, on purpose

1. **`Target`** is the only thing Poligon knows about the control layer: `evaluate(case)`, `fingerprint()`, `describe()`, `events()`. `GatewayTarget` speaks HTTP to a running gateway. `CallableTarget` wraps a function, which is how the modules run inside the control layer after the repositories are merged: `layer.evaluate(Context(..., metered=False, scored=False))`.
2. **The signature feed** is the only way Tripwire reaches into enforcement. Decoys are published as ordinary signatures with category `tripwire`, so the control layer applies its own mode, shadow flag, audit masking and reporting to them.

Neither seam requires a change in Shield.

## Merging into Shield

| This repo | Lands in Shield as |
|---|---|
| `shield_redteam/poligon/` | `controllayer/poligon/`, with an in-process target |
| `shield_redteam/tripwire/` | `controllayer/tripwire/`, registry configured under a `tripwire:` key in `policy.yaml` |
| `redteam.yaml` decoys | `policy.yaml` section, hot-reloaded with everything else |
| `static/console/views/redteam.js` | `controllayer/dashboard/views/redteam.js`, five tabs in the security console |
| `corpus/` | `tests/corpus/`, run by `pytest` and by the live service |

Two small requests to Shield that would remove the current limits: let `/admin/try` accept `tool` and `model`, and tag self-test events with their own channel.

## Seams for the next modules

Each planned module is a new package next to `poligon/` and `tripwire/`, reusing `core/`. None needs a redesign of what exists.

| Module | Idea | What it reuses |
|---|---|---|
| **Memory Firewall** | provenance label on every memory write; content from an untrusted source comes back as data, never as an instruction | `Case.direction` gains `memory_write` / `memory_read`; Poligon gets a `memory_poisoning` corpus class; Tripwire markers planted in memory show who recalled them |
| **Mandate** | permissions derived from the task, narrowed at every agent-to-agent hop | `Target.evaluate` already carries principal and direction; a mandate token becomes one more field on `Case`; Poligon corpus class `out_of_mandate` |
| **Waterline** | a budget for data exposure, summed over time | Tripwire's detector is already a content-fingerprint matcher: the same squeezed-form matching tracks real sensitive values from source to sink; alerts become a running exposure counter per principal |

Poligon is the common ground: every new control ships with corpus cases, and the posture score picks them up without code changes.
