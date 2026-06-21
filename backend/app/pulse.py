"""QuTiP pulse-level gate calibration — DRAG-calibrated two-tone cross-resonance.

`physics.simulate_two_qubit_gate` gives a fast *un-calibrated* echoed CR estimate
(~90%, square pulse, RWA) — good for the instant design loop. This module runs a
real pulse-level simulation with QuTiP and CALIBRATES it into the 99% hardware
regime using the standard two-tone echoed cross-resonance recipe
(Sheldon et al., PRA 93, 060302 (2016); Sundaresan et al., PRX Quantum 1, 020318
(2020)):

  • a Gaussian CR drive on the CONTROL qubit at the target frequency;
  • a simultaneous cancellation/rotary tone on the TARGET qubit (amplitude+phase)
    that nulls the residual IX/IY classical-crosstalk term;
  • DRAG on the control drive (Y-quadrature ∝ envelope derivative) to suppress the
    |1>→|2> leakage transition;
  • an active π-echo (instantaneous X_π on the control mid-sequence) that cancels
    the ZI / ZZ terms.

The five pulse knobs (CR amplitude, cancellation amplitude + phase, DRAG weight,
gate time) are tuned by Nelder-Mead to MAXIMIZE the leakage-aware average gate
fidelity to ZX(π/2) — an in-silico closed-loop calibration, exactly what a lab
does. Every reported number is a solved time-dependent propagator of two qutrits
(3 levels each → leakage captured), not an analytic estimate.

CR is only physical when the CONTROL is the higher-frequency qubit, so the pair is
oriented automatically; a too-small or reversed detuning is reported with its real
(lower) fidelity rather than hidden.

QuTiP (a permissive open-source library) and SciPy are lazy-imported and guarded,
so callers fall back to `physics.simulate_two_qubit_gate` when QuTiP is absent.
"""
from __future__ import annotations

import math
import time

import numpy as np

from . import physics

_TWO_PI = 2.0 * math.pi
# Wall-clock budget for one calibration. The worst case is a reversed / too-small
# detuning where the fidelity never reaches the early-exit target, so both starts
# would otherwise run to maxiter; past the deadline the objective short-circuits
# (skips the ODE solve) so the optimizer winds down quickly with its best-so-far.
_CAL_DEADLINE_S = 25.0
_AMP_MAX_MHZ = 150.0    # soft cap: keep drives in the perturbative CR regime
# QuTiP ODE options: a modest output grid bounds the adaptive step size (an
# endpoint-only grid makes the solver overshoot its internal step cap), and the
# tolerances/nsteps are tightened so the propagator is converged (verified
# step-independent to <1e-3 in fidelity from 48 to 320 grid points).
_ODE_OPTS = {"nsteps": 8000, "atol": 1e-9, "rtol": 1e-7}
_GRID = 48          # output points per echo half (calibration)
_GRID_TRAJ = 33     # output points per echo half (trajectory for the UI)


def available() -> bool:
    """True iff QuTiP and SciPy are importable (the calibration can run)."""
    try:
        import qutip  # noqa: F401
        from scipy.optimize import minimize  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def _operators():
    """Two-qutrit ladder/number operators (built once QuTiP is importable)."""
    import qutip as qt

    n = 3
    a = qt.destroy(n)
    ident = qt.qeye(n)
    a1 = qt.tensor(a, ident)
    a2 = qt.tensor(ident, a)
    big = qt.tensor(ident, ident)
    return {
        "a1": a1, "a2": a2,
        "n1": a1.dag() * a1, "n2": a2.dag() * a2, "big": big,
        "Xc": a1 + a1.dag(), "Yc": 1j * (a1.dag() - a1),     # control drive quadratures
        "Xt": a2 + a2.dag(), "Yt": 1j * (a2.dag() - a2),     # target drive quadratures
    }


