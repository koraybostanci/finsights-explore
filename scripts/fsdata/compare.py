"""New figures against the Fintables snapshot of 2 Oct 2026 (BIST): P/E, P/B, EV/EBITDA."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any, Mapping

from .util import clean_number

FIELDS: tuple[tuple[str, str], ...] = (("fk", "F/K"), ("pd", "PD/DD"), ("fdf", "FD/FAVÖK"))
BIG_GAP = 25.0  # percent; gaps beyond this are counted in the summary


def gap_pct(new: Any, ref: Any) -> float | None:
    """(new - ref) / ref in percent, one decimal; None when either side is missing or ref is 0."""
    n, r = clean_number(new), clean_number(ref)
    if n is None or r is None or r == 0:
        return None
    return round((n - r) / abs(r) * 100, 1)


@dataclass
class CompareResult:
    rows: list[dict[str, Any]]
    summary: dict[str, dict[str, Any]]
    text: str  # Markdown
    same_snapshot: bool  # market.json still is the reference snapshot


def _num(x: Any) -> str:
    n = clean_number(x)
    return "–" if n is None else f"{n:.2f}"


def _gap(x: float | None) -> str:
    return "–" if x is None else f"{x:+.1f}%"


def build_compare(doc: Mapping[str, Any], reference: Mapping[str, Any]) -> CompareResult:
    ref_stocks: Mapping[str, Mapping[str, Any]] = reference.get("stocks", {})
    new_by_k = {s["k"]: s for s in doc.get("stocks", []) if s.get("market") == reference.get("market", "BIST")}

    rows: list[dict[str, Any]] = []
    for k, ref in ref_stocks.items():
        new = new_by_k.get(k)
        row: dict[str, Any] = {"k": k, "present": new is not None}
        for key, _label in FIELDS:
            n = new.get(key) if new else None
            row[key] = {"ref": ref.get(key), "new": n, "gap": gap_pct(n, ref.get(key))}
        rows.append(row)

    summary: dict[str, dict[str, Any]] = {}
    for key, label in FIELDS:
        gaps = [r[key]["gap"] for r in rows if r[key]["gap"] is not None]
        summary[key] = {
            "label": label,
            "compared": len(gaps),
            "median_abs_gap": round(statistics.median(abs(g) for g in gaps), 1) if gaps else None,
            "big": sum(1 for g in gaps if abs(g) > BIG_GAP),
            "only_ref": sum(1 for r in rows if r[key]["new"] is None and r[key]["ref"] is not None),
            "only_new": sum(1 for r in rows if r[key]["ref"] is None and r[key]["new"] is not None),
        }

    same = doc.get("asOf") == reference.get("asOf") and doc.get("source") == reference.get("source")
    lines = [
        "### BIST: new figures against the Fintables snapshot",
        "",
        f"Reference: {reference.get('source', '?')}, {reference.get('asOf', '?')} (period {reference.get('period', '?')}). "
        f"New: {doc.get('source', '?')}, {doc.get('asOf', '?')}.",
    ]
    if same:
        lines += ["", "market.json still holds the reference snapshot itself, so every gap is zero."]
    header = ["Stock"] + [f"{label} ref | {label} new | gap" for _k, label in FIELDS]
    lines += ["", "| " + " | ".join(header) + " |", "|---|" + "---:|" * (3 * len(FIELDS))]
    for r in rows:
        cells = [r["k"] if r["present"] else f"{r['k']} (missing)"]
        for key, _label in FIELDS:
            cells += [_num(r[key]["ref"]), _num(r[key]["new"]), _gap(r[key]["gap"])]
        lines.append("| " + " | ".join(cells) + " |")
    lines += ["", "| Metric | Compared | Median abs. gap | Gap over 25% | Only in reference | Only in new |", "|---|---:|---:|---:|---:|---:|"]
    for key, label in FIELDS:
        s = summary[key]
        med = "–" if s["median_abs_gap"] is None else f"{s['median_abs_gap']:.1f}%"
        lines.append(f"| {label} | {s['compared']} | {med} | {s['big']} | {s['only_ref']} | {s['only_new']} |")
    lines.append("")
    return CompareResult(rows=rows, summary=summary, text="\n".join(lines), same_snapshot=same)
