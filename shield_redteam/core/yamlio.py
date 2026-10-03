"""Round-trip YAML: edits keep the comments and layout of a hand-written policy file."""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML


def _yaml() -> YAML:
    y = YAML()
    y.preserve_quotes = True
    y.width = 4096
    return y


def load(path: Path) -> Any:
    return _yaml().load(path.read_text())


def dumps(doc: Any) -> str:
    buf = io.StringIO()
    _yaml().dump(doc, buf)
    return buf.getvalue()


def write_atomic(path: Path, doc: Any) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w") as fh:
        fh.write(dumps(doc))
    os.replace(tmp, path)
