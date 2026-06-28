"""Export endpoints — designs → GDS-II/DXF, results → JSON/CSV/Touchstone/Markdown.

All return a downloadable file (Content-Disposition: attachment) with the right
media type so the browser saves it directly.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session, select

from .. import export as X
from .. import qiskit_export as QE
from ..db import get_session
from ..models import Design, SimulationJob, User
from ..security import get_current_user, require_design_role, require_job_role

router = APIRouter(tags=["export"])


def _assemble_results(design: Design, session: Session, fill: bool = True) -> dict:
    """Most-recent completed result per analysis type for a design. When `fill`, also
    computes LOM → decoherence → gate-fidelity → readout live for anything not yet
    simulated, so the digital twin / Aer / report are meaningful on a fresh design."""
    jobs = session.exec(
        select(SimulationJob).where(
            SimulationJob.design_id == design.id, SimulationJob.status == "done"
        ).order_by(SimulationJob.created_at.desc())
    ).all()
    results: dict = {}
    for j in jobs:
        if j.type not in results and j.result:
            results[j.type] = j.result
    if not fill:
        return results
    from .. import jobs as J
    nodes = (design.doc or {}).get("nodes", [])
    try:
        if "lom" not in results and "hamiltonian" not in results:
            lom = J._lom(nodes, {})
            if lom.get("qubits"):
                results["lom"] = lom
        qs = (results.get("lom") or {}).get("qubits") or []
        f01 = float(qs[0]["f01_GHz"]) if qs else 5.0
        if "decoherence" not in results:
            results["decoherence"] = J._decoherence({"f01_GHz": f01})
        if "gate_fidelity" not in results:
            results["gate_fidelity"] = J._gate_fidelity({"f01_GHz": f01})
        if "readout" not in results:
            results["readout"] = J._readout({"f01_GHz": f01})
    except Exception:  # noqa: BLE001 — partial is fine; _collect has defaults
        pass
    return results


@router.get("/designs/{design_id}/aer")
def aer_simulate(
    design_id: str,
    circuit: str = "ghz",
    shots: int = 2048,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Run a circuit against the designed chip's NOISE MODEL (qiskit-aer): build
    thermal-relaxation + depolarizing + readout errors from this design's computed
    T1/T2/gate-errors, then return ideal-vs-noisy outcomes + fidelity. The digital
    twin actually executing — "what would my chip produce?"."""
    design = require_design_role(design_id, user, session, "viewer")
    if not QE.aer_available():
        raise HTTPException(503, "qiskit-aer is not installed on this server")
    results = _assemble_results(design, session)
    try:
        out = QE.simulate_noisy(results, circuit=circuit, shots=shots)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Aer simulation failed: {str(exc)[:120]}")
    out["design_id"] = design_id
    return out


