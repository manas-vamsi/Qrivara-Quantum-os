import math

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from scipy.optimize import minimize
from sqlmodel import Session, select

from .. import physics
from ..db import get_session
from ..models import OptimizationRun
from ..schemas import InverseDesignRequest, OptimizationCreate, YieldRequest, reject_nonfinite

router = APIRouter(prefix="/optimization", tags=["optimization"])


def _num(d: dict, *keys, default):
    """First present, *finite* numeric value among keys (frontend uses several
    names). Rejects NaN/±Inf — float('inf'/'nan') would otherwise flow into the
    objective and poison the JSON columns / response (Postgres rejects non-finite
    JSON; strict parsers reject bare NaN/Infinity)."""
    for k in keys:
        v = d.get(k)
        if v is not None:
            try:
                f = float(v)
            except (TypeError, ValueError):
                continue
            if math.isfinite(f):
                return f
    return float(default)


@router.post("/start", status_code=201)
def start(body: OptimizationCreate, session: Session = Depends(get_session)):
    """Real multi-objective optimization of transmon design parameters.

    Minimizes a weighted objective (frequency error + anharmonicity error) over
    the physical device parameters (qubit capacitance C_Σ and junction critical
    current Ic) using a derivative-free Nelder-Mead search. Each f01/anharmonicity
    is computed from the exact charge-basis transmon diagonalization — so the
    convergence curve and the optimum are genuine, not scripted.
    """
    p = body.params or {}
    reject_nonfinite(p)  # non-finite values would poison the persisted JSON columns
    # Only attach to a design if it actually exists; otherwise this is a
    # standalone parameter optimization (no FK).
    from ..models import Design
    raw_id = p.get("design_id")
    design_id = raw_id if (raw_id and session.get(Design, str(raw_id))) else None
    f_target = _num(p, "target_freq_GHz", "targetF", default=5.1)
    anh_target = _num(p, "target_anharm_MHz", "targetAnh", default=-300.0)
    w_anh = _num(p, "anh_weight", default=0.25)

    # Physical search box: C_Σ ∈ [5,400] fF, Ic ∈ [1,200] nA. Bounds keep the
    # simplex feasible, so the objective never sees a nonsensical junction and
    # the convergence curve has no sentinel spikes.
    bounds = [(5.0, 400.0), (1.0, 200.0)]

    def objective(x) -> float:
        c = min(max(float(x[0]), bounds[0][0]), bounds[0][1])
        ic = min(max(float(x[1]), bounds[1][0]), bounds[1][1])
        ej = physics.ej_from_ic(ic)
        ec = physics.ec_from_capacitance(c)
        f, anh = physics.transmon_f01_anharm(ej, ec)
        fe = (f - f_target) / f_target
        ae = (anh - anh_target) / anh_target if anh_target else 0.0
        return fe * fe + w_anh * ae * ae

    x0 = np.array([
        min(max(_num(p, "c_sigma_fF", default=95.0), bounds[0][0]), bounds[0][1]),
        min(max(_num(p, "ic_nA", default=33.0), bounds[1][0]), bounds[1][1]),
    ])
    history: list[dict] = []
    best = [float("inf")]

    def record(x):
        loss = objective(x)
        best[0] = min(best[0], loss)
        history.append({"iter": len(history) + 1, "loss": round(loss, 6), "best": round(best[0], 6)})

    record(x0)                              # iteration 0 (starting point)
    res = minimize(objective, x0, method="Nelder-Mead", bounds=bounds, callback=record,
                   options={"maxiter": 120, "xatol": 1e-3, "fatol": 1e-8})

    c_opt = min(max(float(res.x[0]), bounds[0][0]), bounds[0][1])
    ic_opt = min(max(float(res.x[1]), bounds[1][0]), bounds[1][1])
    ej = physics.ej_from_ic(ic_opt)
    ec = physics.ec_from_capacitance(c_opt)
    f, anh = physics.transmon_f01_anharm(ej, ec)
    best_payload = {
        # min(res.fun, best-seen) so the reported score never exceeds the
        # convergence curve's final 'best' value.
        "score": round(min(float(res.fun), best[0]), 6),
        "iterations": len(history),
        "c_sigma_fF": round(c_opt, 2),
        "ic_nA": round(ic_opt, 3),
        "f01_GHz": round(f, 4),
        "anharmonicity_MHz": round(anh, 1),
        "EJ_GHz": round(ej, 3),
        "EC_MHz": round(ec * 1000, 1),
        "target_f01_GHz": f_target,
        "target_anharm_MHz": anh_target,
    }
    objectives = (
        {name: True for name in body.objectives}
        if isinstance(body.objectives, list)
        else dict(body.objectives)
    )
    run = OptimizationRun(
        design_id=design_id, method=body.method, objectives=objectives,
        params=p, status="complete", best=best_payload, history=history,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


@router.get("/{run_id}")
def status(run_id: str, session: Session = Depends(get_session)):
    run = session.get(OptimizationRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/{run_id}/results")
def results(run_id: str, session: Session = Depends(get_session)):
    run = session.get(OptimizationRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return {"id": run.id, "best": run.best, "history": run.history,
            "pareto": _pareto(), "region": physics.sweep_ej_ec()}


@router.post("/inverse")
def inverse_design(body: InverseDesignRequest):
    """Target spec -> device parameters (real inverse of the transmon relations)."""
    return physics.design_for_target(body.target_frequency, body.target_anharmonicity)


@router.post("/montecarlo")
def monte_carlo(sigma_pct: float = 2.0, samples: int = 3000):
    """Yield analysis: vary Ic & capacitance by sigma%, histogram f01, report yield."""
    import random

    rng = random.Random(7919)
    lo, hi = 5.05, 5.21
    fs, in_spec = [], 0
    for _ in range(samples):
        c = 80 * (1 + sigma_pct / 100 * rng.gauss(0, 1))
        ic = 30 * (1 + sigma_pct / 100 * rng.gauss(0, 1))
        f = physics.f01(physics.ej_from_ic(ic), physics.ec_from_capacitance(c))
        fs.append(f)
        if lo <= f <= hi:
            in_spec += 1
    bins, f_min, f_max = 28, 4.75, 5.55
    w = (f_max - f_min) / bins
    hist = [0] * bins
    for f in fs:
        idx = int((f - f_min) / w)
        if 0 <= idx < bins:
            hist[idx] += 1
    return {
        "yield_pct": round(100 * in_spec / samples, 1),
        "spec": [lo, hi],
        "histogram": [{"f": round(f_min + (i + 0.5) * w, 3), "count": hist[i]} for i in range(bins)],
    }


@router.post("/yield")
def yield_analysis(body: YieldRequest):
    """Process-variation yield with per-parameter mean/sigma/tolerance.

    Each parameter is sampled from N(mean, sigma); f01 is recomputed per sample;
    yield = fraction inside the spec window. Also returns per-parameter
    sensitivity (variance contribution) and a histogram.
    """
    import random

    rng = random.Random(2718)
    specs = {p.name: p for p in body.parameters} or {
        "c_sigma_fF": _spec("c_sigma_fF", 80, 1.6),
        "ic_nA": _spec("ic_nA", 30, 0.6),
    }
    c = specs.get("c_sigma_fF") or _spec("c_sigma_fF", 80, 0)
    ic = specs.get("ic_nA") or _spec("ic_nA", 30, 0)

    fs, in_spec = [], 0
    for _ in range(body.samples):
        cv = rng.gauss(c.mean, c.sigma) if c.sigma else c.mean
        iv = rng.gauss(ic.mean, ic.sigma) if ic.sigma else ic.mean
        f = physics.f01(physics.ej_from_ic(iv), physics.ec_from_capacitance(cv))
        fs.append(f)
        if body.spec_lo_GHz <= f <= body.spec_hi_GHz:
            in_spec += 1

    # sensitivity: vary one param at a time, measure f01 std
    def std_when_only(active: str) -> float:
        vals = []
        for _ in range(2000):
            cv = rng.gauss(c.mean, c.sigma) if active == "c_sigma_fF" and c.sigma else c.mean
            iv = rng.gauss(ic.mean, ic.sigma) if active == "ic_nA" and ic.sigma else ic.mean
            vals.append(physics.f01(physics.ej_from_ic(iv), physics.ec_from_capacitance(cv)))
        m = sum(vals) / len(vals)
        return (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5

    bins, f_min, f_max = 30, 4.7, 5.6
    w = (f_max - f_min) / bins
    hist = [0] * bins
    for f in fs:
        idx = int((f - f_min) / w)
        if 0 <= idx < bins:
            hist[idx] += 1
    return {
        "yield_pct": round(100 * in_spec / body.samples, 2),
        "samples": body.samples,
        "spec": [body.spec_lo_GHz, body.spec_hi_GHz],
        "sensitivity": {
            "c_sigma_fF": round(std_when_only("c_sigma_fF") * 1000, 1),
            "ic_nA": round(std_when_only("ic_nA") * 1000, 1),
        },
        "histogram": [{"f": round(f_min + (i + 0.5) * w, 3), "count": hist[i]} for i in range(bins)],
    }


def _spec(name, mean, sigma):
    from ..schemas import ParamSpec
    return ParamSpec(name=name, mean=mean, sigma=sigma)


@router.get("/region/ej-ec")
def ej_ec_region():
    return physics.sweep_ej_ec()


def _pareto():
    """Real gate-speed vs ZZ-crosstalk trade-off for a coupled transmon pair.

    The canonical transmon-coupler tension: a stronger exchange coupling J gives
    a faster two-qubit gate (gate rate ∝ J) but raises the static ZZ error
    (ζ ∝ J², from second-order perturbation theory, `physics.zz_interaction`).
    For each J we also sweep the qubit–qubit detuning Δ, which reshapes ζ at fixed
    J. A point is Pareto-optimal when no other point has both higher coupling
    (faster gate) AND lower ZZ crosstalk. anh = −300 MHz, f1 = 5.0 GHz.
    """
    f1, anh = 5.0, -300.0
    pts = []
    for j in (3, 5, 7, 10, 13, 17, 22, 28):                 # exchange coupling (MHz)
        for det in (0.04, 0.07, 0.12, 0.20):                # detuning Δ (GHz), clear of ±α poles
            zz_khz = abs(physics.zz_interaction(f1, f1 + det, anh, anh, float(j)))
            pts.append({"zz": round(zz_khz, 1), "j": float(j),
                        "detuning_MHz": round(det * 1000, 0)})
    # dominance: higher j (faster gate) is better, lower zz is better
    for p in pts:
        p["dominated"] = any(
            (q["j"] >= p["j"] and q["zz"] <= p["zz"])
            and (q["j"] > p["j"] or q["zz"] < p["zz"])
            for q in pts
        )
    return pts
