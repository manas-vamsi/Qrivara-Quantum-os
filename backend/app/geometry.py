"""Geometry → 3-D mesh for the full-wave EM solver (Palace).

Turns QRIVARA's rectangular-pad conductors (the same `_build_conductors` output the
electrostatic solver uses) into a conformal tetrahedral mesh via Gmsh's OpenCASCADE
kernel: a substrate box (z<0), a vacuum box (z>0), and the metal pads as PEC surfaces
on the z=0 chip plane — all fragmented so the meshes match node-for-node at the
interfaces (which Palace requires). Returns the mesh path + the physical-group → role
map (the integer attributes Palace's config references).

Gmsh is GPL and runs here as a SEPARATE process/import (the mesher) — it is not linked
into QRIVARA's Apache code or Palace. `pip install gmsh` ships a self-contained,
headless wheel (no display needed).
"""
from __future__ import annotations

import os
import tempfile


def available() -> bool:
    try:
        import gmsh  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def build_mesh(conductors: list[dict], *, eps_substrate: float = 11.7,
               sub_thick_um: float = 300.0, air_um: float = 300.0,
               margin_um: float = 200.0, lc_metal_um: float = 12.0,
               lc_bulk_um: float = 80.0, out_path: str | None = None) -> dict:
    """Build a conformal tet mesh for `conductors` ([{label,x,y,w,h}] in µm) and write
    it to `out_path` (a temp .msh if None). Returns {mesh, attrs:{substrate, air,
    pec:[ids], box:[ids]}, n_nodes, n_tets} — `attrs` maps physical-group integer IDs
    to roles for the Palace config. Raises if Gmsh is unavailable."""
    import gmsh

    if not conductors:
        raise ValueError("no conductors to mesh")
    out_path = out_path or os.path.join(tempfile.mkdtemp(prefix="qrivara_mesh_"), "model.msh")

    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.model.add("qrivara")
        occ = gmsh.model.occ

        xs0 = min(c["x"] for c in conductors); ys0 = min(c["y"] for c in conductors)
        xs1 = max(c["x"] + c["w"] for c in conductors); ys1 = max(c["y"] + c["h"] for c in conductors)
        x0, x1 = xs0 - margin_um, xs1 + margin_um
        y0, y1 = ys0 - margin_um, ys1 + margin_um

        v_sub = occ.addBox(x0, y0, -sub_thick_um, x1 - x0, y1 - y0, sub_thick_um)
        v_air = occ.addBox(x0, y0, 0.0, x1 - x0, y1 - y0, air_um)
        pads = [(2, occ.addRectangle(c["x"], c["y"], 0.0, c["w"], c["h"])) for c in conductors]

        # fragment → conformal interfaces between substrate, air and the pad surfaces
        occ.fragment([(3, v_sub), (3, v_air)], pads)
        occ.synchronize()

        # classify volumes by centre-of-mass z (substrate below, vacuum above)
        sub_vols, air_vols = [], []
        for (_, tag) in gmsh.model.getEntities(3):
            cz = occ.getCenterOfMass(3, tag)[2]
            (sub_vols if cz < 0 else air_vols).append(tag)

        # classify surfaces: pad PEC (z≈0, inside a conductor footprint) vs outer box
        pec, box = [], []
        eps = 1e-6
        for (_, tag) in gmsh.model.getEntities(2):
            bb = gmsh.model.getBoundingBox(2, tag)            # (x0,y0,z0,x1,y1,z1)
            cx, cy, cz = occ.getCenterOfMass(2, tag)
            on_z0 = abs(bb[2]) < 1.0 and abs(bb[5]) < 1.0     # surface lies on the z=0 plane
            inside_pad = any(c["x"] - eps <= cx <= c["x"] + c["w"] + eps
                             and c["y"] - eps <= cy <= c["y"] + c["h"] + eps for c in conductors)
            on_box = (abs(bb[0] - x0) < 1.0 or abs(bb[3] - x1) < 1.0
                      or abs(bb[1] - y0) < 1.0 or abs(bb[4] - y1) < 1.0
                      or abs(bb[2] - (-sub_thick_um)) < 1.0 or abs(bb[5] - air_um) < 1.0)
            if on_z0 and inside_pad:
                pec.append(tag)
            elif on_box:
                box.append(tag)

        # physical groups — the integer attributes Palace's config will reference
        attrs = {}
        attrs["substrate"] = gmsh.model.addPhysicalGroup(3, sub_vols, name="substrate")
        attrs["air"] = gmsh.model.addPhysicalGroup(3, air_vols, name="air")
        pec_id = gmsh.model.addPhysicalGroup(2, pec, name="pec")
        box_id = gmsh.model.addPhysicalGroup(2, box, name="farfield")
        attrs["pec"] = [pec_id]
        attrs["box"] = [box_id]

        # local refinement near the metal (fields concentrate at pad edges)
        gmsh.option.setNumber("Mesh.MeshSizeMax", lc_bulk_um)
        gmsh.option.setNumber("Mesh.MeshSizeMin", lc_metal_um)
        if pec:
            fld = gmsh.model.mesh.field.add("Distance")
            gmsh.model.mesh.field.setNumbers(fld, "SurfacesList", pec)
            thr = gmsh.model.mesh.field.add("Threshold")
            gmsh.model.mesh.field.setNumber(thr, "InField", fld)
            gmsh.model.mesh.field.setNumber(thr, "SizeMin", lc_metal_um)
            gmsh.model.mesh.field.setNumber(thr, "SizeMax", lc_bulk_um)
            gmsh.model.mesh.field.setNumber(thr, "DistMin", lc_metal_um)
            gmsh.model.mesh.field.setNumber(thr, "DistMax", lc_bulk_um * 4)
            gmsh.model.mesh.field.setAsBackgroundMesh(thr)

        gmsh.model.mesh.generate(3)
        n_nodes = len(gmsh.model.mesh.getNodes()[0])
        n_tets = len(gmsh.model.mesh.getElementsByType(4)[0])
        gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)     # Palace-friendly
        gmsh.write(out_path)
        return {"mesh": out_path, "attrs": attrs, "n_nodes": n_nodes, "n_tets": n_tets,
                "eps_substrate": eps_substrate}
    finally:
        gmsh.finalize()
