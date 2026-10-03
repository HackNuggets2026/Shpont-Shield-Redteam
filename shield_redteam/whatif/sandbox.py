"""A private copy of the control layer: the same code, a candidate policy and feed, no live traffic.

Used to preview a change before it is applied: the corpus and recent real requests are replayed through
both the current and the candidate configuration, and only the difference is reported.
"""

from __future__ import annotations

import contextlib
import json
import os
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

from ..core import yamlio
from ..core.target import GatewayTarget
from ..core.types import Case, Decision

_import_lock = threading.Lock()


class SandboxUnavailable(RuntimeError):
    pass


def _create_app(shield_path: Path):
    with _import_lock:
        if str(shield_path) not in sys.path and (shield_path / "controllayer").is_dir():
            sys.path.insert(0, str(shield_path))
        try:
            from controllayer.gateway.app import create_app  # type: ignore[import-not-found]
        except ImportError as e:
            raise SandboxUnavailable(f"the control layer is not importable from {shield_path}: {e}") from e
    return create_app


def apply_changes(doc: Any, changes: list[dict[str, Any]]) -> None:
    """Changes are {control, enabled} or {control, mode}; controls are top-level keys or semantic controls."""
    from ..server.demo import TOP_LEVEL

    for ch in changes:
        cid = str(ch.get("control"))
        if cid in TOP_LEVEL:
            node = doc.setdefault(TOP_LEVEL[cid], {}) if doc.get(TOP_LEVEL[cid]) is not None else doc
            if node is doc:
                doc[TOP_LEVEL[cid]] = {}
                node = doc[TOP_LEVEL[cid]]
        elif cid in (doc.get("semantic_controls") or {}):
            node = doc["semantic_controls"][cid]
        else:
            raise KeyError(f"{cid!r} is not a control in this policy")
        if "enabled" in ch:
            node["enabled"] = bool(ch["enabled"])
        if "mode" in ch:
            node["mode"] = str(ch["mode"])


class Sandbox:
    """One throwaway control layer for one configuration."""

    def __init__(self, shield_path: Path, policy_doc: Any, feed: dict[str, Any]):
        create_app = _create_app(shield_path)
        self._dir = tempfile.TemporaryDirectory(prefix="redteam-sandbox-")
        root = Path(self._dir.name)
        (root / "feed.json").write_text(json.dumps(feed))
        policy_doc.setdefault("signatures", {})
        policy_doc["signatures"]["feed"] = "feed.json"
        policy_doc.setdefault("audit", {})
        policy_doc["audit"]["path"] = "data/audit.jsonl"
        path = root / "policy.yaml"
        path.write_text(yamlio.dumps(policy_doc))
        from fastapi.testclient import TestClient

        with _env(ACL_SEMANTIC="heuristic", ACL_UPSTREAM="mock", ACL_PII_MODEL="stub"):
            self.client = TestClient(create_app(path, watch=False))
        self.client.headers["x-admin-token"] = _admin_token(policy_doc)
        self.target = GatewayTarget("sandbox", self.client.headers["x-admin-token"])
        self.target.http = self.client

    def evaluate(self, case: Case) -> Decision:
        return self.target.evaluate(case)

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.client.close()
        self._dir.cleanup()

    def __enter__(self) -> Sandbox:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def _admin_token(doc: Any) -> str:
    raw = str(((doc.get("identity") or {}).get("admin_token")) or "demo-admin-token")
    if raw.startswith("${"):  # ${ACL_ADMIN_TOKEN:-demo-admin-token}
        name, _, default = raw[2:-1].partition(":-")
        return os.environ.get(name, default)
    return raw


@contextlib.contextmanager
def _env(**values: str):
    old = {k: os.environ.get(k) for k in values}
    os.environ.update({k: v for k, v in values.items() if k not in os.environ})
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
