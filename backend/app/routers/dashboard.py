"""Dashboard aggregation — real, computed workspace stats scoped to the current
user's visible projects. No mock/random data: KPIs come from the actual project /
simulation / optimization records, and Avg Gate Fidelity is computed with the same
deterministic physics engine the analyses use (LOM-free coherence → gate error)."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from .. import jobs, physics
from ..db import get_session
from ..models import Activity, Design, OptimizationRun, Project, SimulationJob, User
from ..security import get_current_user, visible_project_ids

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Representative result key per analysis type for the solver-queue summary line.
_RESULT_KEY = {
    "frequency": ("resonance_GHz", "GHz"),
    "eigenmode": (None, ""),
    "capacitance": (None, ""),
    "coupling": ("g_MHz", "MHz"),
    "hamiltonian": ("f01_GHz", "GHz"),
    "decoherence": ("T1_total_us", "µs"),
    "gate_fidelity": ("fidelity_2q_pct", "%"),
    "readout": ("assignment_fidelity_pct", "%"),
    "scattering": ("f0_GHz", "GHz"),
}


def _aware(dt: datetime) -> datetime:
    return dt if (dt and dt.tzinfo) else (dt.replace(tzinfo=timezone.utc) if dt else dt)


def _project_fidelity_pct(design: Design | None) -> float | None:
    """Deterministic coherence-limited 2Q gate fidelity [%] for a design's primary
    transmon, via the same audited engine the Gate-Fidelity analysis uses. Prefers
    the design's explicitly-specified frequency/anharmonicity/coupling; otherwise
    derives them from the capacitance/junction params (and finally defaults)."""
    doc = (design.doc if design else None) or {}
    qubits = [n for n in doc.get("nodes", []) if (n.get("data", {}) or {}).get("kind") == "transmon"]
    if not qubits:
        return None
    qp = (qubits[0].get("data", {}) or {}).get("params", {}) or {}
    c_sigma = float(qp.get("c_sigma_fF", 80))
    fr = float(qp.get("resonator_freq_GHz", 7.1))
    ec = physics.ec_from_capacitance(c_sigma)
    f01_calc, anh_calc = physics.transmon_f01_anharm(physics.ej_from_ic(float(qp.get("ic_nA", 30))), ec)
    # Use the design's stated target frequency / anharmonicity when present.
    f01 = float(qp.get("f01_GHz", qp.get("target_freq_GHz", 0)) or 0) or f01_calc
    anh = float(qp.get("anharmonicity_MHz", 0) or 0) or anh_calc
    g = float(qp.get("g_MHz", 0) or 0) or physics.coupling_g(float(qp.get("cg_fF", 5.5)), c_sigma, 350.0, f01, fr)
    res = jobs._gate_fidelity({
        "f01_GHz": f01, "anharmonicity_MHz": anh, "g_MHz": g,
        "resonator_freq_GHz": fr, "kappa_MHz": float(qp.get("kappa_MHz", 1.2)),
    })
    return res["fidelity_2q_pct"]


def _optimization_gain_pct(runs: list[OptimizationRun]) -> tuple[float | None, int]:
    """Average % improvement (first → best objective score) across the user's
    optimization runs. Robust to history stored as numbers or {score|best} dicts."""
    gains = []
    for r in runs:
        hist = r.history or []
        scores = []
        for h in hist:
            if isinstance(h, (int, float)):
                scores.append(float(h))
            elif isinstance(h, dict):
                # history entries are {"iter","loss","best"}; "best" is the
                # running minimum, so first→last best is the real improvement.
                v = h.get("best", h.get("loss"))
                if isinstance(v, (int, float)):
                    scores.append(float(v))
        if len(scores) >= 2 and scores[0] > 0:
            first, best = scores[0], min(scores)
            gains.append(max(0.0, (first - best) / first) * 100.0)
    avg = round(sum(gains) / len(gains), 1) if gains else None
    return avg, len(runs)


def _job_result_summary(job: SimulationJob) -> str | None:
    key, unit = _RESULT_KEY.get(job.type, (None, ""))
    if key and isinstance(job.result, dict):
        v = job.result.get(key)
        if isinstance(v, (int, float)):
            return f"{round(v, 2)} {unit}".strip()
    return None


def _job_duration(job: SimulationJob) -> str | None:
    if job.started_at and job.finished_at:
        secs = (_aware(job.finished_at) - _aware(job.started_at)).total_seconds()
        if secs >= 0:
            return f"{int(secs // 60)}m {int(secs % 60):02d}s" if secs >= 60 else f"{secs:.1f}s"
    return None


@router.get("")
def dashboard(
    days: int = Query(14, ge=7, le=90),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    pids = list(visible_project_ids(user, session))
    projects = [p for p in (session.get(Project, pid) for pid in pids) if p]

    designs = (
        session.exec(select(Design).where(Design.project_id.in_(pids))).all() if pids else []
    )
    design_ids = [d.id for d in designs]
    sim_jobs = (
        session.exec(select(SimulationJob).where(SimulationJob.design_id.in_(design_ids))).all()
        if design_ids else []
    )
    # Design-attached runs only — standalone runs (design_id=None) have no project
    # to authorize against, so they are intentionally excluded from the scope.
    opt_runs = (
        session.exec(select(OptimizationRun).where(OptimizationRun.design_id.in_(design_ids))).all()
        if design_ids else []
    )

    # ---- KPI: active qubits (+ added this week) ----
    week_ago = now - timedelta(days=7)
    active_qubits = sum(p.qubits for p in projects if p.status == "active")
    new_qubits = sum(p.qubits for p in projects if p.status == "active" and _aware(p.created_at) >= week_ago)

    # ---- KPI: simulations today vs yesterday (calendar day, UTC) ----
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yest_start = today_start - timedelta(days=1)
    sims_today = sum(1 for j in sim_jobs if _aware(j.created_at) >= today_start)
    sims_prev = sum(1 for j in sim_jobs if yest_start <= _aware(j.created_at) < today_start)
    if sims_prev > 0:
        sims_delta = {"value": f"{round((sims_today - sims_prev) / sims_prev * 100)}%",
                      "positive": sims_today >= sims_prev}
    elif sims_today > 0:
        sims_delta = {"value": "new", "positive": True}
    else:
        sims_delta = None

    # ---- KPI: avg gate fidelity (deterministic physics, primary design/project) ----
    primary: dict[str, Design] = {}
    for d in sorted(designs, key=lambda x: _aware(x.created_at)):
        primary.setdefault(d.project_id, d)
    fids = [f for f in (_project_fidelity_pct(primary.get(p.id)) for p in projects) if f is not None]
    avg_fidelity = round(sum(fids) / len(fids), 2) if fids else None

    # ---- KPI: optimization gain ----
    opt_gain, opt_count = _optimization_gain_pct(opt_runs)

    # ---- Throughput series (per-day sims + designs over the window) ----
    start_day = (now - timedelta(days=days - 1)).date()
    buckets = {start_day + timedelta(days=i): [0, 0] for i in range(days)}
    for j in sim_jobs:
        d = _aware(j.created_at).date()
        if d in buckets:
            buckets[d][0] += 1
    for dz in designs:
        d = _aware(dz.created_at).date()
        if d in buckets:
            buckets[d][1] += 1
    ordered = sorted(buckets.items())
    throughput = [{"day": i, "date": str(dt), "sims": v[0], "designs": v[1]}
                  for i, (dt, v) in enumerate(ordered)]
    # cumulative active-qubit count per day (real sparkline for the qubits card)
    qubit_spark = []
    for dt, _v in ordered:
        cutoff = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)
        qubit_spark.append(sum(p.qubits for p in projects
                               if p.status == "active" and _aware(p.created_at) <= cutoff))

    # ---- Solver queue (real recent jobs, newest first) ----
    proj_by_design = {d.id: d.project_id for d in designs}
    name_by_project = {p.id: p.name for p in projects}
    recent = sorted(sim_jobs, key=lambda j: _aware(j.created_at), reverse=True)[:6]
    queue = []
    for j in recent:
        proj_id = proj_by_design.get(j.design_id)
        label = jobs.SIMULATION_TYPES.get(j.type, {}).get("label", j.type)
        queue.append({
            "id": j.id, "type": j.type, "label": label,
            "project": name_by_project.get(proj_id),
            "solver": j.solver, "status": j.status, "progress": j.progress,
            "result": _job_result_summary(j), "duration": _job_duration(j),
        })

    running = sum(1 for j in sim_jobs if j.status == "running")
    queued = sum(1 for j in sim_jobs if j.status == "queued")

    return {
        "kpis": {
            "active_qubits": {
                "value": active_qubits,
                "delta": ({"value": f"+{new_qubits} this week", "positive": True} if new_qubits else None),
                "spark": qubit_spark,
            },
            "simulations_today": {
                "value": sims_today, "delta": sims_delta,
                "spark": [t["sims"] for t in throughput],
            },
            "avg_gate_fidelity": {
                "value": avg_fidelity, "unit": "%",
                "subtitle": f"across {len(fids)} design{'s' if len(fids) != 1 else ''}" if fids else "no designs yet",
                # only a sparkline when designs actually differ — a flat line is noise
                "spark": (sorted(round(f, 2) for f in fids)
                          if len(fids) >= 2 and (max(fids) - min(fids) > 0.01) else []),
            },
            "optimization_gain": {
                "value": opt_gain, "unit": "%",
                "subtitle": f"{opt_count} run{'s' if opt_count != 1 else ''}" if opt_count else "no runs yet",
                "spark": [],
            },
        },
        "throughput": throughput,
        "solver_queue": queue,
        "summary": {
            "active_projects": sum(1 for p in projects if p.status == "active"),
            "total_projects": len(projects),
            "running": running, "queued": queued,
            "optimizations": opt_count,
        },
    }
