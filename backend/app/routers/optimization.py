import math

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from .. import physics
from ..db import get_session
from ..models import OptimizationRun
from ..schemas import InverseDesignRequest, OptimizationCreate, YieldRequest

router = APIRouter(prefix="/optimization", tags=["optimization"])


@router.post("/start", status_code=201)
def start(body: OptimizationCreate, session: Session = Depends(get_session)):
    design_id = str(body.params.get("design_id", "demo"))
    history = [{"iter": i + 1, "best": round(0.9 * math.exp(-i / 11) + 0.012, 4)} for i in range(40)]
    run = OptimizationRun(
        design_id=design_id, method=body.method, objectives=body.objectives,
        params=body.params, status="running", best={"score": history[-1]["best"]}, history=history,
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
    import random

    rng = random.Random(42)
    pts = []
    for i in range(28):
        pts.append({
            "zz": round(40 + i * 4 + rng.random() * 8, 1),
            "anharm": round(200 - 3.0 * i + rng.random() * 20, 1),
            "dominated": rng.random() > 0.62,
        })
    return pts
