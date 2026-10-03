"""The Redteam service: runs Poligon and Tripwire next to a control layer and reports on both."""

from __future__ import annotations

import contextlib
import json
import threading
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from ..config import Config
from ..core.target import GatewayTarget, Target
from ..core.types import DIRECTIONS, Case
from ..poligon import corpus
from ..poligon.feedcheck import check_feed
from ..poligon.service import Poligon
from ..tripwire.alerts import AlertStore
from ..tripwire.detector import Detector
from ..tripwire.drills import drill_cases
from ..tripwire.feed import build_feed
from ..tripwire.registry import Registry
from .demo import NotSwitchable, set_enabled, switchable, theft_payload
from .report import markdown
from .stage import outcome_rows, place, rings, traffic_rows

STATIC = Path(__file__).parent / "static"


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
    policy_file = cfg.resolve(cfg.target["policy_file"]) if cfg.target["policy_file"] else None

    recent: dict[str, Any] = {"events": []}

    def poll_alerts() -> None:
        with contextlib.suppress(Exception):
            recent["events"] = target.events(2000)
            alerts.ingest(recent["events"])

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
    app.state.poligon, app.state.alerts, app.state.registry = poligon, alerts, registry
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    app.mount("/app", StaticFiles(directory=STATIC / "app"), name="app")

    def feed() -> tuple[dict[str, Any], str]:
        base, err = load_base_feed(cfg)
        return build_feed(base, registry), err

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
    async def control(request: Request):
        """Switch one safeguard on or off in the control layer's policy file, then re-test at once."""
        body = await request.json()
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
    async def try_text(request: Request):
        """Evaluate a visitor's own text on the live control layer (unmetered, unscored)."""
        body = await request.json()
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
    async def steal(request: Request):
        """Act as an agent that sends a decoy value out through a tool call: a real request, a real incident."""
        body = await request.json()
        decoy = registry.get(str(body.get("decoy")))
        key = cfg.target["demo_agent_key"]
        if decoy is None or not key:
            return JSONResponse({"error": "unknown decoy, or target.demo_agent_key is not set"}, status_code=400)
        direction = "tool_call" if "tool_call" in decoy.directions else decoy.directions[0]
        d = target.guard(key, direction, theft_payload(decoy.value), "http_get")
        poll_alerts()
        return {"action": d.action, "stopped": d.stopped, "error": d.error}

    @app.post("/api/run")
    def run_now():
        return poligon.run_now()

    @app.post("/api/scan")
    async def scan(request: Request):
        body = await request.json()
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