def _half_propagators(ops, f1, f2, a1m, a2m, g_mhz, t_gate,
                      cr_amp, cancel_amp, cancel_phase, drag, grid):
    """U over each echo half [+CR / −CR] for the two-tone DRAG pulse.

    Frame rotates at the target frequency f2 (control driven at f2 → static
    envelope). All energies in rad/ns; amplitudes in MHz. Returns (U_plus, U_minus)
    as the two half-sequence propagators, or None if the ODE integration fails.
    """
    import qutip as qt

    n1, n2, big = ops["n1"], ops["n2"], ops["big"]
    a1o, a2o = ops["a1"], ops["a2"]
    h0 = (_TWO_PI * (f1 - f2)) * n1 \
        + 0.5 * (_TWO_PI * a1m / 1000.0) * (n1 * (n1 - big)) \
        + 0.5 * (_TWO_PI * a2m / 1000.0) * (n2 * (n2 - big)) \
        + (_TWO_PI * g_mhz / 1000.0) * (a1o.dag() * a2o + a1o * a2o.dag())

    # NOTE: the drive enters as A·(a+a†) (peak-amplitude convention), whereas
    # physics._two_transmon_h writes (Ω/2)·(a+a†) — so the fitted `cr_amp_MHz` here
    # is ~2× the analytic engine's `drive_MHz` for the same physical drive; the two
    # drive_MHz fields are not directly comparable. The convention is absorbed by
    # the calibration (every amplitude is a fitted knob), so it changes no result.
    A = _TWO_PI * abs(cr_amp) / 1000.0          # CR drive amplitude (rad/ns)
    B = _TWO_PI * abs(cancel_amp) / 1000.0      # cancellation tone amplitude
    a1r = _TWO_PI * a1m / 1000.0
    beta = (-drag / a1r) if a1r else 0.0        # DRAG weight (β = −drag/α)
    half = 0.5 * t_gate
    t0, sig = 0.5 * half, 0.25 * half           # Gaussian centred in each half

    def env(t):
        return math.exp(-(t - t0) ** 2 / (2.0 * sig * sig))

    # QuTiP-5 pythonic coefficient signature f(t, **kwargs); `.get("s", 1.0)` makes
    # the echo-sign delivery robust (no KeyError) regardless of how args are passed.
    def cr(t, **kw):                             # CR on control
        return kw.get("s", 1.0) * A * env(t)

    def cr_drag(t, **kw):                        # DRAG Y-quadrature on control
        return kw.get("s", 1.0) * A * beta * env(t) * (-(t - t0) / (sig * sig))

    def can_x(t, **kw):                          # cancellation tone X on target
        return kw.get("s", 1.0) * B * math.cos(cancel_phase) * env(t)

    def can_y(t, **kw):                          # cancellation tone Y on target
        return kw.get("s", 1.0) * B * math.sin(cancel_phase) * env(t)

    h = [h0, [ops["Xc"], cr], [ops["Yc"], cr_drag],
         [ops["Xt"], can_x], [ops["Yt"], can_y]]
    tlist = np.linspace(0.0, half, grid)
    try:
        up = qt.propagator(h, tlist, args={"s": +1.0}, options=_ODE_OPTS)[-1]
        um = qt.propagator(h, tlist, args={"s": -1.0}, options=_ODE_OPTS)[-1]
    except Exception:  # noqa: BLE001 — integrator failure → let caller fall back
        return None
    return up, um


# ideal instantaneous X_π on the control's {|0>,|1>} subspace (echo pulse)
_XPI_CTRL = np.kron(np.array([[0, -1j, 0], [-1j, 0, 0], [0, 0, 1]], dtype=complex),
                    np.eye(3, dtype=complex))


def _echoed_block(up, um):
    """Assemble the echoed sequence X_π·U(−)·X_π·U(+) and return its 4×4
    computational block plus the full 9×9 unitary."""
    uf = _XPI_CTRL @ um.full() @ _XPI_CTRL @ up.full()
    m4 = uf[np.ix_(physics._COMP_IDX, physics._COMP_IDX)]
    return m4, uf


def _fid_leak(m4):
    fid = physics._avg_gate_fidelity(m4, physics._zx_pi2())
    leak = 1.0 - float(np.trace(m4.conj().T @ m4).real) / 4.0
    return fid, max(leak, 0.0)


