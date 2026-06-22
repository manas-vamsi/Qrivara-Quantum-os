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


def _heuristic_report(ctx: dict) -> dict:
    """A real, data-driven design review derived directly from the computed physics —
    used when no LLM provider is configured, so the advisor always works. Every line
    is grounded in a number the engine produced (T1, anharmonicity, yield, DRC, …)."""
    m = ctx.get("metrics", {}) or {}
    coh = ctx.get("coherence", []) or []
    dec = ctx.get("decoherence", {}) or {}
    fab = ctx.get("fabrication_yield", {}) or {}
    drc = ctx.get("validation_drc", {}) or {}
    cc = ctx.get("component_counts", {}) or {}

    f01 = m.get("frequency_GHz")
    anh = m.get("anharmonicity_MHz")
    g = m.get("coupling_MHz")
    t1s = [c.get("t1") for c in coh if c.get("t1")]
    t2s = [c.get("t2") for c in coh if c.get("t2")]
    t1 = (sum(t1s) / len(t1s)) if t1s else dec.get("T1_total_us")
    t2 = (sum(t2s) / len(t2s)) if t2s else dec.get("T2_echo_us")
    yld = fab.get("yield_pct")
    n_tx = cc.get("transmons", 0)
    viol = drc.get("violations") or drc.get("errors") or []
    nviol = len(viol) if isinstance(viol, list) else int(drc.get("violation_count") or 0)

    strengths: list[str] = []
    lacking: list[str] = []
    recs: list[dict] = []
    steps: list[str] = []

    if f01:
        strengths.append(f"Qubit frequency f₀₁ ≈ {f01:.3f} GHz sits in the standard 4–6 GHz transmon band.")
    if anh is not None:
        if abs(anh) >= 250:
            strengths.append(f"Anharmonicity {anh:.0f} MHz supports fast, low-leakage single-qubit gates.")
        else:
            lacking.append(f"Anharmonicity {anh:.0f} MHz is low (|α| < 250 MHz) — raises gate leakage.")
            recs.append({"priority": "medium", "area": "Qubit design",
                         "action": "Lower the qubit capacitance Cσ to raise E_C and |α| (target |α| ≳ 270 MHz).",
                         "impact": "Less |1⟩→|2⟩ leakage and faster gates."})
    if t1:
        if t1 >= 80:
            strengths.append(f"T₁ ≈ {t1:.0f} µs is competitive.")
        else:
            lacking.append(f"T₁ ≈ {t1:.0f} µs is below the 80–100 µs target — relaxation limits gate & readout fidelity.")
            recs.append({"priority": "high", "area": "Coherence",
                         "action": "Cut surface dielectric loss (cleaner fab, wider gap-to-ground, better substrate) and check Purcell decay through the readout filter.",
                         "impact": "Higher T₁ directly lifts the coherence-limited gate fidelity."})
            steps.append("Run the Decoherence analysis and inspect the dielectric / Purcell / quasiparticle T₁ split.")
    if t1 and t2 and t2 < 1.5 * t1:
        lacking.append(f"T₂ ≈ {t2:.0f} µs is well under 2·T₁ — pure dephasing dominates.")
        recs.append({"priority": "medium", "area": "Coherence",
                     "action": "Operate at a flux sweet spot and lower residual cavity photons to suppress dephasing.",
                     "impact": "Pushes T₂ toward the 2·T₁ limit."})
    if yld is not None:
        if yld >= 90:
            strengths.append(f"Fabrication yield ≈ {yld:.0f}% at the modeled process spread.")
        else:
            lacking.append(f"Fabrication yield ≈ {yld:.0f}% — f₀₁ targeting is sensitive to junction spread.")
            recs.append({"priority": "high", "area": "Manufacturability",
                         "action": "Tighten junction-resistance control or add laser annealing/trimming to hit target f₀₁.",
                         "impact": "Higher wafer yield and fewer frequency collisions."})
            steps.append("Use the Yield (Monte-Carlo) panel to find the σ that meets your yield target.")
    if nviol:
        lacking.append(f"{nviol} design-rule violation(s) reported.")
        recs.append({"priority": "critical", "area": "Layout",
                     "action": "Resolve the DRC violations before fabrication.",
                     "impact": "A manufacturable layout."})
    else:
        strengths.append("Layout passes the design-rule check.")
    if g and g > 20:
        lacking.append(f"Direct coupling g ≈ {g:.0f} MHz is high (qubit pads close) — risks strong static ZZ.")
        recs.append({"priority": "medium", "area": "Coupling",
                     "action": "Increase qubit spacing or add a tunable coupler to suppress static ZZ while keeping a fast 2Q gate.",
                     "impact": "Lower ZZ crosstalk and higher 2Q fidelity."})

    if not lacking:
        lacking.append("No major gaps detected in the modeled metrics.")
    if not recs:
        recs.append({"priority": "low", "area": "General",
                     "action": "Run the full suite (capacitance → Hamiltonian → decoherence → gates → yield) and iterate in the Optimization engine.",
                     "impact": "Confidence the design meets all targets."})
    steps.append("Open the Optimization engine, adjust the design parameters, and click Start to search for a better operating point.")

    bits = [f"{n_tx} transmon(s)"]
    if f01:
        bits.append(f"f₀₁ ≈ {f01:.2f} GHz")
    if t1:
        bits.append(f"T₁ ≈ {t1:.0f} µs")
    if yld is not None:
        bits.append(f"yield ≈ {yld:.0f}%")
    pname = (ctx.get("project", {}) or {}).get("name", "the design")
    summary = (f"Engineering review of {pname}: " + ", ".join(bits) +
               ". Findings below are computed directly from the design physics (no external LLM).")
    yield_outlook = None
    if yld is not None:
        yield_outlook = (f"At the modeled process spread the design yields ≈{yld:.0f}%. " +
                         ("Frequency targeting is the main lever." if yld < 90
                          else "Yield is healthy — focus on coherence next."))
    return {"summary": summary, "strengths": strengths, "lacking": lacking,
            "recommendations": recs, "next_steps": steps, "yield_outlook": yield_outlook,
            "engine": "rule-based (computed from the design physics)"}


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
    # Prefer the LLM advisor; when no provider is configured (or it fails), fall back
    # to a real, physics-derived rule-based review so the advisor is always functional.
    try:
        report = AI.analyze_project(context)
    except AI.AIUnavailable:
        report = _heuristic_report(context)
    except Exception:  # noqa: BLE001 — never 500 the advisor; degrade to the heuristic
        report = _heuristic_report(context)
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
