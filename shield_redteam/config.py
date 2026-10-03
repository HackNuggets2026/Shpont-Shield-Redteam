"""One config file for both modules. `${VAR:-default}` reads the environment."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_ENV = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}")


def _expand(text: str) -> str:
    return _ENV.sub(lambda m: os.environ.get(m.group(1), m.group(2) or ""), text)


@dataclass
class Config:
    path: Path
    raw: dict[str, Any]

    @property
    def base_dir(self) -> Path:
        return self.path.parent

    def resolve(self, value: str) -> Path:
        p = Path(value)
        return p if p.is_absolute() else self.base_dir / p

    @property
    def target(self) -> dict[str, Any]:
        defaults = {
            "url": "http://127.0.0.1:8787",
            "admin_token": "demo-admin-token",
            "policy_file": "",
            "demo_agent_key": "",
        }
        return {**defaults, **self.raw.get("target", {})}

    @property
    def poligon(self) -> dict[str, Any]:
        defaults = {"corpus": "corpus", "mutate": True, "interval_seconds": 30, "workers": 8}
        return {**defaults, **self.raw.get("poligon", {})}

    @property
    def tripwire(self) -> dict[str, Any]:
        return {"seed": "change-me", "decoys": [], **self.raw.get("tripwire", {})}

    @property
    def shield_path(self) -> Path:
        """A checkout of the control layer, used to run it in a sandbox for previews and patch proofs."""
        return self.resolve(os.environ.get("SHIELD_PATH") or self.raw.get("shield_path", "../Shpont-Shield"))

    @property
    def referee(self) -> list[dict[str, Any]]:
        return list((self.raw.get("referee") or {}).get("gateways") or [])

    @property
    def reach(self) -> dict[str, Any]:
        return self.raw.get("reach", {})

    @property
    def feed_token(self) -> str:
        """Guards the published feed: once the data trail runs, it carries values read from real records."""
        if os.environ.get("REDTEAM_FEED_TOKEN"):
            return os.environ["REDTEAM_FEED_TOKEN"]
        return hashlib.sha256(("feed:" + str(self.tripwire.get("seed", ""))).encode()).hexdigest()[:24]

    @property
    def server(self) -> dict[str, Any]:
        return {"host": "127.0.0.1", "port": 8799, **self.raw.get("server", {})}


def load(path: str | Path) -> Config:
    p = Path(path).resolve()
    return Config(p, yaml.safe_load(_expand(p.read_text())) or {})