def calibrate_cr(f1_ghz: float, f2_ghz: float, anh1_mhz: float, anh2_mhz: float,
                 g_mhz: float, target_fidelity: float = 0.993,
                 max_starts: int = 2) -> dict | None:
    """Closed-loop in-silico calibration of a two-tone echoed CR (ZX90) gate.

    Orients the pair (control = higher-frequency qubit), then runs Nelder-Mead over
    (CR amplitude, cancellation amplitude, cancellation phase, DRAG, gate time) to
    maximise the leakage-aware average gate fidelity to ZX(π/2). Returns the best
    parameters and fidelity, or None if QuTiP is unavailable / integration fails.
    """
    if not available():
        return None
    from scipy.optimize import minimize

    # Orient: CR requires the control to be the higher-frequency transmon.
    swapped = f1_ghz < f2_ghz
    if swapped:
        f1_ghz, f2_ghz = f2_ghz, f1_ghz
        anh1_mhz, anh2_mhz = anh2_mhz, anh1_mhz

    ops = _operators()
    deadline = time.monotonic() + _CAL_DEADLINE_S

    def objective(x):
        cr_amp, cancel_amp, phase, drag, t_gate = x
        # soft physical bounds (CR gate window + perturbative drive amplitudes);
        # 0.0 is the worst possible objective (real −fidelity ∈ [−1, 0)), so these
        # act as barriers Nelder-Mead steers away from.
        if not (150.0 < t_gate < 700.0) \
                or abs(cr_amp) > _AMP_MAX_MHZ or abs(cancel_amp) > _AMP_MAX_MHZ:
            return 0.0
        if time.monotonic() > deadline:          # past budget → skip the ODE solve
            return 0.0
        props = _half_propagators(ops, f1_ghz, f2_ghz, anh1_mhz, anh2_mhz, g_mhz,
                                  t_gate, cr_amp, cancel_amp, phase, drag, _GRID)
        if props is None:
            return 0.0
        m4, _ = _echoed_block(*props)
        return -_fid_leak(m4)[0]

    # two basins: low-DRAG / shorter gate, and high-DRAG / longer gate
    starts = [
        [35.0, 18.0, math.pi, 1.0, 330.0],
        [48.0, 17.0, math.pi, 3.0, 400.0],
    ][:max(1, max_starts)]

    best = None
    for x0 in starts:
        res = minimize(objective, x0, method="Nelder-Mead",
                       options={"xatol": 0.1, "fatol": 2e-5, "maxiter": 160,
                                "maxfev": 200})
        fid = -float(res.fun)
        if best is None or fid > best["fidelity"]:
            best = {"x": [float(v) for v in res.x], "fidelity": fid}
        if best["fidelity"] >= target_fidelity:
            break  # early-exit once we are comfortably in the 99% regime

    cr_amp, cancel_amp, phase, drag, t_gate = best["x"]
    best.update(
        cr_amp_MHz=abs(cr_amp), cancel_amp_MHz=abs(cancel_amp),
        cancel_phase_rad=float(phase % _TWO_PI), drag=float(drag),
        t_gate_ns=float(t_gate),
        f_control_GHz=f1_ghz, f_target_GHz=f2_ghz,
        anh_control_MHz=anh1_mhz, anh_target_MHz=anh2_mhz,
        swapped=swapped,
    )
    return best


def _trajectory(ops, cal, g_mhz):
    """Population trajectory of |10⟩ (control excited) through the calibrated
    echoed pulse, for the UI chart. Records both echo halves with the ideal X_π
    applied instantaneously at the midpoint."""
    import qutip as qt

    f1, f2 = cal["f_control_GHz"], cal["f_target_GHz"]
    a1m, a2m = cal["anh_control_MHz"], cal["anh_target_MHz"]
    t_gate = cal["t_gate_ns"]
    # rebuild the two time-dependent Hamiltonians (grid of states, not just endpoint)
    n1, n2, big = ops["n1"], ops["n2"], ops["big"]
    a1o, a2o = ops["a1"], ops["a2"]
    h0 = (_TWO_PI * (f1 - f2)) * n1 \
        + 0.5 * (_TWO_PI * a1m / 1000.0) * (n1 * (n1 - big)) \
        + 0.5 * (_TWO_PI * a2m / 1000.0) * (n2 * (n2 - big)) \
        + (_TWO_PI * g_mhz / 1000.0) * (a1o.dag() * a2o + a1o * a2o.dag())
    A = _TWO_PI * cal["cr_amp_MHz"] / 1000.0
    B = _TWO_PI * cal["cancel_amp_MHz"] / 1000.0
    a1r = _TWO_PI * a1m / 1000.0
    beta = (-cal["drag"] / a1r) if a1r else 0.0
    phase = cal["cancel_phase_rad"]
    half = 0.5 * t_gate
    t0, sig = 0.5 * half, 0.25 * half

    def env(t):
        return math.exp(-(t - t0) ** 2 / (2.0 * sig * sig))

    def build(sign):
        return [h0,
                [ops["Xc"], lambda t, **k: sign * A * env(t)],
                [ops["Yc"], lambda t, **k: sign * A * beta * env(t) * (-(t - t0) / (sig * sig))],
                [ops["Xt"], lambda t, **k: sign * B * math.cos(phase) * env(t)],
                [ops["Yt"], lambda t, **k: sign * B * math.sin(phase) * env(t)]]

    tlist = np.linspace(0.0, half, _GRID_TRAJ)
    try:
        u_plus = qt.propagator(build(+1.0), tlist, options=_ODE_OPTS)
        u_minus = qt.propagator(build(-1.0), tlist, options=_ODE_OPTS)
    except Exception:  # noqa: BLE001
        return []

    psi0 = np.zeros(9, dtype=complex)
    psi0[physics._COMP_IDX[2]] = 1.0    # |10> (control excited, target ground)
    comp = physics._COMP_IDX
    traj = []

    def record(t_abs, vec):
        col = np.abs(vec) ** 2
        traj.append({
            "t_ns": round(float(t_abs), 3),
            "p00": round(float(col[comp[0]]), 4), "p01": round(float(col[comp[1]]), 4),
            "p10": round(float(col[comp[2]]), 4), "p11": round(float(col[comp[3]]), 4),
            "leak": round(float(1.0 - col[list(comp)].sum()), 4),
        })

    for k, t in enumerate(tlist):                       # first half: +CR
        record(t, u_plus[k].full() @ psi0)
    psi_mid = _XPI_CTRL @ (u_plus[-1].full() @ psi0)    # mid echo X_π on control
    for k in range(1, len(tlist) - 1):                  # second half interior: −CR
        record(half + tlist[k], u_minus[k].full() @ psi_mid)
    # final echo X_π closes the sequence (X_π·U(−)·X_π·U(+)); show the post-pulse
    # endpoint so the trajectory matches the reported gate unitary.
    record(t_gate, _XPI_CTRL @ (u_minus[-1].full() @ psi_mid))
    return traj


