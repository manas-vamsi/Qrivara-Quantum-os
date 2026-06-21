"""Qiskit interop — export a QRIVARA-designed chip as a Qiskit Target / digital twin.

QRIVARA is the hardware-design layer (geometry → Hamiltonian → f01/T1/T2/gate errors);
Qiskit is the circuit/runtime layer. The join point is `qiskit.transpiler.Target`:
we fill it with our computed per-qubit frequencies, coherence, gate errors, and the
design's connectivity, so a user can transpile and (with qiskit-aer) simulate circuits
against the chip they designed in QRIVARA.

Qiskit is an OPTIONAL dependency — `build_target_descriptor` works with no Qiskit
installed (pure dict), while `build_target` needs `qiskit` and the noise model needs
`qiskit-aer`. Everything is lazy-imported and guarded.
"""
from __future__ import annotations

from typing import Any


def available() -> bool:
    try:
        import qiskit  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def _collect(results: dict[str, Any]) -> dict:
    """Pull the per-qubit + gate numbers out of QRIVARA's analysis results
    (keyed by simulation type). Degrades gracefully — any missing analysis uses a
    sensible default so a partially-simulated design still exports."""
    ham = results.get("hamiltonian", {}) or {}
    dec = results.get("decoherence", {}) or {}
    ro = results.get("readout", {}) or {}
    gf = results.get("gate_fidelity", {}) or {}
    tqg = results.get("two_qubit_gate", {}) or {}
    lom = results.get("lom", {}) or {}
    fc = results.get("frequency_collisions", {}) or {}

    qubits = lom.get("qubits") or ([ham] if ham.get("f01_GHz") else [])
    n = max(len(qubits), 1)

    t1_us = float(dec.get("T1_total_us") or gf.get("T1_us") or 50.0)
    t2_us = float(dec.get("T2_echo_us") or gf.get("T2_us") or 30.0)
    ro_fid = float(ro.get("assignment_fidelity_pct", 95.0)) / 100.0
    chi_mhz = abs(float(ro.get("chi_MHz", 1.0))) or 1.0

    # connectivity: frequency-collision lattice edges → LOM couplings → linear chain
    edges: list[tuple[int, int]] = []
    fc_edges = fc.get("lattice_edges")
    # frequency-collision edges index into the collision lattice (which may be a
    # different/larger qubit set than this design's qubits) → only use them when the
    # node count matches; otherwise fall back to a linear chain over the n qubits.
    if fc_edges and fc.get("n_qubits") == n:
        for e in fc_edges:
            if isinstance(e, dict):
                a, b = int(e["a"]), int(e["b"])
            else:
                a, b = int(e[0]), int(e[1])
            if a != b and a < n and b < n:
                edges += [(a, b), (b, a)]
    if not edges:
        for i in range(n - 1):
            edges += [(i, i + 1), (i + 1, i)]

    return {
        "n": n, "qubits": qubits, "t1_us": t1_us, "t2_us": t2_us,
        "ro_fid": ro_fid, "ro_len_s": 1.0 / (2.0 * chi_mhz * 1e6),
        "err_1q": float(gf.get("error_1q", 1e-3)), "t_1q_s": float(gf.get("t_gate_1q_ns", 20.0)) * 1e-9,
        "err_2q": float(gf.get("error_2q", 1.0 - float(tqg.get("fidelity", 0.99)))),
        "t_2q_s": float(tqg.get("t_gate_ns") or gf.get("t_gate_2q_ns", 200.0)) * 1e-9,
        "gate_2q": str(tqg.get("gate", "CZ")).upper(),
        "edges": edges or [(0, 0)][: 0],
    }


