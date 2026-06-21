"""Natural-language -> superconducting chip design generator.

Two stages so the output is ALWAYS a valid, simulatable design:
  1. parse_spec(prompt): an LLM turns the request into a structured spec
     (falls back to a keyword parser if no LLM / on any failure).
  2. assemble(spec): a deterministic assembler builds a {nodes, edges} doc from
     the real component catalog, in the exact shape the Visual Designer renders.
"""
from __future__ import annotations

import json
import math
import re

from . import ai as AI
from .catalog import COMPONENT_LIBRARY

_BY_ID = {c["id"]: c for c in COMPONENT_LIBRARY}
# Only real qubit / coupler component ids may be used as those roles, so an LLM
# can never make e.g. a "feedline" the qubit type (which would be non-simulatable).
_QUBIT_IDS = {c["id"] for c in COMPONENT_LIBRARY if c.get("category") == "Qubits"}
_COUPLER_IDS = {c["id"] for c in COMPONENT_LIBRARY if c.get("category") == "Couplers"}

# qubit words -> catalog component id. Order matters: more specific keys first
# (e.g. "0-pi" before "transmon") since keyword_spec does a substring match.
_QUBIT_ALIASES = {
    "0-pi": "zero-pi", "zero-pi": "zero-pi", "0pi": "zero-pi",
    "cos2phi": "cos2phi-qubit", "cos(2": "cos2phi-qubit", "parity-protected": "cos2phi-qubit",
    "bifluxon": "bifluxon",
    "c-shunt": "cshunt-flux-qubit", "cshunt": "cshunt-flux-qubit", "flux qubit": "cshunt-flux-qubit",
    "unimon": "unimon", "floating": "floating-transmon", "double-pad": "floating-transmon",
    "xmon": "xmon", "concentric": "concentric-transmon",
    "tunable-transmon": "tunable-transmon", "tunable transmon": "tunable-transmon",
    "gatemon": "gatemon", "fluxonium": "fluxonium", "transmon": "transmon",
}
_COUPLER_ALIASES = {
    "capacitive": "capacitive-coupler", "capacitive-coupler": "capacitive-coupler",
    "tunable": "tunable-coupler", "tunable-coupler": "tunable-coupler",
    "inductive": "inductive-coupler", "snail": "snail-coupler",
}

_GAP = 240  # canvas spacing between components (px)


# ── spec validation ──────────────────────────────────────────────────────────
def _clamp(v, lo, hi, default):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(f):
        return default
    return max(lo, min(hi, f))


def _normalize(spec: dict) -> dict:
    qubit_type = str(spec.get("qubit_type", "transmon"))
    qubit_type = _QUBIT_ALIASES.get(qubit_type, qubit_type if qubit_type in _QUBIT_IDS else "transmon")
    coupler_type = str(spec.get("coupler_type", "capacitive-coupler"))
    coupler_type = _COUPLER_ALIASES.get(coupler_type, coupler_type if coupler_type in _COUPLER_IDS else "capacitive-coupler")
    n = int(_clamp(spec.get("n_qubits", 2), 1, 12, 2))
    topo = str(spec.get("topology", "linear")).lower()
    if topo not in ("linear", "grid", "ring"):
        topo = "grid" if n >= 4 else "linear"
    name = str(spec.get("project_name") or "").strip()
    if not name:
        pretty = _BY_ID.get(qubit_type, {}).get("name", "Transmon")
        name = f"{n}-Qubit {pretty} Processor"
    return {
        "n_qubits": n,
        "qubit_type": qubit_type,
        "freq_GHz": round(_clamp(spec.get("freq_GHz", 5.0), 2.0, 9.0, 5.0), 3),
        "anharmonicity_MHz": round(_clamp(spec.get("anharmonicity_MHz", -310), -600, -100, -310), 1),
        "readout": bool(spec.get("readout", True)),
        "readout_freq_GHz": round(_clamp(spec.get("readout_freq_GHz", 7.1), 4.0, 12.0, 7.1), 3),
        "coupler": bool(spec.get("coupler", n > 1)),
        "coupler_type": coupler_type,
        "purcell": bool(spec.get("purcell", False)),
        "feedline": bool(spec.get("feedline", True)),
        "topology": topo,
        "project_name": name[:80],
        "summary": str(spec.get("summary") or "").strip()[:240],
    }


