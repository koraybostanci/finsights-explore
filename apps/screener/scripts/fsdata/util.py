"""Numbers, rounding, JSON output and atomic writes."""

from __future__ import annotations

import json
import math
import numbers
import os
import tempfile
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any


def clean_number(x: Any) -> float | int | None:
    """A finite real number or None. Booleans, strings, NaN and +-Infinity become None."""
    if x is None or isinstance(x, bool) or not isinstance(x, numbers.Real):
        return None
    try:
        f = float(x)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(f):
        return None
    return x if isinstance(x, (int, float)) else f


def _round_half_up(x: float, digits: int) -> float:
    # Decimal(repr(x)) rounds what a person sees (2.675 -> 2.68), not the binary value.
    q = Decimal(1).scaleb(-digits)
    out = float(Decimal(repr(float(x))).quantize(q, rounding=ROUND_HALF_UP))
    return 0.0 if out == 0 else out  # no "-0.0"


def rnd(x: Any, digits: int) -> float | int | None:
    """Round to `digits` decimals (half up). None for missing or non-finite input."""
    n = clean_number(x)
    if n is None:
        return None
    out = _round_half_up(n, digits)
    return int(out) if digits == 0 else out


def r2(x: Any) -> float | None:
    return rnd(x, 2)  # type: ignore[return-value]


def r1(x: Any) -> float | None:
    return rnd(x, 1)  # type: ignore[return-value]


def r0(x: Any) -> int | None:
    return rnd(x, 0)  # type: ignore[return-value]


def tidy(obj: Any) -> Any:
    """Integral floats become ints (500.0 -> 500); NaN and Infinity raise ValueError."""
    if isinstance(obj, bool) or obj is None or isinstance(obj, (str, int)):
        return obj
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError(f"non-finite number in output: {obj!r}")
        return int(obj) if obj.is_integer() else obj
    if isinstance(obj, dict):
        return {k: tidy(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [tidy(v) for v in obj]
    return obj


def dumps_pretty(doc: Any) -> str:
    """Same layout as the committed market.json (one space per level)."""
    return json.dumps(tidy(doc), ensure_ascii=False, indent=1, allow_nan=False) + "\n"


def dumps_compact(doc: Any) -> str:
    return json.dumps(tidy(doc), ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def atomic_write(path: Path, text: str) -> None:
    """Write next to the target, fsync, then rename over it: readers never see a partial file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
