"""The Redteam service: runs Poligon and Tripwire next to a control layer and reports on both."""

from __future__ import annotations

import contextlib
import json
import threading
import time
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from ..autopatch.propose import candidates
from ..autopatch.store import PatchStore
from ..config import Config
from ..core import yamlio
from ..core.target import GatewayTarget, Target
from ..core.types import DIRECTIONS, Case
from ..poligon import corpus
from ..poligon.feedcheck import check_feed
from ..poligon.service import Poligon
from ..reach.graph import build as build_reach
from ..tripwire.alerts import AlertStore
from ..tripwire.detector import Detector
from ..tripwire.drills import drill_cases
from ..tripwire.feed import build_feed
from ..tripwire.registry import Registry
from ..whatif.preview import preview
from ..whatif.sandbox import SandboxUnavailable, apply_changes
from .demo import NotSwitchable, set_enabled, switchable, theft_payload
from .report import markdown
from .stage import outcome_rows, place, rings, traffic_rows

STATIC = Path(__file__).parent / "static"
JsonBody = Annotated[dict[str, Any], Body()]
REAL_CHANNELS = ("sdk", "chat", "mcp", "api", "anthropic")
REAL_KEEP = 1000


def load_base_feed(cfg: Config) -> tuple[dict[str, Any] | None, str]:
    loc = cfg.tripwire.get("base_feed")
    if not loc:
        return None, ""
    try:
        if str(loc).startswith(("http://", "https://")):
            return httpx.get(loc, timeout=5).json(), ""
        return json.loads(cfg.resolve(loc).read_text()), ""
    except Exception as e:  # noqa: BLE001 - a broken base feed must not take the decoys down with it
        return None, f"base feed {loc!r} unavailable: {type(e).__name__}: {e}"