@router.get("/designs/{design_id}/qiskit-target")
def qiskit_target(
    design_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Export the chip as a Qiskit Target descriptor (a 'digital twin'): qubit
    frequencies/coherence, gate errors/durations, and the coupling map, assembled
    from this design's completed simulation results (plus a live Hamiltonian solve
    if none has been run). Lets users transpile/simulate circuits against the chip
    they designed. Pure-JSON — needs no Qiskit on the server."""
    design = require_design_role(design_id, user, session, "viewer")
    jobs = session.exec(
        select(SimulationJob).where(
            SimulationJob.design_id == design_id, SimulationJob.status == "done"
        ).order_by(SimulationJob.created_at.desc())
    ).all()
    # most-recent result per analysis type
    results: dict = {}
    for j in jobs:
        if j.type not in results and j.result:
            results[j.type] = j.result
    # ensure at least a Hamiltonian/LOM so the export is meaningful
    if "lom" not in results and "hamiltonian" not in results:
        from .. import jobs as J
        doc = design.doc or {}
        try:
            lom = J._lom(doc.get("nodes", []), {})
            if lom.get("qubits"):
                results["lom"] = lom
        except Exception:  # noqa: BLE001
            pass
    descriptor = QE.build_target_descriptor(results)
    descriptor["design_id"] = design_id
    descriptor["qiskit_installed"] = QE.available()
    return descriptor

# NOTE: the frontend triggers these via window.open (a plain GET), which cannot
# carry the X-Dev-User-Id header — so in dev mode they resolve as the fallback
# user. With real JWT auth (prod) a token-bearing download is required; until
# then these export the fab-sensitive GDS/DXF only for the resolved identity.


@router.get("/designs/{design_id}/report")
def design_report(
    design_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Assemble a complete, printable chip 'datasheet' for a design: per-qubit
    Hamiltonian, coherence budget, gate fidelity, fabrication yield, capacitance and
    DRC — everything computed from the layout. The frontend renders it as a report
    the user can save as PDF."""
    from datetime import datetime, timezone
    from .. import jobs as J

    design = require_design_role(design_id, user, session, "viewer")
    from ..models import Project
    project = session.get(Project, design.project_id) if design.project_id else None
    doc = design.doc or {"nodes": [], "edges": []}
    nodes, edges = doc.get("nodes", []), doc.get("edges", [])

    def safe(fn, default):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)[:80], **(default or {})}

    lom = safe(lambda: J._lom(nodes, {}), {"qubits": [], "couplings": []})
    qubits = lom.get("qubits", []) or []
    f01 = float(qubits[0]["f01_GHz"]) if qubits else 5.0
    anh = float(qubits[0].get("anharmonicity_MHz", -310.0)) if qubits else -310.0
    decoh = safe(lambda: J._decoherence({"f01_GHz": f01, "anharmonicity_MHz": anh}), {})
    gates = safe(lambda: J._gate_fidelity({"f01_GHz": f01, "anharmonicity_MHz": anh}), {})
    yld = safe(lambda: J._fabrication({"target_freq_GHz": f01, "anharmonicity_MHz": anh}), {})
    cap = safe(lambda: J._capacitance(nodes, {}), {})
    drc = safe(lambda: J._validation(nodes, edges), {})

    return {
        "design_id": design_id,
        "design_name": design.name,
        "project_name": project.name if project else "Untitled",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "summary": {
            "n_qubits": len(qubits),
            "n_components": len(nodes),
            "n_connections": len(edges),
            "drc_passed": drc.get("passed"),
            "drc_total": drc.get("total"),
            "yield_pct": yld.get("yield_pct"),
        },
        "qubits": qubits,
        "couplings": lom.get("couplings", []),
        "coherence": decoh,
        "gates": gates,
        "yield": yld,
        "capacitance": {"labels": cap.get("labels", []), "matrix": cap.get("maxwell_matrix_fF", []),
                        "method": cap.get("method", "")},
        "drc": drc,
        "lom_source": lom.get("source") or lom.get("method"),
    }


@router.get("/export/formats")
def formats():
    """Supported export formats (drives the UI's export menu)."""
    return {"design": X.DESIGN_FORMATS, "result": X.RESULT_FORMATS}


def _download(content, media: str, filename: str) -> Response:
    body = content.encode("utf-8") if isinstance(content, str) else content
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/designs/{design_id}/export/{fmt}")
def export_design(
    design_id: str,
    fmt: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    design = require_design_role(design_id, user, session, "viewer")
    spec = X.DESIGN_FORMATS.get(fmt)
    if not spec:
        raise HTTPException(400, f"Unknown design format '{fmt}'. Use: {list(X.DESIGN_FORMATS)}")
    doc = design.doc or {"nodes": [], "edges": []}
    if fmt == "gds":
        content = X.design_to_gds(doc)
    elif fmt == "drc":
        content = X.design_to_drc(doc)
    else:
        content = X.design_to_dxf(doc)
    return _download(content, spec["media"], f"{design_id}.{spec['ext']}")


@router.get("/simulations/{job_id}/export/{fmt}")
def export_result(
    job_id: str,
    fmt: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    job = require_job_role(job_id, user, session, "viewer")
    if job.status != "done" or not job.result:
        raise HTTPException(409, f"Job is '{job.status}', no result to export")
    spec = X.RESULT_FORMATS.get(fmt)
    if not spec:
        raise HTTPException(400, f"Unknown result format '{fmt}'. Use: {list(X.RESULT_FORMATS)}")
    result = job.result
    if fmt == "json":
        content = X.result_to_json(result)
    elif fmt == "csv":
        content = X.result_to_csv(result)
    elif fmt == "touchstone":
        content = X.result_to_touchstone(result)
    else:
        content = X.result_to_markdown(job.type, job.params or {}, result)
    return _download(content, spec["media"], f"{job.type}_{job_id}.{spec['ext']}")