def simulate_cr_calibrated(f1_ghz: float, f2_ghz: float,
                           anh1_mhz: float = -310.0, anh2_mhz: float = -310.0,
                           g_mhz: float = 12.0, **_ignored) -> dict | None:
    """DRAG-calibrated two-tone echoed CR gate, returning the same result shape as
    `physics.simulate_two_qubit_gate` (plus a `calibration` block and `engine`
    tag). Returns None if QuTiP is unavailable or the simulation fails, so the
    caller can fall back to the analytic engine."""
    try:
        cal = calibrate_cr(f1_ghz, f2_ghz, anh1_mhz, anh2_mhz, g_mhz)
        if cal is None:
            return None
        ops = _operators()
        props = _half_propagators(
            ops, cal["f_control_GHz"], cal["f_target_GHz"],
            cal["anh_control_MHz"], cal["anh_target_MHz"], g_mhz,
            cal["t_gate_ns"], cal["cr_amp_MHz"], cal["cancel_amp_MHz"],
            cal["cancel_phase_rad"], cal["drag"], _GRID)
        if props is None:
            return None
        m4, uf = _echoed_block(*props)
    except Exception:  # noqa: BLE001 — honor the None-fallback contract on any failure
        return None
    fid, leak = _fid_leak(m4)
    cond = float(np.angle(uf[4, 4]) - np.angle(uf[1, 1])
                 - np.angle(uf[3, 3]) + np.angle(uf[0, 0]))
    traj = _trajectory(ops, cal, g_mhz)

    return {
        "gate": "Cross-Resonance (ZX90, DRAG-calibrated)",
        "note": ("Two-tone echoed cross-resonance, closed-loop calibrated: Gaussian CR "
                 "drive on the control + a cancellation tone on the target (nulls IX) + "
                 "DRAG (suppresses |1>->|2> leakage) + active π-echo (cancels ZI/ZZ). "
                 "Pulse knobs tuned by Nelder-Mead to maximise leakage-aware fidelity to "
                 "ZX(π/2) (Sheldon 2016; Sundaresan 2020). This is a COHERENT-CONTROL "
                 "fidelity: the echo π-pulses are idealized as instantaneous/error-free "
                 "and T1/T2 decoherence and spectator-qubit crosstalk are not included, "
                 "so it is an upper bound on the on-chip number."),
        "fidelity": round(fid, 6),
        "fidelity_pct": round(100.0 * fid, 4),
        "leakage": round(leak, 6),
        "leakage_pct": round(100.0 * leak, 4),
        "t_gate_ns": round(cal["t_gate_ns"], 3),
        "conditional_phase_deg": round(math.degrees(cond) % 360.0, 2),
        "f1_op_GHz": round(cal["f_control_GHz"], 4),
        "f2_op_GHz": round(cal["f_target_GHz"], 4),
        "g_MHz": round(g_mhz, 3),
        "drive_MHz": round(cal["cr_amp_MHz"], 3),
        "U_abs": [[round(float(abs(m4[i, j])), 4) for j in range(4)] for i in range(4)],
        "trajectory": traj,
        "init_state": "10",
        "engine": "qutip_two_tone_cr_drag",
        "calibration": {
            "cr_amp_MHz": round(cal["cr_amp_MHz"], 3),
            "cancel_amp_MHz": round(cal["cancel_amp_MHz"], 3),
            "cancel_phase_deg": round(math.degrees(cal["cancel_phase_rad"]) % 360.0, 2),
            "drag_weight": round(cal["drag"], 4),
            "control_is_q2": bool(cal["swapped"]),
            "optimizer": "Nelder-Mead (leakage-aware avg-gate-fidelity objective)",
        },
        "method": ("QuTiP time-dependent propagator (two qutrits), DRAG-calibrated "
                   "two-tone echoed cross-resonance; leakage-aware avg gate fidelity"),
    }
