"""Validation and atomic output of market.json and the price files."""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Callable

import jsonschema

from . import CONFIG_DIR, DATA_DIR
from .config import Universe
from .util import atomic_write, dumps_compact, dumps_pretty, read_json

log = logging.getLogger("fintools.writer")


class ValidationFailed(Exception):
    """Output that must not be written. The message lists the problems."""


def _walk_finite(obj: Any, path: str, problems: list[str]) -> None:
    if isinstance(obj, float) and not math.isfinite(obj):
        problems.append(f"{path}: {obj!r} is not a finite number")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _walk_finite(v, f"{path}/{k}", problems)
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            _walk_finite(v, f"{path}/{i}", problems)


def _errors(doc: Any, schema_path: Path) -> list[str]:
    validator = jsonschema.Draft7Validator(read_json(schema_path))
    out = []
    for e in sorted(validator.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path))):
        out.append(f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}")
    return out


def validate_market(doc: Any, schema_path: Path | None = None) -> list[str]:
    """Problems with a market.json document (empty list = valid)."""
    problems: list[str] = []
    _walk_finite(doc, "", problems)
    problems += _errors(doc, schema_path or CONFIG_DIR / "market.schema.json")
    if isinstance(doc, dict) and isinstance(doc.get("stocks"), list):
        seen: set[tuple[Any, Any]] = set()
        industries = doc.get("industries") if isinstance(doc.get("industries"), dict) else {}
        for i, s in enumerate(doc["stocks"]):
            if not isinstance(s, dict):
                continue
            key = (s.get("market"), s.get("symbol"))
            if key in seen:
                problems.append(f"stocks/{i}: duplicate {key[0]}:{key[1]}")
            seen.add(key)
            if s.get("industry") not in industries:
                problems.append(f"stocks/{i}: industry '{s.get('industry')}' is not in 'industries'")
    return problems


def validate_prices(doc: Any, schema_path: Path | None = None) -> list[str]:
    problems: list[str] = []
    _walk_finite(doc, "", problems)
    problems += _errors(doc, schema_path or CONFIG_DIR / "prices.schema.json")
    if isinstance(doc, dict) and isinstance(doc.get("dates"), list) and isinstance(doc.get("closes"), list):
        t, c = doc["dates"], doc["closes"]
        if len(t) != len(c):
            problems.append(f"dates has {len(t)} entries but closes has {len(c)}")
        if any(a >= b for a, b in zip(t, t[1:]) if isinstance(a, str) and isinstance(b, str)):
            problems.append("dates is not strictly ascending")
    return problems


def price_path(data_dir: Path, sid: str) -> Path:
    return data_dir / "prices" / f"{sid}.json"


def load_price_file(data_dir: Path) -> Callable[[str], dict[str, Any] | None]:
    def load(sid: str) -> dict[str, Any] | None:
        path = price_path(data_dir, sid)
        try:
            doc = read_json(path)
        except (OSError, ValueError):
            return None
        return doc if isinstance(doc, dict) else None

    return load


def read_market(data_dir: Path | None = None) -> Any:
    """The current market.json, or None when it is missing or unreadable."""
    path = (data_dir or DATA_DIR) / "market.json"
    try:
        return read_json(path)
    except (OSError, ValueError) as e:
        log.warning("cannot read %s (%s); starting without previous values", path, e)
        return None


def write_market(doc: dict[str, Any], data_dir: Path | None = None) -> bool:
    """Validate, then replace market.json atomically. False when nothing changed."""
    problems = validate_market(doc)
    if problems:
        raise ValidationFailed("market.json would be invalid:\n  " + "\n  ".join(problems[:30]))
    path = (data_dir or DATA_DIR) / "market.json"
    text = dumps_pretty(doc)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    atomic_write(path, text)
    return True


def write_prices(prices: dict[str, dict[str, Any]], data_dir: Path | None = None) -> list[str]:
    """Validate all series first, then write them. Returns the ids written."""
    data_dir = data_dir or DATA_DIR
    problems: list[str] = []
    for sid, doc in prices.items():
        problems += [f"{sid}: {p}" for p in validate_prices(doc)]
    if problems:
        raise ValidationFailed("price files would be invalid:\n  " + "\n  ".join(problems[:30]))
    written = []
    for sid, doc in sorted(prices.items()):
        path = price_path(data_dir, sid)
        text = dumps_compact(doc)
        if path.exists() and path.read_text(encoding="utf-8") == text:
            continue
        atomic_write(path, text)
        written.append(sid)
    return written


def remove_orphan_prices(universe: Universe, data_dir: Path | None = None) -> list[str]:
    """Delete price files of stocks that are no longer in config/stocks.json."""
    folder = (data_dir or DATA_DIR) / "prices"
    if not folder.is_dir():
        return []
    keep = {s.sid for s in universe.stocks}
    removed = []
    for path in sorted(folder.glob("*.json")):
        if path.stem not in keep:
            path.unlink()
            removed.append(path.stem)
    return removed
