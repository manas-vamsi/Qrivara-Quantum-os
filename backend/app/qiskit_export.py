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


def aer_available() -> bool:
    try:
        import qiskit_aer  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def simulate_noisy(results: dict[str, Any], circuit: str = "ghz", shots: int = 2048) -> dict:
    """Run a circuit against the designed chip's NOISE MODEL (qiskit-aer): build
    thermal-relaxation (T1/T2) + depolarizing (gate-error) + readout errors from the
    design's computed numbers, then compare the ideal vs noisy measurement outcomes.
    The real payoff of the digital twin — "what would my chip actually produce?".

    `circuit`: 'ghz' (entangle all qubits) or 'bell' (2-qubit). Returns ideal/noisy
    counts, classical fidelity and total-variation distance, and the noise params used.
    """
    import math as _math
    from qiskit import QuantumCircuit, transpile
    from qiskit_aer import AerSimulator
    from qiskit_aer.noise import (NoiseModel, ReadoutError, depolarizing_error,
                                  thermal_relaxation_error)

    c = _collect(results)
    n = max(1, min(c["n"], 8))                              # cap for a fast, legible demo
    shots = int(max(256, min(shots, 20000)))
    t1 = max(c["t1_us"], 1.0) * 1e-6
    t2 = min(max(c["t2_us"], 1.0) * 1e-6, 2.0 * t1)         # physical bound T2 ≤ 2 T1
    t_1q, t_2q = max(c["t_1q_s"], 1e-9), max(c["t_2q_s"], 1e-9)

    nm = NoiseModel()
    # 1-qubit: thermal relaxation over the gate time, then a small depolarizing term
    # for the residual (control) error beyond coherence.
    e1 = thermal_relaxation_error(t1, t2, t_1q)
    if c["err_1q"] > 0:
        e1 = e1.compose(depolarizing_error(min(max(c["err_1q"], 1e-9), 0.5), 1))
    nm.add_all_qubit_quantum_error(e1, ["sx", "x"])
    # 2-qubit: relaxation on both qubits ⊗, then depolarizing for the 2Q gate error.
    e2 = thermal_relaxation_error(t1, t2, t_2q).tensor(thermal_relaxation_error(t1, t2, t_2q))
    if c["err_2q"] > 0:
        e2 = e2.compose(depolarizing_error(min(max(c["err_2q"], 1e-9), 0.75), 2))
    nm.add_all_qubit_quantum_error(e2, ["cx"])
    # readout (symmetric bit-flip from the assignment fidelity)
    p_ro = min(max(1.0 - c["ro_fid"], 0.0), 0.49)
    nm.add_all_qubit_readout_error(ReadoutError([[1 - p_ro, p_ro], [p_ro, 1 - p_ro]]))

    qc = QuantumCircuit(n, n)
    if circuit == "bell" and n >= 2:
        qc.h(0); qc.cx(0, 1)
    elif n == 1:
        circuit = "x"; qc.x(0)
    else:
        circuit = "ghz"; qc.h(0)
        for i in range(n - 1):
            qc.cx(i, i + 1)
    qc.measure(range(n), range(n))

    basis = ["rz", "sx", "x", "cx"]
    tqc = transpile(qc, basis_gates=basis, optimization_level=1)
    ideal = AerSimulator().run(qc, shots=shots).result().get_counts()
    noisy = AerSimulator(noise_model=nm).run(tqc, shots=shots).result().get_counts()

    # classical fidelity F = (Σ √(pᵢqᵢ))² and total-variation distance over bitstrings
    keys = set(ideal) | set(noisy)
    pi = {k: ideal.get(k, 0) / shots for k in keys}
    qi = {k: noisy.get(k, 0) / shots for k in keys}
    fidelity = sum(_math.sqrt(pi[k] * qi[k]) for k in keys) ** 2
    tvd = 0.5 * sum(abs(pi[k] - qi[k]) for k in keys)

    def top(counts):
        return [{"state": k, "count": v, "prob": round(v / shots, 4)}
                for k, v in sorted(counts.items(), key=lambda kv: -kv[1])[:8]]

    return {
        "circuit": circuit, "n_qubits": n, "shots": shots,
        "ideal_counts": top(ideal), "noisy_counts": top(noisy),
        "fidelity_pct": round(100.0 * fidelity, 2),
        "total_variation_distance": round(tvd, 4),
        "noise": {"T1_us": round(c["t1_us"], 1), "T2_us": round(c["t2_us"], 1),
                  "error_1q": round(c["err_1q"], 5), "error_2q": round(c["err_2q"], 5),
                  "readout_error": round(p_ro, 4)},
        "method": "qiskit-aer noise model (thermal relaxation + depolarizing + readout) from the designed chip",
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
