"""Full-wave EM via AWS Palace (Apache-2.0) — "our own HFSS".

Palace is a CLI binary driven by one JSON config; it consumes a Gmsh `.msh` mesh
(see `geometry.py`) and solves the full 3-D Maxwell eigenmode / driven problem
(MFEM/PETSc, MPI). This module: builds the mesh, emits the config, runs the binary,
and parses the CSV output into the SAME result shape QRIVARA's existing eigenmode /
EPR / scattering views already render.

The binary is heavy (Spack/MPI build) and is meant to run on a dedicated worker /
HPC node — so `run_eigenmode` raises `PalaceUnavailable` when the binary isn't
present, and `jobs.py` falls back to the analytic LC-eigenmode. The mesh + config
generation here are pure-Python and fully exercised even without the binary.
"""
from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import tempfile

from .config import settings
from . import geometry


class PalaceUnavailable(RuntimeError):
    """Raised when the Palace binary or the mesher isn't available on this host."""


def binary_path() -> str | None:
    """Resolve the Palace binary (settings.palace_bin or PATH), or None if absent."""
    cand = getattr(settings, "palace_bin", "palace") or "palace"
    if os.path.isabs(cand):
        return cand if os.path.exists(cand) else None
    return shutil.which(cand)


def eigenmode_config(mesh_file: str, attrs: dict, *, eps_substrate: float,
                     target_ghz: float, n_modes: int, output_dir: str) -> dict:
    """Palace eigenmode config: substrate/vacuum materials, PEC pads, absorbing far
    boundary, and an eigenmode solver targeting `n_modes` modes near `target_ghz`.
    Geometry is in microns (L0 = 1e-6 m)."""
    return {
        "Problem": {"Type": "Eigenmode", "Verbose": 2, "Output": output_dir},
        "Model": {"Mesh": mesh_file, "L0": 1.0e-6},
        "Domains": {"Materials": [
            {"Attributes": [attrs["substrate"]], "Permittivity": eps_substrate,
             "Permeability": 1.0, "LossTan": 1.0e-6},
            {"Attributes": [attrs["air"]], "Permittivity": 1.0, "Permeability": 1.0},
        ]},
        "Boundaries": {
            "PEC": {"Attributes": list(attrs.get("pec", []))},
            "Absorbing": {"Attributes": list(attrs.get("box", [])), "Order": 1},
        },
        "Solver": {
            "Order": 2,
            "Eigenmode": {"Target": float(target_ghz), "N": int(n_modes),
                          "Tol": 1e-8, "Save": int(n_modes)},
            "Linear": {"Type": "Default", "KSPType": "GMRES", "Tol": 1e-8, "MaxIts": 200},
        },
    }


def _parse_eig_csv(path: str) -> list[dict]:
    """Parse Palace's postpro/eig.csv → [{mode, freq_GHz, Q}]. Tolerant of the exact
    column names (matches on 'f'/'freq' and 'Q')."""
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        rows = list(csv.reader(fh))
    if len(rows) < 2:
        return []
    header = [h.strip().lower() for h in rows[0]]
    f_col = next((i for i, h in enumerate(header) if "re{f}" in h or h.startswith("f ") or "freq" in h), 1)
    q_col = next((i for i, h in enumerate(header) if h.strip() == "q" or h.startswith("q ")), None)
    out = []
    for i, r in enumerate(rows[1:]):
        try:
            f = float(r[f_col])
        except (ValueError, IndexError):
            continue
        q = None
        if q_col is not None:
            try:
                q = float(r[q_col])
            except (ValueError, IndexError):
                q = None
        out.append({"mode": i + 1, "freq_GHz": round(f, 5), "Q": round(q) if q else None})
    return out


def run_eigenmode(conductors: list[dict], *, eps_substrate: float = 11.7,
                  target_ghz: float = 3.0, n_modes: int = 4,
                  timeout_s: int = 1800) -> dict:
    """Build mesh → emit config → run Palace → parse modes. Raises PalaceUnavailable
    if the mesher or binary is missing (caller falls back to the analytic solver)."""
    if not geometry.available():
        raise PalaceUnavailable("gmsh mesher not installed")
    binary = binary_path()
    if not binary:
        raise PalaceUnavailable("palace binary not found")

    work = tempfile.mkdtemp(prefix="palace_run_")
    try:
        mesh = geometry.build_mesh(conductors, eps_substrate=eps_substrate,
                                   out_path=os.path.join(work, "model.msh"))
        cfg = eigenmode_config(mesh["mesh"], mesh["attrs"], eps_substrate=eps_substrate,
                               target_ghz=target_ghz, n_modes=n_modes, output_dir="postpro")
        cfg_path = os.path.join(work, "config.json")
        with open(cfg_path, "w") as fh:
            json.dump(cfg, fh)
        np = max(1, int(getattr(settings, "palace_np", 1)))
        subprocess.run([binary, "-np", str(np), "config.json"], cwd=work,
                       check=True, capture_output=True, timeout=timeout_s)
        modes = _parse_eig_csv(os.path.join(work, "postpro", "eig.csv"))
        return {"modes": modes, "n_modes": len(modes), "mesh_nodes": mesh["n_nodes"],
                "mesh_tets": mesh["n_tets"],
                "method": "AWS Palace full-wave FEM eigenmode (Gmsh mesh)"}
    finally:
        shutil.rmtree(work, ignore_errors=True)
