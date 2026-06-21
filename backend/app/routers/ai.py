"""AI advisor endpoint for the Optimization page.

POST /ai/analyze { project_id } — assembles the project's currently-computed
reports (DRC, Hamiltonian/coherence, decoherence budget, fabrication yield,
capacitance, extracted metrics) server-side, then asks Gemini for an expert
review of what's lacking and how to improve yield/efficiency. Returns both the
assembled context (so the UI can show the data) and the AI report.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from .. import ai as AI
from .. import designgen
from .. import jobs
from ..db import get_session
from ..models import Design, Project
from ..routers.results import _design_metrics

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/generate-design")
def generate_design(body: dict):
    """Natural-language -> a complete, simulatable chip design doc.
    The frontend creates a project, saves the returned doc, and opens it in the
    Visual Designer. Always returns a valid {nodes, edges} design (LLM-parsed when
    available, keyword-parsed otherwise)."""
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(422, "A design prompt is required")
    if len(prompt) > 2000:
        raise HTTPException(422, "Prompt too long")
    return designgen.generate(prompt)


def _build_context(project: Project, design: Design | None) -> dict:
    """Run the existing analyses to assemble the report bundle the AI reviews."""
    doc = (design.doc if design else None) or {"nodes": [], "edges": []}
    nodes, edges = doc.get("nodes", []), doc.get("edges", [])
    qubits = [n for n in nodes if (n.get("data", {}) or {}).get("kind") == "transmon"]
    # pull params off the first transmon if present, else sensible defaults
    qp = ((qubits[0].get("data", {}) or {}).get("params", {}) if qubits else {}) or {}
    ham_params = {
        "qubit": "transmon",
        "c_sigma_fF": float(qp.get("c_sigma_fF", 80)),
        "ic_nA": float(qp.get("ic_nA", 30)),
    }
    metrics = _design_metrics(design, project)
    ctx = {
        "project": {"name": project.name, "qubits": project.qubits,
                    "status": project.status, "domain": project.domain},
        "component_counts": {
            "transmons": len(qubits),
            "total_nodes": len(nodes),
            "connections": len(edges),
        },
        "metrics": metrics["metrics"],
        "coherence": metrics["coherence"],
    }
    # best-effort: each analysis is independent, never let one failure block the rest
    for name, fn in (
        ("validation_drc", lambda: jobs._validation(nodes, edges)),
        ("hamiltonian", lambda: jobs._hamiltonian(ham_params)),
        ("decoherence", lambda: jobs._decoherence({"f01_GHz": metrics["metrics"]["frequency_GHz"]})),
        ("fabrication_yield", lambda: jobs._fabrication({"target_freq_GHz": metrics["metrics"]["frequency_GHz"]})),
        ("capacitance", lambda: jobs._capacitance(nodes, {})),
    ):
        try:
            ctx[name] = fn()
        except Exception as e:  # noqa: BLE001
            ctx[name] = {"error": str(e)}
    return ctx


@router.get("/status")
def ai_status():
    """Whether the AI advisor is configured (drives the UI's enabled/disabled state).
    The underlying model/provider is deliberately not exposed to the client."""
    return {"configured": AI.is_configured()}


@router.post("/analyze")
def analyze(body: dict, session: Session = Depends(get_session)):
    project_id = body.get("project_id")
    if not project_id:
        raise HTTPException(400, "project_id is required")
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    design = session.exec(
        select(Design).where(Design.project_id == project_id).order_by(Design.created_at)
    ).first()

    context = _build_context(project, design)
    try:
        report = AI.analyze_project(context)
    except AI.AIUnavailable as e:
        raise HTTPException(503, str(e))
    return {"project": context["project"], "context": context, "report": report}


def _resolve_project(session: Session, query: str) -> Project | None:
    """Find a project by exact id, else case-insensitive name match (exact then
    substring). Returns None if nothing matches."""
    if not query:
        return None
    p = session.get(Project, query)
    if p:
        return p
    projects = session.exec(select(Project)).all()
    q = query.strip().lower()
    for proj in projects:  # exact name first
        if proj.name.lower() == q:
            return proj
    for proj in projects:  # then substring
        if q in proj.name.lower():
            return proj
    return None


def _make_tools(session: Session) -> list:
    """Build the agent's data-reading tools, bound to this request's DB session.
    Each is a plain callable with type hints + a docstring so the model can call
    it automatically. They read REAL data so the assistant never has to guess."""

    def list_projects() -> list[dict]:
        """List all QRIVARA projects with their id, name, number of qubits, status and domain.
        Call this to discover which projects exist or to disambiguate a project name."""
        return [
            {"id": p.id, "name": p.name, "qubits": p.qubits, "status": p.status, "domain": p.domain}
            for p in session.exec(select(Project)).all()
        ]

    def get_project_analysis(project: str) -> dict:
        """Get the full computed analysis bundle for one project: extracted metrics
        (frequency_GHz, q_factor_k, coupling_MHz, capacitance_fF, inductance_nH,
        anharmonicity_MHz), per-qubit coherence (T1/T2), Hamiltonian (EC/EJ/f01/chi/T1/T2),
        decoherence budget, fabrication yield & frequency drift, DRC validation, and the
        capacitance matrix. `project` may be a project name (partial, case-insensitive) or id."""
        p = _resolve_project(session, project)
        if not p:
            return {"error": f"No project matches '{project}'. Use list_projects to see available projects."}
        design = session.exec(
            select(Design).where(Design.project_id == p.id).order_by(Design.created_at)
        ).first()
        return _build_context(p, design)

    def list_component_types() -> list[dict]:
        """List the QRIVARA component library: id, name, category and description for each
        component type (qubits, resonators, couplers, control, readout, chip features)."""
        from ..catalog import COMPONENT_LIBRARY
        return [
            {"id": c["id"], "name": c["name"], "category": c["category"],
             "description": c.get("description", "")}
            for c in COMPONENT_LIBRARY
        ]

    def get_parameter_specs() -> dict:
        """Return the recommended ranges for key design parameters (unit, min, max, typical
        value, group) — e.g. target_freq_GHz, anharmonicity_MHz, c_sigma_fF, ic_nA,
        junction_tolerance_pct. Use this to advise whether a value is in a sensible range."""
        from ..catalog import PARAMETER_SPECS
        return PARAMETER_SPECS

    # OpenAI-compatible tool specs (schema + bound callable) for the agent loop.
    return [
        {"name": "list_projects",
         "description": "List all QRIVARA projects (id, name, qubits, status, domain). "
                        "Call to discover projects or disambiguate a name.",
         "parameters": {"type": "object", "properties": {}, "required": []},
         "fn": list_projects},
        {"name": "get_project_analysis",
         "description": "Full computed analysis for one project: metrics (frequency_GHz, "
                        "q_factor_k, coupling_MHz, capacitance_fF, inductance_nH, anharmonicity_MHz), "
                        "per-qubit coherence (T1/T2), Hamiltonian, decoherence budget, fabrication "
                        "yield & frequency drift, DRC validation, capacitance matrix.",
         "parameters": {"type": "object", "properties": {
             "project": {"type": "string", "description": "Project name (partial, case-insensitive) or id."}},
             "required": ["project"]},
         "fn": get_project_analysis},
        {"name": "list_component_types",
         "description": "List the QRIVARA component library (id, name, category, description).",
         "parameters": {"type": "object", "properties": {}, "required": []},
         "fn": list_component_types},
        {"name": "get_parameter_specs",
         "description": "Recommended ranges (unit/min/max/typical) for key design parameters.",
         "parameters": {"type": "object", "properties": {}, "required": []},
         "fn": get_parameter_specs},
    ]


def _chat_context(session: Session, body: dict) -> dict:
    """Light awareness context: current page + project list + active project."""
    projects = session.exec(select(Project)).all()
    active = None
    pid = body.get("project_id")
    if pid:
        ap = session.get(Project, pid)
        if ap:
            active = {"id": ap.id, "name": ap.name}
    return {
        "current_page": body.get("page") or "unknown",
        "active_project": active,
        "available_projects": [{"id": p.id, "name": p.name} for p in projects],
    }


@router.post("/chat")
def chat(body: dict, session: Session = Depends(get_session)):
    """Agentic assistant (non-streaming). Body: { messages, page?, project_id? }."""
    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(400, "messages is required")
    try:
        reply = AI.chat(messages, _chat_context(session, body), tools=_make_tools(session))
    except AI.AIUnavailable as e:
        raise HTTPException(503, str(e))
    return {"reply": reply}


@router.post("/chat/stream")
def chat_stream(body: dict, session: Session = Depends(get_session)):
    """Streaming assistant — emits the answer as plain-text deltas (token-by-token)
    so the UI feels instant. Tool-call rounds run silently first."""
    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(400, "messages is required")
    context = _chat_context(session, body)
    tools = _make_tools(session)

    def gen():
        try:
            for delta in AI.chat_stream(messages, context, tools):
                yield delta
        except AI.AIUnavailable as e:
            yield f"\n\n_{e}_"
        except Exception:  # noqa: BLE001
            yield "\n\n_The AI service hit an error — please try again._"

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")
