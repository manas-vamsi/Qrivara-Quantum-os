"""Export writers for designs and simulation results.

Designs export to the layout formats fabs/EDA tools consume — **GDS-II** (the
cleanroom mask standard, KLayout/Qiskit-Metal) and **DXF** (CAD). Results export
to **Touchstone .s2p** (RF S-parameters), **CSV** (curves/matrices), **JSON**
(full dump) and a **Markdown** report. Everything here is pure (bytes/str in,
no I/O) so it is trivially testable and worker-safe.
"""
from __future__ import annotations

import csv
import io
import json
import struct

# ── layout helpers ─────────────────────────────────────────────────────────

def _rects_from_doc(doc: dict) -> list[dict]:
    """Turn the design graph into axis-aligned rectangles [µm] per node. Canvas
    units are treated as microns; pad geometry (when present) sets the size."""
    rects = []
    for n in doc.get("nodes", []):
        pos = n.get("position", {}) or {}
        d = (n.get("data", {}) or {}).get("params", {}) or {}
        w = float(d.get("pad_width_um", d.get("width_um", 120)))
        h = float(d.get("pad_height_um", d.get("height_um", 80)))
        x = float(pos.get("x", 0)); y = float(pos.get("y", 0))
        layer = int(d.get("layer", 1))
        rects.append({"x": x, "y": y, "w": w, "h": h, "layer": layer,
                      "id": n.get("id", ""), "kind": (n.get("data", {}) or {}).get("kind", "")})
    return rects


# ── DXF (ASCII, R12 ENTITIES) ──────────────────────────────────────────────

def design_to_dxf(doc: dict) -> str:
    """Minimal AutoCAD DXF: one closed LWPOLYLINE rectangle per component, on its
    layer. Readable by KLayout, AutoCAD, and most CAD/EDA tools."""
    out: list[str] = ["0", "SECTION", "2", "ENTITIES"]
    for r in _rects_from_doc(doc):
        x0, y0, x1, y1 = r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]
        out += ["0", "LWPOLYLINE", "8", str(r["layer"]), "90", "4", "70", "1"]
        for vx, vy in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            out += ["10", f"{vx:.3f}", "20", f"{vy:.3f}"]
    out += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(out) + "\n"


# ── GDS-II (binary, the fab mask standard) ─────────────────────────────────

def _gds_real8(value: float) -> bytes:
    """Encode a float as a GDSII 8-byte real (sign / 7-bit base-16 exponent in
    excess-64 / 56-bit mantissa). Used only for the UNITS record."""
    if value == 0:
        return b"\x00" * 8
    sign = 0x80 if value < 0 else 0
    value = abs(value)
    exp = 64
    while value >= 1.0:
        value /= 16.0; exp += 1
    while value < 1.0 / 16.0:
        value *= 16.0; exp -= 1
    mant = int(value * (1 << 56))
    b = bytes([sign | exp]) + mant.to_bytes(7, "big")
    return b


def _rec(rtype: int, dtype: int, payload: bytes = b"") -> bytes:
    length = 4 + len(payload)
    return struct.pack(">HBB", length, rtype, dtype) + payload


def design_to_gds(doc: dict, lib: str = "QRIVARA") -> bytes:
    """Write a valid GDSII stream: one BOUNDARY (closed polygon) per component.
    User unit = 1 µm, database unit = 1 nm (coordinates are integers in nm)."""
    DBU_PER_UM = 1000  # 1 nm db unit
    ts = (0, 1, 1, 0, 0, 0)  # fixed timestamp (Date.now() unavailable / determinism)

    s = io.BytesIO()
    s.write(_rec(0x00, 0x02, struct.pack(">h", 600)))                 # HEADER v6
    s.write(_rec(0x01, 0x02, struct.pack(">12h", *ts, *ts)))          # BGNLIB
    name = (lib + ("\0" if len(lib) % 2 else "")).encode("ascii")
    s.write(_rec(0x02, 0x06, name))                                   # LIBNAME
    s.write(_rec(0x03, 0x05, _gds_real8(1e-3) + _gds_real8(1e-9)))    # UNITS

    s.write(_rec(0x05, 0x02, struct.pack(">12h", *ts, *ts)))          # BGNSTR
    s.write(_rec(0x06, 0x06, b"TOP\0"))                               # STRNAME

    for r in _rects_from_doc(doc):
        x0 = int(r["x"] * DBU_PER_UM); y0 = int(r["y"] * DBU_PER_UM)
        x1 = int((r["x"] + r["w"]) * DBU_PER_UM); y1 = int((r["y"] + r["h"]) * DBU_PER_UM)
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]  # closed
        xy = b"".join(struct.pack(">ii", px, py) for px, py in pts)
        s.write(_rec(0x08, 0x00))                                     # BOUNDARY
        s.write(_rec(0x0D, 0x02, struct.pack(">h", r["layer"])))      # LAYER
        s.write(_rec(0x0E, 0x02, struct.pack(">h", 0)))              # DATATYPE
        s.write(_rec(0x10, 0x03, xy))                                 # XY
        s.write(_rec(0x11, 0x00))                                     # ENDEL

    s.write(_rec(0x07, 0x00))                                         # ENDSTR
    s.write(_rec(0x04, 0x00))                                         # ENDLIB
    return s.getvalue()


