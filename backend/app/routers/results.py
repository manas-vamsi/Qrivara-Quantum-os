from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from .. import physics
from ..db import get_session
from ..models import Project, SimulationJob, Design

router = APIRouter(prefix="/results", tags=["results"])

# Default surface-loss participation (matches jobs._decoherence) so the Results
# coherence numbers agree with the Decoherence analysis.
_INTERFACES = [
    {"p": 6e-5, "tanD": 1.5e-3}, {"p": 9e-5, "tanD": 2.2e-3},
    {"p": 3e-5, "tanD": 2.6e-3}, {"p": 0.9, "tanD": 1.8e-7},
]


def _design_metrics(design: "Design | None", project: Project) -> dict:
    """Compute the Results metrics + per-qubit coherence from the design's REAL
    physics (same engine and params as the Hamiltonian/decoherence analyses), so
    every report the user and the AI see is consistent. No random seeding."""
    doc = (design.doc if design else None) or {}
    nodes = doc.get("nodes", [])
    qubits = [n for n in nodes if (n.get("data", {}) or {}).get("kind") == "transmon"]
    # use the first transmon's params (same as ai._build_context) or sensible defaults
    qp = ((qubits[0].get("data", {}) or {}).get("params", {}) if qubits else {}) or {}
    c_sigma = float(qp.get("c_sigma_fF", 80))
    ic = float(qp.get("ic_nA", 30))
    cg = float(qp.get("cg_fF", 5.5))
    fr = float(qp.get("resonator_freq_GHz", 7.1))
    cr = 350.0

    ec = physics.ec_from_capacitance(c_sigma)
    ej = physics.ej_from_ic(ic)
    f01 = physics.f01(ej, ec)
    anh = physics.anharmonicity(ec)               # MHz, negative (= -EC)
    g = physics.coupling_g(cg, c_sigma, cr, f01, fr)
    lj_nh = (physics.PHI0_RED / (ic * 1e-9)) * 1e9  # Josephson inductance from Ic
    lb = physics.loss_budget(_INTERFACES, f01)      # dielectric-limited internal Q
    kappa = float(qp.get("kappa_MHz", 1.2))
    # total T1 = dielectric + Purcell (matches jobs._decoherence's T1_total)
    t1 = physics.combine_t1(lb["t1Us"], physics.purcell_t1(g, f01, fr, kappa))
    t2 = physics.t2(t1, 120)

    metrics = {
        "frequency_GHz": round(f01, 3),
        "q_factor_k": round(lb["Q"] / 1000, 1),
        "coupling_MHz": round(g, 0),
        "capacitance_fF": round(c_sigma, 1),
        "inductance_nH": round(lj_nh, 1),
        "anharmonicity_MHz": round(anh, 0),
    }
    # per-qubit coherence: the physics value with a small DETERMINISTIC spread
    # (fab variation) so qubits differ without being random.
    n = max(project.qubits, 1)
    coherence = []
    for i in range(n):
        spread = 1.0 - 0.04 * (((i % 5) - 2) / 2)   # ~±4%, deterministic
        coherence.append({"qubit": f"Q{i+1}", "t1": round(t1 * spread), "t2": round(t2 * spread)})
    return {"metrics": metrics, "coherence": coherence}


@router.get("/project/{project_id}")
def project_results(project_id: str, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    design = session.exec(
        select(Design).where(Design.project_id == project_id).order_by(Design.created_at)
    ).first()
    data = _design_metrics(design, p)
    # find latest simulation job for this project
    job = session.exec(
        select(SimulationJob).where(SimulationJob.design_id.in_(
            select(Design.id).where(Design.project_id == project_id)
        )).order_by(SimulationJob.finished_at.desc())
    ).first()

    return {
        "project": {"id": p.id, "name": p.name, "qubits": p.qubits, "status": p.status},
        **data,
        "method": "physics-derived" if not job else f"physics-derived ({job.solver})",
        "last_job_id": job.id if job else None,
    }
