"""shield-redteam: serve the dashboard, run the corpus once, or prepare a policy with decoys."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load
from .core import yamlio
from .core.target import GatewayTarget
from .poligon import corpus
from .poligon.feedcheck import check_feed
from .poligon.mutate import mutants
from .poligon.runner import run
from .poligon.score import report
from .tripwire.drills import drill_cases
from .tripwire.feed import build_feed
from .tripwire.plant import patch_policy
from .tripwire.registry import Registry


def _pct(x: float | None) -> str:
    return " n/a" if x is None else f"{x * 100:5.1f}%"


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .server.app import create_app

    cfg = load(args.config)
    uvicorn.run(create_app(cfg), host=cfg.server["host"], port=int(cfg.server["port"]), log_level="warning")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    cfg = load(args.config)
    cases = corpus.load_dir(cfg.resolve(cfg.poligon["corpus"]))
    cases += drill_cases(Registry.from_config(cfg.tripwire))
    if cfg.poligon["mutate"] and not args.no_mutants:
        cases += mutants(cases)
    target = GatewayTarget(cfg.target["url"], cfg.target["admin_token"])
    rep = report(run(target, cases, workers=int(cfg.poligon["workers"])))
    if args.json:
        print(json.dumps(rep, indent=2))
    else:
        a, b, m, lat = rep["attacks"], rep["benign"], rep["mutants"], rep["latency_ms"]
        print(f"target        {target.name}   config {rep['fingerprint'].split('|')[0]}")
        print(f"posture       {rep['posture']} / 100")
        print(f"protection   {_pct(rep['protection'])}  {a['stopped']}/{a['total']} attacks stopped")
        print(f"friction     {_pct(rep['friction'])}  {b['stopped']}/{b['total']} benign stopped")
        print(f"evasion      {_pct(rep['evasion'])}  {m['stopped']}/{m['total']} mutants stopped")
        print(f"latency       p50 {lat['p50']} ms   p95 {lat['p95']} ms   ({rep['cases']} cases, {rep['seconds']} s)")
        print()
        print(f"{'category':28} {'attacks':>8} {'stopped':>8} {'benign':>7} {'false+':>7}")
        for g in rep["by_category"]:
            print(f"{g['name']:28} {g['attacks']:>8} {g['stopped']:>8} {g['benign']:>7} {g['false_positives']:>7}")
        for title, key in (("OPEN ATTACKS", "open_attacks"), ("FALSE POSITIVES", "false_positives")):
            if rep[key]:
                print(f"\n{title}")
                for o in rep[key]:
                    print(f"  {o['id']:32} {o['action']:7} {o['text'][:70]}")
    if rep["errors"]:
        print(f"\n{rep['errors']} cases errored (is the gateway reachable?)", file=sys.stderr)
        return 2
    if args.min_posture is not None and (rep["posture"] or 0) < args.min_posture:
        print(f"\nposture {rep['posture']} is below the required {args.min_posture}", file=sys.stderr)
        return 1
    return 0


def cmd_feed(args: argparse.Namespace) -> int:
    from .server.app import load_base_feed

    cfg = load(args.config)
    base, err = load_base_feed(cfg)
    feed = build_feed(base, Registry.from_config(cfg.tripwire))
    if args.check:
        res = check_feed(feed)
        for row in res["rows"]:
            print(
                f"{'ok ' if row['ok'] else 'BAD'} {row['id']:28} vectors={row['vectors']} {'; '.join(row['problems'])}"
            )
        return 1 if res["broken"] or err else 0
    print(json.dumps(feed, indent=2))
    return 0


def cmd_tokens(args: argparse.Namespace) -> int:
    cfg = load(args.config)
    for d in Registry.from_config(cfg.tripwire).decoys:
        value = d.value if args.reveal else d.public()["value_masked"]
        print(f"{d.id:22} {d.cls:7} {d.kind:13} {value:44} {d.planted_in}")
    return 0


def cmd_plant(args: argparse.Namespace) -> int:
    cfg = load(args.config)
    registry = Registry.from_config(cfg.tripwire)
    policy = yamlio.load(Path(args.policy))
    url = args.feed_url or f"http://{cfg.server['host']}:{cfg.server['port']}/feed/signatures.json"
    patched, notes = patch_policy(policy, registry, cfg.tripwire["decoys"], url, args.refresh)
    if args.record_raw:
        # Demo only: keep request text unmasked in the audit trail, so What-if can replay it exactly.
        if patched.get("audit") is None:
            patched["audit"] = {}
        patched["audit"]["store_raw_text"] = True
        notes.append("audit.store_raw_text -> true (demo: lets What-if replay real requests unmasked)")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(yamlio.dumps(patched))
    for n in notes:
        print(n)
    print(f"wrote {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="shield-redteam")
    ap.add_argument("-c", "--config", default="redteam.yaml")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("serve", help="dashboard, signature feed and continuous self-attack").set_defaults(fn=cmd_serve)
    r = sub.add_parser("run", help="fire the corpus once and print the posture")
    r.add_argument("--json", action="store_true")
    r.add_argument("--no-mutants", action="store_true")
    r.add_argument("--min-posture", type=float, help="exit 1 if the posture score is below this (for CI)")
    r.set_defaults(fn=cmd_run)
    f = sub.add_parser("feed", help="print the merged signature feed, or self-test it with --check")
    f.add_argument("--check", action="store_true")
    f.set_defaults(fn=cmd_feed)
    t = sub.add_parser("tokens", help="list decoys")
    t.add_argument("--reveal", action="store_true", help="show full honeytoken values")
    t.set_defaults(fn=cmd_tokens)
    p = sub.add_parser("plant", help="write a copy of a control-layer policy with decoys planted")
    p.add_argument("--policy", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--feed-url")
    p.add_argument("--refresh", type=int, default=2)
    p.add_argument("--record-raw", action="store_true", help="demo only: keep unmasked request text for What-if")
    p.set_defaults(fn=cmd_plant)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
