"""Applied patches: kept in a JSON file and published through the feed, like any managed signature."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


class PatchStore:
    def __init__(self, path: Path):
        self.path = path

    def all(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, ValueError):
            return []

    def signatures(self) -> list[dict[str, Any]]:
        return [{k: v for k, v in p["signature"].items() if k != "case"} for p in self.all()]

    def add(self, signature: dict[str, Any], evidence: dict[str, Any]) -> None:
        rows = [p for p in self.all() if p["signature"]["id"] != signature["id"]]
        rows.append({"signature": signature, "evidence": evidence, "applied_at": time.time()})
        self._write(rows)

    def remove(self, sig_id: str) -> bool:
        rows = self.all()
        kept = [p for p in rows if p["signature"]["id"] != sig_id]
        self._write(kept)
        return len(kept) != len(rows)

    def _write(self, rows: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(rows, indent=2))
        tmp.replace(self.path)
