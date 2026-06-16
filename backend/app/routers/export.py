"""Export endpoints — designs → GDS-II/DXF, results → JSON/CSV/Touchstone/Markdown.

All return a downloadable file (Content-Disposition: attachment) with the right
media type so the browser saves it directly.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlmodel import Session

from .. import export as X
from ..db import get_session
from ..models import Design, SimulationJob

router = APIRouter(tags=["export"])


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
def export_design(design_id: str, fmt: str, session: Session = Depends(get_session)):
    design = session.get(Design, design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    spec = X.DESIGN_FORMATS.get(fmt)
    if not spec:
        raise HTTPException(400, f"Unknown design format '{fmt}'. Use: {list(X.DESIGN_FORMATS)}")
    doc = design.doc or {"nodes": [], "edges": []}
    content = X.design_to_gds(doc) if fmt == "gds" else X.design_to_dxf(doc)
    return _download(content, spec["media"], f"{design_id}.{spec['ext']}")


@router.get("/simulations/{job_id}/export/{fmt}")
def export_result(job_id: str, fmt: str, session: Session = Depends(get_session)):
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
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