# ── keyword fallback parser (no LLM needed) ──────────────────────────────────
def keyword_spec(prompt: str) -> dict:
    p = prompt.lower()
    m = re.search(r"(\d+)\s*[- ]?\s*(?:qubit|transmon|xmon|fluxonium)", p)
    n = int(m.group(1)) if m else 2
    fm = re.search(r"(\d+(?:\.\d+)?)\s*ghz", p)
    freq = float(fm.group(1)) if fm else 5.0
    # readout freq if a second GHz is mentioned, else default
    qubit_type = next((v for k, v in _QUBIT_ALIASES.items() if k in p), "transmon")
    coupler_type = "tunable-coupler" if "tunable coupler" in p else "capacitive-coupler"
    if "grid" in p:
        topology = "grid"
    elif "ring" in p:
        topology = "ring"
    else:
        topology = "grid" if n >= 4 else "linear"
    spec = {
        "n_qubits": n,
        "qubit_type": qubit_type,
        "freq_GHz": freq,
        "readout": "no readout" not in p and "without readout" not in p,
        "coupler": ("coupler" in p or "couple" in p or n > 1) and "no coupler" not in p,
        "coupler_type": coupler_type,
        "purcell": "purcell" in p,
        "feedline": "no feedline" not in p,
        "topology": topology,
        "summary": f"Keyword-parsed: {n} {qubit_type} qubit(s) at {freq} GHz.",
    }
    return _normalize(spec)


# ── LLM parser ───────────────────────────────────────────────────────────────
_SPEC_SYSTEM = (
    "You convert a natural-language superconducting quantum chip request into a JSON spec. "
    "Output ONLY a JSON object with these keys: "
    "n_qubits (int 1-12), qubit_type (one of: transmon, xmon, fluxonium, tunable-transmon, "
    "gatemon, concentric-transmon, floating-transmon, unimon, zero-pi, cshunt-flux-qubit, bifluxon, cos2phi-qubit), "
    "freq_GHz (number ~4-6), anharmonicity_MHz (negative number ~-300), "
    "readout (bool), readout_freq_GHz (number ~6-8), "
    "coupler (bool), coupler_type (one of: capacitive-coupler, tunable-coupler), "
    "purcell (bool), feedline (bool), topology (one of: linear, grid, ring), "
    "project_name (short title), summary (one sentence describing what you built). "
    "Infer sensible defaults for anything the user did not specify. Default to readout=true, "
    "feedline=true, and one coupler between neighbouring qubits when there is more than one qubit."
)


def llm_spec(prompt: str) -> dict | None:
    if not AI.is_configured():
        return None
    try:
        raw = AI._complete(
            [{"role": "system", "content": _SPEC_SYSTEM}, {"role": "user", "content": prompt}],
            json_mode=True, max_tool_rounds=1, temperature=0.2,
        )
        data = json.loads(raw)
        if isinstance(data, dict) and data:
            return _normalize(data)
    except Exception:
        return None
    return None


def parse_spec(prompt: str) -> tuple[dict, str]:
    """Return (spec, source) where source is 'ai' or 'keyword'."""
    spec = llm_spec(prompt)
    if spec:
        return spec, "ai"
    return keyword_spec(prompt), "keyword"


# ── deterministic assembler ──────────────────────────────────────────────────
def _node(nid: str, comp_id: str, x: float, y: float, label: str, params: dict) -> dict:
    comp = _BY_ID.get(comp_id, _BY_ID["transmon"])
    return {
        "id": nid,
        "type": "quantum",
        "position": {"x": round(x), "y": round(y)},
        "data": {"label": label, "kind": comp["kind"], "color": comp.get("color", "primary"), "params": params},
    }


def _edge(eid: str, source: str, target: str) -> dict:
    return {
        "id": eid, "source": source, "target": target,
        "type": "smoothstep", "animated": True,
        "style": {"stroke": "rgb(91 200 224)", "strokeWidth": 1.75},
    }