def create_app(cfg: Config, target: Target | None = None, background: bool = True) -> FastAPI:
    target = target or GatewayTarget(cfg.target["url"], cfg.target["admin_token"])
    registry = Registry.from_config(cfg.tripwire)
    detector = Detector(registry)
    sink = cfg.tripwire.get("alerts")
    alerts = AlertStore(registry, cfg.resolve(sink) if sink else None)
    pol = cfg.poligon
    poligon = Poligon(
        target,
        corpus.load_dir(cfg.resolve(pol["corpus"])) + drill_cases(registry),
        mutate=bool(pol["mutate"]),
        interval=float(pol["interval_seconds"]),
        workers=int(pol["workers"]),
    )
    stop = threading.Event()
    patches = PatchStore(cfg.resolve("data/patches.json"))
    proposals: dict[str, Any] = {"fingerprint": None, "items": [], "busy": False, "error": ""}
    policy_file = cfg.resolve(cfg.target["policy_file"]) if cfg.target["policy_file"] else None

    recent: dict[str, Any] = {"events": []}
    # Real requests (not self-test), kept here because the control layer's in-memory event ring is soon
    # filled by self-test traffic. Newest first, at most REAL_KEEP.
    real: dict[str, dict[str, Any]] = {}

    def poll_alerts() -> None:
        with contextlib.suppress(Exception):
            recent["events"] = target.events(2000)
            alerts.ingest(recent["events"])
        with contextlib.suppress(Exception):
            for channel in REAL_CHANNELS:
                for e in target.events(300, channel=channel):
                    real.setdefault(str(e.get("request_id")), e)
            if len(real) > REAL_KEEP:
                for rid, _ in sorted(real.items(), key=lambda kv: kv[1].get("ts", 0))[: len(real) - REAL_KEEP]:
                    real.pop(rid, None)

    def real_events() -> list[dict[str, Any]]:
        return sorted(real.values(), key=lambda e: -float(e.get("ts", 0)))

    def loop() -> None:
        while not stop.is_set():
            with contextlib.suppress(Exception):
                poligon.tick()
            poll_alerts()
            stop.wait(1.0)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        thread = threading.Thread(target=loop, daemon=True) if background else None
        if thread:
            thread.start()
        yield
        stop.set()

    app = FastAPI(title="Shpont Shield Redteam", lifespan=lifespan)

    @app.middleware("http")
    async def same_origin_writes(request: Request, call_next):
        """POSTs here flip Shield's safeguards, so only this page may send them.

        Requiring application/json makes a cross-site browser request trigger a CORS preflight, which
        this server never answers; a present Origin must also be this server's own.
        """
        if request.method == "POST":
            ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
            if ctype != "application/json":
                return JSONResponse({"error": "send JSON (content-type: application/json)"}, status_code=415)
            origin = request.headers.get("origin")
            if origin and origin.split("://", 1)[-1] != request.headers.get("host", ""):
                return JSONResponse({"error": "cross-origin request refused"}, status_code=403)
        return await call_next(request)

    app.state.poligon, app.state.alerts, app.state.registry = poligon, alerts, registry
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    app.mount("/app", StaticFiles(directory=STATIC / "app"), name="app")

    def feed() -> tuple[dict[str, Any], str]:
        base, err = load_base_feed(cfg)
        merged = build_feed(base, registry)
        applied = patches.signatures()
        if applied:
            merged["signatures"] += applied
            merged["feed_version"] += f"+patch.{len(applied)}"
        return merged, err

    def all_cases() -> list[Case]:
        return poligon.cases

    def require_policy_file() -> Path:
        if not policy_file:
            raise HTTPException(409, "set target.policy_file in redteam.yaml to preview or apply changes")
        return policy_file

    @app.get("/feed/signatures.json")
    def feed_json():
        return JSONResponse(feed()[0])

    @app.get("/api/state")
    def state():
        merged, feed_error = feed()
        try:
            info = target.describe()
        except Exception as e:  # noqa: BLE001
            info = {"name": getattr(target, "name", "?"), "error": f"{type(e).__name__}: {e}"}
        applied = (info.get("feed") or {}).get("version")
        return {
            "now": time.time(),
            "target": info,
            "poligon": poligon.state(),
            "tripwire": {
                **alerts.state(),
                "feed_version": merged["feed_version"],
                "feed_applied": applied == merged["feed_version"],
                "feed_error": feed_error,
            },
            "feedcheck": check_feed(merged),
        }

    @app.get("/admin/summary")
    def shield_summary():
        """What the console shell needs for its header. Standalone, Redteam relays it from the control layer."""
        try:
            info = target.describe()
        except Exception:  # noqa: BLE001
            return {"policy": {}}
        return {
            "policy": info.get("policy") or {},
            "feed": info.get("feed") or {},
            "semantic": info.get("semantic") or {},
        }

    @app.get("/api/stage")
    def stage():
        try:
            info = target.describe()
        except Exception as e:  # noqa: BLE001
            info = {"name": getattr(target, "name", "?"), "error": f"{type(e).__name__}: {e}"}
        ring_list = rings(info)
        doc = info.get("policy_doc") or {}
        for ring in ring_list:
            for seg in ring["segments"]:
                seg["switchable"] = bool(policy_file) and switchable(seg["id"], doc)
        st, tw = poligon.state(), alerts.state()
        rep = st["report"] or {}
        tripped: dict[str, list[dict[str, Any]]] = {}
        for a in tw["alerts"]:
            tripped.setdefault(a["decoy"], []).append(a)
        change = st["changes"][0] if st["changes"] else None
        return {
            "now": time.time(),
            "target": {
                "name": info.get("name"),
                "error": info.get("error") or st["error"],
                "policy": (info.get("policy") or {}).get("version"),
                "policy_error": (info.get("policy") or {}).get("last_error"),
                "feed": (info.get("feed") or {}).get("version"),
                "semantic": (info.get("semantic") or {}).get("backend"),
            },
            "rings": ring_list,
            "can_switch": bool(policy_file),
            "can_steal": bool(cfg.target["demo_agent_key"]),
            "corpus": st["corpus"],
            "run": st["runs"],
            "kpi": {
                k: rep.get(k)
                for k in ("posture", "protection", "friction", "evasion", "cases", "seconds", "latency_ms")
            }
            | {"attacks": rep.get("attacks"), "benign": rep.get("benign"), "incidents": tw["incidents"]},
            "history": [h["posture"] for h in st["history"]],
            "outcomes": outcome_rows(poligon.last.outcomes, ring_list) if poligon.last else [],
            "change": change
            and {
                "ts": change["ts"],
                "before": change["posture_before"],
                "after": change["posture_after"],
                "opened": len(change["opened"]),
                "closed": len(change["closed"]),
                "new_false_positives": len(change["new_false_positives"]),
                "by_category": change["opened_by_category"],
                "cause": change["cause"],
            },
            "decoys": [
                {**d, "trips": len(tripped.get(d["id"], [])), "last": (tripped.get(d["id"]) or [None])[0]}
                for d in tw["decoys"]
            ],
            "alerts": tw["alerts"][:12],
            "traffic": traffic_rows(recent["events"], ring_list),
        }

    @app.post("/api/control")
    def control(body: JsonBody):
        """Switch one safeguard on or off in the control layer's policy file, then re-test at once."""
        if not policy_file:
            return JSONResponse(
                {"error": "set target.policy_file in redteam.yaml to use the switches"}, status_code=409
            )
        try:
            set_enabled(policy_file, str(body.get("id")), bool(body.get("enabled")))
        except NotSwitchable as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        with contextlib.suppress(Exception):
            target.reload()
        poligon.tick()
        return {"ok": True}

    @app.post("/api/try")
    def try_text(body: JsonBody):
        """Evaluate a visitor's own text on the live control layer (unmetered, unscored)."""
        direction = body.get("direction", "input")
        if direction not in DIRECTIONS:
            return JSONResponse({"error": f"direction must be one of {list(DIRECTIONS)}"}, status_code=400)
        d = target.evaluate(Case("visitor", "attack", "visitor", str(body.get("text", "")), direction=direction))
        ring_list = rings(target.describe())
        seg = place(d.findings, "", ring_list)[1] if d.stopped else None
        label = next((s["label"] for r in ring_list for s in r["segments"] if s["id"] == seg), seg)
        seen = sorted({f"{f.get('control')}/{f.get('category')}" for f in d.findings})
        return {
            "action": d.action,
            "stopped": d.stopped,
            "by": label,
            "findings": seen,
            "ms": round(d.latency_ms, 2),
            "error": d.error,
        }

    @app.post("/api/steal")
    def steal(body: JsonBody):
        """Act as an agent that sends a decoy value out through a tool call: a real request, a real incident."""
        decoy = registry.get(str(body.get("decoy")))
        key = cfg.target["demo_agent_key"]
        if decoy is None or not key:
            return JSONResponse({"error": "unknown decoy, or target.demo_agent_key is not set"}, status_code=400)
        direction = "tool_call" if "tool_call" in decoy.directions else decoy.directions[0]
        d = target.guard(key, direction, theft_payload(decoy.value), "http_get")
        poll_alerts()
        return {"action": d.action, "stopped": d.stopped, "error": d.error}

    # ---- reach map ----------------------------------------------------------------------

    def with_directory(doc: dict[str, Any]) -> dict[str, Any]:
        """Add the people of the policy's identity.directory (e.g. the Common-Database organisation)."""
        rel = (doc.get("identity") or {}).get("directory")
        if not rel or not policy_file:
            return doc
        path = Path(rel) if Path(rel).is_absolute() else policy_file.parent / rel
        try:
            extra = json.loads(path.read_text()).get("api_keys", {})
        except (OSError, ValueError):
            return doc
        identity = dict(doc.get("identity") or {})
        identity["api_keys"] = {**extra, **(identity.get("api_keys") or {})}
        return {**doc, "identity": identity}

    @app.get("/api/reach")
    def reach():
        info = target.describe()
        return build_reach(with_directory(info.get("policy_doc") or {}), target.grants(), cfg.reach)

    # ---- what-if: preview a settings change on the corpus and on real traffic -------------

    @app.post("/api/whatif")
    def whatif(body: JsonBody):
        try:
            return preview(
                cfg.shield_path,
                require_policy_file(),
                feed()[0],
                all_cases(),
                real_events(),
                changes=list(body.get("changes") or []),
            )
        except (SandboxUnavailable, KeyError) as e:
            raise HTTPException(400, str(e)) from e

    @app.post("/api/whatif/apply")
    def whatif_apply(body: JsonBody):
        path = require_policy_file()
        doc = yamlio.load(path)
        try:
            apply_changes(doc, list(body.get("changes") or []))
        except KeyError as e:
            raise HTTPException(400, str(e)) from e
        yamlio.write_atomic(path, doc)
        with contextlib.suppress(Exception):
            target.reload()
        poligon.tick()
        return {"ok": True}

    # ---- autopatch: proposals proven in a sandbox, applied through the feed ----------------

    def compute_proposals() -> None:
        rep = poligon.last_report
        try:
            if not rep or not policy_file:
                proposals["items"], proposals["error"] = [], "" if rep else "waiting for the first run"
                return
            by_id = {c.id: c for c in all_cases()}
            opened = [by_id[o["id"]] for o in rep["open_attacks"] if o["id"] in by_id]
            base = [c for c in all_cases() if not c.parent]
            cands = candidates(opened, [c for c in base if not c.must_stop], [c for c in base if c.must_stop])
            items = []
            for sig in cands:
                proof = preview(
                    cfg.shield_path, policy_file, feed()[0], all_cases(), real_events(), extra_signatures=[sig]
                )
                closed = [o["id"] for o in proof["impact"]["closed"]]
                new_fp = proof["impact"]["new_false_positives"] + proof["traffic"]["newly_stopped"]
                items.append(
                    {
                        "signature": sig,
                        "case": sig["case"],
                        "before": proof["before"]["posture"],
                        "after": proof["after"]["posture"],
                        "closed": closed,
                        "new_false_positives": len(new_fp),
                        "proven": sig["case"] in closed and not new_fp,
                        "real_requests_checked": proof["traffic"]["replayed"],
                    }
                )
            proposals["items"], proposals["error"] = items, ""
        except Exception as e:  # noqa: BLE001 - shown on the page, never fatal
            proposals["items"], proposals["error"] = [], f"{type(e).__name__}: {e}"
        finally:
            proposals["fingerprint"] = rep and rep["fingerprint"]
            proposals["busy"] = False

    @app.get("/api/patches")
    def patches_state():
        rep = poligon.last_report
        if rep and proposals["fingerprint"] != rep["fingerprint"] and not proposals["busy"]:
            proposals["busy"] = True
            threading.Thread(target=compute_proposals, daemon=True).start()
        applied = {p["signature"]["id"] for p in patches.all()}
        return {
            "busy": proposals["busy"],
            "error": proposals["error"],
            "applied": patches.all(),
            "proposals": [p for p in proposals["items"] if p["signature"]["id"] not in applied],
        }

    @app.post("/api/patches/apply")
    def patch_apply(body: JsonBody):
        item = next((p for p in proposals["items"] if p["signature"]["id"] == body.get("id")), None)
        if item is None:
            raise HTTPException(404, "no such proposal; refresh the list")
        if not item["proven"] and not body.get("force"):
            raise HTTPException(
                409, "this patch is not proven; it would block legitimate requests or does not close its case"
            )
        patches.add(item["signature"], {k: v for k, v in item.items() if k != "signature"})
        proposals["fingerprint"] = None
        return {"ok": True}

    @app.post("/api/patches/revert")
    def patch_revert(body: JsonBody):
        if not patches.remove(str(body.get("id"))):
            raise HTTPException(404, "no such applied patch")
        proposals["fingerprint"] = None
        return {"ok": True}

    @app.post("/api/run")
    def run_now():
        return poligon.run_now()

    @app.post("/api/scan")
    def scan(body: JsonBody):
        hits = detector.scan(str(body.get("text", "")), body.get("direction"))
        return {"tripped": bool(hits), "hits": [h.as_dict() for h in hits]}

    @app.get("/api/report.json")
    def report_json():
        return {"poligon": poligon.state(), "tripwire": alerts.state(), "feedcheck": check_feed(feed()[0])}

    @app.get("/api/report.md", response_class=PlainTextResponse)
    def report_md():
        return markdown(poligon.state(), alerts.state(), check_feed(feed()[0]))

    @app.get("/")
    def index():
        """The dashboard: a React app built from web/ into static/app (see web/README.md)."""
        return FileResponse(STATIC / "app" / "index.html")

    @app.get("/console")
    def console():
        """The same data as tabs inside the Shield security console shell (the merge path)."""
        return FileResponse(STATIC / "console" / "index.html")

    return app
