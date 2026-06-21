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
