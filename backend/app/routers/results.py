import random

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..db import get_session
from ..models import Project

router = APIRouter(prefix="/results", tags=["results"])


def _seeded_metrics(project_id: str, qubits: int) -> dict:
    rng = random.Random(sum(ord(c) for c in project_id))
    freq = 4.8 + rng.random() * 0.9
    return {
        "metrics": {
            "frequency_GHz": round(freq, 3),
            "q_factor_k": round(8 + rng.random() * 9, 1),
            "coupling_MHz": round(30 + rng.random() * 80, 0),
            "capacitance_fF": round(60 + rng.random() * 40, 1),
            "inductance_nH": round(9 + rng.random() * 6, 1),
            "anharmonicity_MHz": round(-(260 + rng.random() * 130), 0),
        },
        "coherence": [
            {"qubit": f"Q{i+1}", "t1": round(70 + rng.random() * 95),
             "t2": round(50 + rng.random() * 85)}
            for i in range(qubits)
        ],
    }


@router.get("/project/{project_id}")
def project_results(project_id: str, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    data = _seeded_metrics(p.id, p.qubits)
    return {"project": {"id": p.id, "name": p.name, "qubits": p.qubits, "status": p.status}, **data}