# ── result formats ─────────────────────────────────────────────────────────

def result_to_json(result: dict) -> str:
    return json.dumps(result, indent=2, default=str)


def _first_curve(result: dict):
    """Find the main list-of-dicts table in a result (s21_curve, sweep_curve, …)."""
    for k, v in result.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return k, v
    return None, None


def result_to_csv(result: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    # capacitance / Maxwell matrix
    if "maxwell_matrix_fF" in result:
        labels = result.get("labels", [])
        w.writerow(["C_fF", *labels])
        for lab, row in zip(labels, result["maxwell_matrix_fF"]):
            w.writerow([lab, *row])
        return buf.getvalue()
    # any tabular curve
    key, curve = _first_curve(result)
    if curve:
        cols = list(curve[0].keys())
        w.writerow(cols)
        for row in curve:
            w.writerow([row.get(c) for c in cols])
        return buf.getvalue()
    # fall back to flat key/value
    w.writerow(["key", "value"])
    for k, v in result.items():
        if not isinstance(v, (list, dict)):
            w.writerow([k, v])
    return buf.getvalue()


def result_to_touchstone(result: dict) -> str:
    """Touchstone .s2p (magnitude-dB / angle, 50 Ω). Uses an explicit S-parameter
    result when present, else builds a 1-port-style sweep from an S21 curve."""
    lines = ["! QRIVARA S-parameter export", "# GHz S DB R 50"]
    if "freq_points_GHz" in result and "S21_dB" in result:
        freqs = result["freq_points_GHz"]
        s21 = result["S21_dB"]; s11 = result.get("S11_dB", [-20] * len(freqs))
        for f, a, b in zip(freqs, s21, s11):
            lines.append(f"{f:<10.6f} {b:8.3f} 0.0 {a:8.3f} 0.0 {a:8.3f} 0.0 {b:8.3f} 0.0")
    elif "s21_curve" in result:
        for pt in result["s21_curve"]:
            f = pt["freq"]; a = pt["s21"]
            lines.append(f"{f:<10.6f} -20.000 0.0 {a:8.3f} 0.0 {a:8.3f} 0.0 -20.000 0.0")
    else:
        lines.append("! no S-parameter data in this result")
    return "\n".join(lines) + "\n"


def result_to_markdown(job_type: str, params: dict, result: dict) -> str:
    md = [f"# QRIVARA Simulation Report — {job_type}", ""]
    if params:
        md += ["## Parameters", "", "| Parameter | Value |", "|---|---|"]
        md += [f"| {k} | {v} |" for k, v in params.items()] + [""]
    md += ["## Results", "", "| Quantity | Value |", "|---|---|"]
    for k, v in result.items():
        if isinstance(v, (list, dict)):
            n = len(v)
            md.append(f"| {k} | _{n} entries (see CSV/JSON export)_ |")
        else:
            md.append(f"| {k} | {v} |")
    md += ["", "_Generated by QRIVARA — values are model estimates; validate against FEM before fabrication._"]
    return "\n".join(md) + "\n"


# format registry (drives the UI + content types)
RESULT_FORMATS = {
    "json": {"ext": "json", "media": "application/json", "label": "JSON (full dump)"},
    "csv": {"ext": "csv", "media": "text/csv", "label": "CSV (curves/matrices)"},
    "touchstone": {"ext": "s2p", "media": "text/plain", "label": "Touchstone .s2p (S-parameters)"},
    "markdown": {"ext": "md", "media": "text/markdown", "label": "Markdown report"},
}
DESIGN_FORMATS = {
    "gds": {"ext": "gds", "media": "application/octet-stream", "label": "GDS-II (mask / KLayout)"},
    "dxf": {"ext": "dxf", "media": "application/dxf", "label": "DXF (CAD)"},
}
