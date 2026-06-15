import re

from fastapi import APIRouter

from ..schemas import CodegenRequest

router = APIRouter(prefix="/codegen", tags=["codegen"])

CLASS_IMPORT = {
    "TransmonPocket": "from qiskit_metal.qlibrary.qubits.transmon_pocket import TransmonPocket",
    "RouteMeander": "from qiskit_metal.qlibrary.tlines.meandered import RouteMeander",
    "TunableCoupler01": "from qiskit_metal.qlibrary.couplers.tunable_coupler_01 import TunableCoupler01",
    "LaunchpadWirebond": "from qiskit_metal.qlibrary.terminations.launchpad_wb import LaunchpadWirebond",
}
KIND_CLASS = {
    "transmon": "TransmonPocket",
    "resonator": "RouteMeander",
    "coupler": "TunableCoupler01",
    "feedline": "RouteMeander",
    "launchpad": "LaunchpadWirebond",
}


def _pyname(label: str, node_id: str) -> str:
    n = re.sub(r"[^A-Za-z0-9]", "_", label).strip("_")
    return n or node_id


from pydantic import BaseModel

class ExecuteRequest(BaseModel):
    code: str

@router.post("/execute")
def execute(body: ExecuteRequest):
    """
    'Execute' the code by parsing it for components and returning an updated graph + sim results.
    In a real system, this would run the code in a containerized Qiskit Metal sandbox.
    """
    code = body.code
    nodes, edges = [], []
    
    # Heuristic parsing of component definitions for the demo
    # e.g. Q1 = TransmonPocket(design, "Q1", options=Dict(pos_x="1.2mm", pos_y="-0.5mm"...))
    transmon_matches = re.finditer(r'(\w+)\s*=\s*TransmonPocket\(.*?pos_x="([^"]+)mm",\s*pos_y="([^"]+)mm"', code)
    for i, m in enumerate(transmon_matches):
        name, x, y = m.group(1), float(m.group(2)), float(m.group(3))
        nodes.append({
            "id": f"code_q_{i}", "type": "quantum", 
            "position": {"x": 300 + x * 120, "y": 240 + y * 120},
            "data": {"label": name, "kind": "transmon", "color": "primary", "params": {"target_freq_GHz": 5.214}}
        })

    # Readout resonators
    resonator_matches = re.finditer(r'(\w+)\s*=\s*RouteMeander\(', code)
    for i, m in enumerate(resonator_matches):
        name = m.group(1)
        # Position them relative to transmons for visual clarity
        nodes.append({
            "id": f"code_r_{i}", "type": "quantum", 
            "position": {"x": 450 + i * 100, "y": 100},
            "data": {"label": name, "kind": "resonator", "color": "cyan", "params": {"frequency_GHz": 7.12}}
        })

    # Mock simulation results extracted from "running" the code
    results = [
        {"k": "info", "t": f"[backend] sandbox initialized, executing script ({len(code)} bytes)"},
        {"k": "info", "t": f"[qiskit-metal] instantiated {len(nodes)} components from code"},
        {"k": "ok", "t": "✓ Completed LOM analysis: f01 = 5.210 GHz, anharm = -305 MHz"},
        {"k": "ok", "t": "✓ Synced changes to Designer and 3D View"},
    ]
    
    return {
        "doc": {"nodes": nodes, "edges": edges},
        "logs": results,
        "metrics": {"frequency": 5.210, "anharmonicity": -305}
    }

@router.post("")
def generate(body: CodegenRequest):
    nodes = body.doc.get("nodes", [])
    edges = body.doc.get("edges", [])
    used, lines = set(), ["design = designs.DesignPlanar()", "design.overwrite_enabled = True", ""]

    for n in nodes:
        data = n.get("data", {}) or {}
        cls = KIND_CLASS.get(data.get("kind"))
        if cls:
            used.add(cls)
        nm = _pyname(data.get("label", n.get("id", "c")), n.get("id", "c"))
        px = round((n.get("position", {}).get("x", 0) - 300) / 120, 2)
        py = round((n.get("position", {}).get("y", 0) - 240) / 120, 2)
        if not cls:
            lines.append(f"# {data.get('label')} ({data.get('kind')}) — captured in analysis model")
        elif cls == "TransmonPocket":
            lines.append(f'{nm} = TransmonPocket(design, "{nm}", options=Dict(\n'
                         f'    pos_x="{px}mm", pos_y="{py}mm", pad_gap="30um", pad_width="455um",\n'
                         f'    connection_pads=Dict(readout=Dict(loc_W=1, loc_H=1)), hfss_inductance="11nH"))')
        elif cls == "RouteMeander":
            lines.append(f'{nm} = RouteMeander(design, "{nm}", options=Dict(total_length="4.2mm", fillet="90um"))')
        elif cls == "TunableCoupler01":
            lines.append(f'{nm} = TunableCoupler01(design, "{nm}", options=Dict(pos_x="{px}mm", pos_y="{py}mm"))')
        elif cls == "LaunchpadWirebond":
            lines.append(f'{nm} = LaunchpadWirebond(design, "{nm}", options=Dict(pos_x="{px}mm", pos_y="{py}mm"))')

    if edges:
        lines.append("")
        lines.append("# connectivity")
        by_id = {n.get("id"): n for n in nodes}
        for e in edges:
            s, t = by_id.get(e.get("source")), by_id.get(e.get("target"))
            if s and t:
                ln = _pyname((s.get("data") or {}).get("label", ""), s.get("id"))
                rn = _pyname((t.get("data") or {}).get("label", ""), t.get("id"))
                lines.append(f"#   {ln} -- {rn}")

    lines += [
        "", "gui = MetalGUI(design)", "gui.rebuild()", "",
        "# capacitance matrix -> quantized Hamiltonian",
        "from qiskit_metal.analyses.quantization import LOManalysis",
        'lom = LOManalysis(design, "q3d")', "lom.run_lom()",
        "print(lom.lumped_oscillator_all)",
    ]
    imports = "\n".join(CLASS_IMPORT[c] for c in used)
    header = (f'"""Auto-generated from the QRIVARA Visual Designer ({len(nodes)} components)."""\n'
              "from qiskit_metal import designs, MetalGUI, Dict\n")
    code = f"{header}{imports}\n\n" + "\n".join(lines) + "\n"
    return {"language": "python", "filename": "design.py", "code": code}
