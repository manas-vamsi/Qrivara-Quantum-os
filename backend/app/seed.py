from sqlmodel import Session, select

from .db import engine
from .models import Activity, Design, Project, User


def make_doc(qubits: int) -> dict:
    """Generate a representative layout (qubits + readout resonators + feedline)."""
    n = max(1, min(qubits, 12))  # cap for clarity in the 3D view
    cols = 3
    nodes: list = []
    edges: list = []
    for i in range(n):
        c, r = i % cols, i // cols
        x, y = 80 + c * 260, 100 + r * 200
        nodes.append({
            "id": f"q{i+1}", "type": "quantum", "position": {"x": x, "y": y},
            "data": {"label": f"Q{i+1}", "kind": "transmon", "color": "primary",
                     "params": {"target_freq_GHz": round(5.0 + 0.04 * i, 2), "anharmonicity_MHz": -300}},
        })
        nodes.append({
            "id": f"r{i+1}", "type": "quantum", "position": {"x": x + 130, "y": y},
            "data": {"label": f"R{i+1}", "kind": "resonator", "color": "cyan",
                     "params": {"frequency_GHz": round(7.0 + 0.04 * i, 2)}},
        })
        edges.append({"id": f"eq{i+1}", "source": f"q{i+1}", "target": f"r{i+1}"})
    fx = 80 + cols * 260 + 160
    fy = 100 + ((n - 1) // cols) * 100
    nodes.append({
        "id": "feed", "type": "quantum", "position": {"x": fx, "y": fy},
        "data": {"label": "Feedline", "kind": "feedline", "color": "success", "params": {}},
    })
    for i in range(n):
        edges.append({"id": f"ef{i+1}", "source": f"r{i+1}", "target": "feed"})
    return {"nodes": nodes, "edges": edges}


def seed() -> None:
    with Session(engine) as s:
        if not s.exec(select(User)).first():
            user = User(
                email="karthik@nexvista.com", name="Karthik Nair",
                role="Lead Quantum Engineer", org="NexVista Quantum Labs",
            )
            s.add(user)
            s.commit()
            s.refresh(user)
            for p in [
                Project(name="Falcon-17 Processor", description="17-qubit heavy-hex lattice with tunable couplers",
                        qubits=17, status="active", progress=72, tags=["heavy-hex", "flagship"],
                        collaborators=["Karthik Nair", "Lena Müller", "Diego Santos"], created_by=user.id),
                Project(name="Sparrow Test Chip", description="2-qubit gate-fidelity characterization device",
                        qubits=2, status="simulating", progress=91, tags=["test", "two-qubit"],
                        collaborators=["Lena Müller", "Aisha Khan"], created_by=user.id),
                Project(name="Condor Readout Array", description="Multiplexed readout for 8 qubits",
                        qubits=8, status="review", progress=58, tags=["readout", "multiplexed"],
                        collaborators=["Diego Santos", "Priya Raman"], created_by=user.id),
            ]:
                s.add(p)
            s.add(Activity(actor="Karthik Nair", action="created", target="Falcon-17 Processor", type="design"))
            s.commit()

        # Backfill: ensure every project has a 'main' design (idempotent).
        for p in s.exec(select(Project)).all():
            has_design = s.exec(select(Design).where(Design.project_id == p.id)).first()
            if not has_design:
                s.add(Design(project_id=p.id, name="main", doc=make_doc(p.qubits)))
        s.commit()