def build_target_descriptor(results: dict[str, Any]) -> dict:
    """Portable JSON descriptor of the chip's Qiskit Target — qubit properties,
    instruction errors/durations, and coupling map. Needs NO Qiskit installed."""
    c = _collect(results)
    n = c["n"]
    qubit_props = []
    for i in range(n):
        qd = c["qubits"][i] if i < len(c["qubits"]) else {}
        spread = 1.0 - 0.04 * (((i % 5) - 2) / 2.0)   # deterministic fab spread (matches results.py)
        qubit_props.append({
            "index": i,
            "frequency_GHz": round(float(qd.get("f01_GHz", 5.0 + 0.1 * i)), 5),
            "anharmonicity_MHz": round(float(qd.get("anharmonicity_MHz", -310.0)), 1),
            "T1_us": round(c["t1_us"] * spread, 2),
            "T2_us": round(c["t2_us"] * spread, 2),
            "readout_error": round(1.0 - c["ro_fid"], 5),
        })
    edges = sorted({(a, b) for (a, b) in c["edges"] if a != b})
    instructions = [
        {"gate": "rz", "qargs": [i], "error": 0.0, "duration_s": 0.0} for i in range(n)
    ] + [
        {"gate": "sx", "qargs": [i], "error": round(c["err_1q"], 6), "duration_s": c["t_1q_s"]} for i in range(n)
    ] + [
        {"gate": c["gate_2q"].lower() if c["gate_2q"] in ("CZ", "ISWAP") else "cx",
         "qargs": [a, b], "error": round(c["err_2q"], 6), "duration_s": c["t_2q_s"]}
        for (a, b) in edges
    ] + [
        {"gate": "measure", "qargs": [i], "error": round(1.0 - c["ro_fid"], 5), "duration_s": c["ro_len_s"]}
        for i in range(n)
    ]
    return {
        "num_qubits": n,
        "basis_gates": sorted({ins["gate"] for ins in instructions}),
        "coupling_map": [list(e) for e in edges],
        "qubits": qubit_props,
        "instructions": instructions,
        "two_qubit_gate": c["gate_2q"],
        "simulation_types_used": [k for k in results.keys()],
    }


def build_target(results: dict[str, Any]):
    """Construct a live qiskit.transpiler.Target from the analysis results.
    Requires `qiskit`. Raises ImportError otherwise."""
    from qiskit.transpiler import Target, InstructionProperties
    from qiskit.providers import QubitProperties
    from qiskit.circuit import Parameter, Measure
    from qiskit.circuit.library import RZGate, SXGate, XGate, CZGate, iSwapGate, CXGate

    c = _collect(results)
    n = c["n"]
    qprops = []
    for i in range(n):
        qd = c["qubits"][i] if i < len(c["qubits"]) else {}
        spread = 1.0 - 0.04 * (((i % 5) - 2) / 2.0)
        qprops.append(QubitProperties(
            frequency=float(qd.get("f01_GHz", 5.0 + 0.1 * i)) * 1e9,
            t1=c["t1_us"] * spread * 1e-6, t2=c["t2_us"] * spread * 1e-6))
    target = Target(description=f"QRIVARA chip ({n}Q)", num_qubits=n, dt=2.2222e-9,
                    qubit_properties=qprops)
    target.add_instruction(RZGate(Parameter("theta")),
                           {(i,): InstructionProperties(duration=0.0, error=0.0) for i in range(n)})
    target.add_instruction(SXGate(),
                           {(i,): InstructionProperties(duration=c["t_1q_s"], error=c["err_1q"]) for i in range(n)})
    target.add_instruction(XGate(),
                           {(i,): InstructionProperties(duration=c["t_1q_s"], error=c["err_1q"]) for i in range(n)})
    two = {"CZ": CZGate, "ISWAP": iSwapGate}.get(c["gate_2q"], CXGate)()
    edges = sorted({(a, b) for (a, b) in c["edges"] if a != b}) or [(0, 1)] if n > 1 else []
    if edges:
        target.add_instruction(two, {e: InstructionProperties(duration=c["t_2q_s"], error=c["err_2q"]) for e in edges})
    target.add_instruction(Measure(),
                           {(i,): InstructionProperties(duration=c["ro_len_s"], error=1.0 - c["ro_fid"]) for i in range(n)})
    return target