def assemble(spec: dict) -> dict:
    """Build a {nodes, edges} design doc from a normalized spec."""
    spec = _normalize(spec)
    n = spec["n_qubits"]
    nodes: list[dict] = []
    edges: list[dict] = []

    qcomp = _BY_ID.get(spec["qubit_type"], _BY_ID["transmon"])
    # "linear" = one horizontal row; otherwise a near-square grid. One codepath.
    cols = n if spec["topology"] == "linear" else max(1, math.ceil(math.sqrt(n)))
    rows = math.ceil(n / cols)

    # Collision-free band layout (node footprint ~200x120):
    #   each qubit column stacks  Purcell (top) · Readout (mid) · Qubit (bottom);
    #   couplers sit in the gaps; the feedline is a spine to the right.
    COL_W, ROW_H = 480, 470            # column / row spacing (wide enough that a midpoint coupler clears both qubits)
    MARGIN_X, MARGIN_Y = 140, 340      # MARGIN_Y leaves room for the stack above row 0
    RES_DY, PF_DY = 150, 300           # readout 150px above qubit; Purcell 300px above

    qubits: list[tuple[str, float, float]] = []
    for i in range(n):
        row, col = divmod(i, cols)
        qx = MARGIN_X + col * COL_W
        qy = MARGIN_Y + row * ROW_H
        params = dict(qcomp.get("defaults", {}))
        if "target_freq_GHz" in params:
            params["target_freq_GHz"] = spec["freq_GHz"]
        if "frequency_GHz" in params:
            params["frequency_GHz"] = spec["freq_GHz"]
        if qcomp.get("kind") == "transmon":  # transmon/xmon/gatemon/concentric
            params["anharmonicity_MHz"] = spec["anharmonicity_MHz"]
        nid = f"q{i + 1}"
        nodes.append(_node(nid, spec["qubit_type"], qx, qy, f"Q{i + 1}", params))
        qubits.append((nid, qx, qy))

    # shared feedline — a spine to the right of the grid, vertically centred
    feed_id = None
    if spec["readout"] and spec["feedline"]:
        fx = MARGIN_X + cols * COL_W + 40
        fy = MARGIN_Y + (rows - 1) * ROW_H / 2
        feed_id = "feed"
        nodes.append(_node(feed_id, "feedline", fx, fy, "Feedline", dict(_BY_ID["feedline"]["defaults"])))

    # readout resonators stacked directly ABOVE each qubit (+ optional Purcell above that)
    if spec["readout"]:
        for i, (qid, qx, qy) in enumerate(qubits):
            rparams = dict(_BY_ID["readout-resonator"]["defaults"])
            # ~200 MHz frequency-multiplexing spacing (Krinner 2022: 6.8-7.6 GHz band)
            rparams["frequency_GHz"] = round(spec["readout_freq_GHz"] + (i % 5) * 0.2, 3)
            rid = f"r{i + 1}"
            nodes.append(_node(rid, "readout-resonator", qx, qy - RES_DY, f"Readout R{i + 1}", rparams))
            edges.append(_edge(f"e_{qid}_{rid}", qid, rid))
            if feed_id and spec["purcell"]:
                pid = f"pf{i + 1}"
                nodes.append(_node(pid, "purcell-filter", qx, qy - PF_DY, f"Purcell PF{i + 1}", dict(_BY_ID["purcell-filter"]["defaults"])))
                edges.append(_edge(f"e_{rid}_{pid}", rid, pid))
                edges.append(_edge(f"e_{pid}_feed", pid, feed_id))
            elif feed_id:
                edges.append(_edge(f"e_{rid}_feed", rid, feed_id))

    # couplers between consecutive qubits (+ ring wrap). Same-row pairs sit in the
    # horizontal gap at the qubit row; cross-row (wrap) pairs sit to the right of
    # the row's last qubit — both clear of the qubit/readout bands.
    if spec["coupler"] and n > 1:
        cdefaults = dict(_BY_ID.get(spec["coupler_type"], _BY_ID["capacitive-coupler"]).get("defaults", {}))
        pairs = [(qubits[i], qubits[i + 1], f"c{i + 1}") for i in range(n - 1)]
        if spec["topology"] == "ring" and n > 2:
            pairs.append((qubits[-1], qubits[0], f"c{n}"))
        for a, b, cid in pairs:
            if abs(a[2] - b[2]) < 1:                      # same row → midpoint of the horizontal gap
                cx, cy = (a[1] + b[1]) / 2, a[2]
            else:                                         # cross-row → right of qubit a, on its row
                cx, cy = a[1] + COL_W * 0.55, a[2]
            nodes.append(_node(cid, spec["coupler_type"], cx, cy, f"Coupler {cid.upper()}", dict(cdefaults)))
            edges.append(_edge(f"e_{a[0]}_{cid}", a[0], cid))
            edges.append(_edge(f"e_{cid}_{b[0]}", cid, b[0]))

    return {"nodes": nodes, "edges": edges}


def generate(prompt: str) -> dict:
    """Full pipeline: prompt -> {project_name, summary, doc, spec, source, n_components}."""
    spec, source = parse_spec(prompt)
    doc = assemble(spec)
    summary = spec["summary"] or (
        f"{spec['n_qubits']} {_BY_ID.get(spec['qubit_type'], {}).get('name', 'transmon')} qubit(s) at "
        f"{spec['freq_GHz']} GHz"
        + (", readout resonators on a shared feedline" if spec["readout"] else "")
        + (", neighbour couplers" if spec["coupler"] and spec["n_qubits"] > 1 else "")
        + (", Purcell filters" if spec["purcell"] else "") + "."
    )
    return {
        "project_name": spec["project_name"],
        "summary": summary,
        "doc": doc,
        "spec": spec,
        "source": source,
        "n_components": len(doc["nodes"]),
    }
