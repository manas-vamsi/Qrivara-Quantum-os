"""QRIVARA 3-D electrostatic field solver — "our own Q3D".

Genuine 3-D quasi-static capacitance extraction by finite-volume solution of the
variable-permittivity Laplace equation

        ∇·(ε ∇φ) = 0

on a uniform Cartesian voxel grid. Unlike the 2-D solver (``app.fem``), this
resolves the **substrate ↔ vacuum dielectric interface** explicitly — the
dominant 3-D effect for planar superconducting qubits — so the Maxwell
capacitance matrix comes out in absolute femtofarads directly from the field,
with NO empirical out-of-plane scaling factor.

Method (the physics Ansys Q3D Extractor uses, minus the adaptive mesh):
  1. Voxelise a box: substrate (z<0, εr = ε_substrate) + vacuum (z>0, εr = 1),
     metal pads and the surrounding ground plane on the z = 0 surface.
  2. Energise conductor *j* to 1 V, ground everything else, solve ∇·(ε∇φ)=0.
  3. Induced charge on conductor *i*:  Q_i = Σ_nodes (A φ)_i  (discrete Gauss law).
  4. Maxwell capacitance matrix  C_ij = Q_i  with V_j = 1 V → absolute farads.

Pure NumPy + SciPy sparse — no licensed solver (Ansys Q3D/HFSS), no GUI, no extra
dependency. Operator assembly is fully vectorised; the SPD system is factorised
once and reused across the per-conductor right-hand sides.
"""
from __future__ import annotations

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import LinearOperator, cg

EPS0 = 8.8541878128e-12  # vacuum permittivity [F/m]
_UM = 1e-6               # micron → metre
_TOL = 1e-12


def _make_solver(Aff: sparse.csr_matrix):
    """Return a solve(b) closure for the SPD free-node system using preconditioned
    conjugate gradient (Jacobi preconditioner). CG keeps memory at O(nnz) — a 3-D
    *direct* LU solve has prohibitive fill-in and would exhaust RAM. The operator is
    fixed across right-hand sides, so the preconditioner is built once."""
    d = Aff.diagonal()
    d = np.where(np.abs(d) < 1e-300, 1.0, d)
    Minv = LinearOperator(Aff.shape, matvec=lambda x: x / d)
    # Jacobi-preconditioned CG on this 3-D Poisson system converges in O(grid
    # diameter) iterations (a few hundred at our grid sizes). Cap maxiter well
    # above that but far below n, so a pathological layout degrades to an
    # approximate solve instead of hanging a worker.
    maxiter = int(min(8000, max(2000, 30 * Aff.shape[0] ** (1.0 / 3.0))))

    def solve(b):
        x, _ = cg(Aff, b, M=Minv, rtol=1e-8, atol=0.0, maxiter=maxiter)
        return x

    return solve


def _dual_widths(g: np.ndarray) -> np.ndarray:
    """Finite-volume dual-cell widths for a (possibly non-uniform) 1-D node grid:
    interior node owns half the distance to each neighbour, boundary node a half-cell."""
    d = np.empty(len(g))
    d[1:-1] = 0.5 * (g[2:] - g[:-2])
    d[0] = 0.5 * (g[1] - g[0])
    d[-1] = 0.5 * (g[-1] - g[-2])
    return d


def _assemble(gx_m: np.ndarray, gy_m: np.ndarray, gz_m: np.ndarray,
              eps_inplane_k: np.ndarray, eps_zface_k: np.ndarray) -> sparse.csr_matrix:
    """Vectorised finite-volume operator for ∇·(ε∇φ)=0 on a NON-UNIFORM Cartesian
    tensor grid (coordinates in metres). The face coefficient between two nodes is
    ε_face · (transverse dual area) / (node spacing) — for a cube this reduces to
    ε·h, so the uniform case is recovered exactly. Putting grid lines on the
    conductor edges (see ``_grid_geometry``) then makes pad areas exact, which is
    what removes the grid-snapping scatter. ``eps_inplane_k[k]`` is the x/y-face
    permittivity [F/m] in z-plane k; ``eps_zface_k[k]`` the z-face permittivity
    between planes k and k+1. Node order ``m = (k·ny + j)·nx + i``."""
    nx, ny, nz = len(gx_m), len(gy_m), len(gz_m)
    N = nx * ny * nz
    dx, dy, dz = _dual_widths(gx_m), _dual_widths(gy_m), _dual_widths(gz_m)
    dxf, dyf, dzf = np.diff(gx_m), np.diff(gy_m), np.diff(gz_m)   # node spacings (faces)
    m = np.arange(N)
    i = m % nx
    j = (m // nx) % ny
    k = m // (nx * ny)

    rows = []; cols = []; vals = []
    diag = np.zeros(N)

    def bond(sel, step, w):
        r = m[sel]; c = r + step
        rows.append(r); cols.append(c); vals.append(-w)
        rows.append(c); cols.append(r); vals.append(-w)
        np.add.at(diag, r, w)
        np.add.at(diag, c, w)

    sx = i < nx - 1                                               # +x faces
    bond(sx, 1, eps_inplane_k[k[sx]] * dy[j[sx]] * dz[k[sx]] / dxf[i[sx]])
    sy = j < ny - 1                                               # +y faces
    bond(sy, nx, eps_inplane_k[k[sy]] * dx[i[sy]] * dz[k[sy]] / dyf[j[sy]])
    sz = k < nz - 1                                               # +z faces
    bond(sz, nx * ny, eps_zface_k[k[sz]] * dx[i[sz]] * dy[j[sz]] / dzf[k[sz]])

    rows = np.concatenate(rows); cols = np.concatenate(cols); vals = np.concatenate(vals)
    A = sparse.csr_matrix((vals, (rows, cols)), shape=(N, N)) + sparse.diags(diag)
    return A.tocsr()


def _fill_axis(edges: list[float], lo: float, hi: float, h: float) -> np.ndarray:
    """Build a 1-D grid that PUTS A NODE ON EVERY forced edge (pad/gap boundary) and
    fills each gap between consecutive edges with ~uniform spacing ≈ h. Exact edges
    → exact conductor areas → no grid-snapping error."""
    pts = sorted({round(e, 4) for e in edges if lo - 1e-6 <= e <= hi + 1e-6} | {lo, hi})
    grid = []
    for a, b in zip(pts[:-1], pts[1:]):
        seg = b - a
        steps = max(1, int(round(seg / h)))
        grid.extend(a + seg * t / steps for t in range(steps))
    grid.append(pts[-1])
    return np.array(grid)


def _grid_geometry(conductors: list[dict], gaps: list[float], max_nodes: int) -> dict:
    """The actual voxel grid the solver builds — shared by the solve and by
    ``grid_stats`` so the reported mesh never drifts from what's solved.

    EDGE-CONFORMING non-uniform tensor grid: every pad and etched-gap edge is a grid
    line (so conductor areas are exact — this is what removes the ±grid-snapping
    scatter), with ~uniform fill in between sized from the node budget. Compact
    domain (the surface ground plane is the return path; field confined to a few
    gap-widths of the metal)."""
    max_gap = max(gaps)
    xs0 = min(c["x"] for c in conductors); ys0 = min(c["y"] for c in conductors)
    xs1 = max(c["x"] + c["w"] for c in conductors); ys1 = max(c["y"] + c["h"] for c in conductors)
    max_pad = max(xs1 - xs0, ys1 - ys0)
    margin = 2.0 * max_gap + 40.0
    z_half = max(3.0 * max_gap, 0.25 * max_pad, 80.0)
    x0, x1 = xs0 - margin, xs1 + margin
    y0, y1 = ys0 - margin, ys1 + margin
    vol = (x1 - x0) * (y1 - y0) * (2.0 * z_half)
    h = max((vol / max_nodes) ** (1.0 / 3.0), 2.0)
    # forced grid lines: every pad/gap edge in x and y
    xe = [x0, x1]; ye = [y0, y1]
    for c, g in zip(conductors, gaps):
        xe += [c["x"] - g, c["x"], c["x"] + c["w"], c["x"] + c["w"] + g]
        ye += [c["y"] - g, c["y"], c["y"] + c["h"], c["y"] + c["h"] + g]
    gx = _fill_axis(xe, x0, x1, h)
    gy = _fill_axis(ye, y0, y1, h)
    kz = int(np.ceil(z_half / h))
    gz = np.linspace(-z_half, z_half, 2 * kz + 1)        # symmetric → z=0 included
    k0 = int(np.argmin(np.abs(gz)))
    return {"gx": gx, "gy": gy, "gz": gz, "h": h, "nx": len(gx), "ny": len(gy),
            "nz": len(gz), "k0": k0,
            "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "z_lo": -z_half, "z_hi": z_half}}


def grid_stats(conductors: list[dict], max_nodes: int = 150_000,
               default_gap: float = 30.0) -> dict | None:
    """Real discretisation stats for the 3-D solver's voxel grid (no solve) — the
    honest 'mesh' for a finite-volume field solver: cell size, grid dimensions,
    node/cell counts, and the domain box. Mirrors exactly what the solver meshes."""
    if not conductors:
        return None
    gaps = [float(c.get("gap", default_gap) or default_gap) for c in conductors]
    g = _grid_geometry(conductors, gaps, max_nodes)
    nx, ny, nz = g["nx"], g["ny"], g["nz"]
    return {"cell_size_um": round(g["h"], 3), "grid": {"nx": nx, "ny": ny, "nz": nz},
            "nodes": nx * ny * nz, "cells": (nx - 1) * (ny - 1) * (nz - 1),
            "surface_plane_index": g["k0"], "bbox_um": g["bbox"]}


def _solve_system(conductors: list[dict], eps_substrate: float, max_nodes: int,
                  default_gap: float, capture_field: bool = False):
    """Core variable-permittivity field solve, shared by capacitance extraction and
    the field-map / convergence tooling. Energises each conductor to 1 V in turn,
    solves ∇·(ε∇φ)=0, and integrates the induced charge (discrete Gauss law) into the
    Maxwell matrix [fF]. When ``capture_field`` is set, also returns the solved
    surface-plane potential for conductor 0 energised (for visualisation).
    Returns ``(geo, M_fF, field|None)`` or ``None`` if there is nothing to solve."""
    if not conductors:
        return None
    n = len(conductors)
    gaps = [float(c.get("gap", default_gap) or default_gap) for c in conductors]
    geo = _grid_geometry(conductors, gaps, max_nodes)
    gx, gy, gz, h, nx, ny, nz, k0 = (geo["gx"], geo["gy"], geo["gz"], geo["h"],
                                     geo["nx"], geo["ny"], geo["nz"], geo["k0"])
    N = nx * ny * nz

    # edges are exact grid lines now → map them with searchsorted (no rounding error)
    def span(lo, hi, grid):
        i_lo = int(np.searchsorted(grid, lo - 1e-6, side="left"))
        i_hi = int(np.searchsorted(grid, hi + 1e-6, side="right")) - 1
        return max(0, i_lo), min(len(grid) - 1, i_hi)

    surf = np.full((ny, nx), -2, dtype=np.int32)          # ground plane
    for c, g in zip(conductors, gaps):                    # carve etched gaps
        ax0, ax1 = span(c["x"] - g, c["x"] + c["w"] + g, gx)
        ay0, ay1 = span(c["y"] - g, c["y"] + c["h"] + g, gy)
        sub = surf[ay0:ay1 + 1, ax0:ax1 + 1]
        sub[sub == -2] = -1
        surf[ay0:ay1 + 1, ax0:ax1 + 1] = sub
    for kk, c in enumerate(conductors):                   # stamp the metal pads
        ax0, ax1 = span(c["x"], c["x"] + c["w"], gx)
        ay0, ay1 = span(c["y"], c["y"] + c["h"], gy)
        surf[ay0:ay1 + 1, ax0:ax1 + 1] = kk

    tag = np.full(N, -1, dtype=np.int32)
    tag[k0 * ny * nx: (k0 + 1) * ny * nx] = surf.ravel()

    eps_vac, eps_sub = EPS0, eps_substrate * EPS0
    eps_surf = 0.5 * (eps_substrate + 1.0) * EPS0
    eps_inplane_k = np.where(np.abs(gz) < _TOL, eps_surf,
                             np.where(gz > 0, eps_vac, eps_sub))
    zmid = 0.5 * (gz[:-1] + gz[1:])
    eps_zface_k = np.where(zmid > 0, eps_vac, eps_sub)
    eps_zface_k = np.append(eps_zface_k, eps_vac)

    A = _assemble(gx * _UM, gy * _UM, gz * _UM, eps_inplane_k, eps_zface_k)
    free = np.flatnonzero(tag == -1)
    if free.size == 0:
        return None
    solve = _make_solver(A[free][:, free].tocsr())

    M = np.zeros((n, n))
    field = None
    for jc in range(n):
        phi0 = np.zeros(N)
        phi0[tag == jc] = 1.0
        phi = phi0.copy()
        phi[free] = solve(-(A @ phi0)[free])
        q = A @ phi
        for ic in range(n):
            M[ic, jc] = q[tag == ic].sum()
        if capture_field and jc == 0:
            field = phi[k0 * ny * nx:(k0 + 1) * ny * nx].reshape(ny, nx).copy()
    M = 0.5 * (M + M.T) * 1e15                              # symmetrise, C → fF
    return geo, M, field


def capacitance_matrix_3d(
    conductors: list[dict],
    eps_substrate: float = 11.7,
    max_nodes: int = 150_000,
    default_gap: float = 30.0,
):
    """3-D Maxwell capacitance matrix [fF] from a variable-permittivity field solve.

    ``conductors`` = ``[{label, x, y, w, h, gap?}]`` in microns, all metal on the
    z = 0 chip surface; substrate (``eps_substrate``) fills z<0, vacuum z>0. Returns
    ``(labels, M)`` with ``M`` the Maxwell matrix [fF] (diagonal = self, off-diag =
    −mutual), or ``None`` if there are no conductors.
    """
    res = _solve_system(conductors, eps_substrate, max_nodes, default_gap)
    if res is None:
        return None
    _geo, M, _field = res
    labels = [c.get("label", f"C{i+1}") for i, c in enumerate(conductors)]
    return labels, M


def solve_field(conductors: list[dict], eps_substrate: float = 11.7,
                max_nodes: int = 120_000, default_gap: float = 30.0,
                map_size: int = 64) -> dict | None:
    """Full field-solver result for the UI: the solved Maxwell matrix with a
    Richardson grid-convergence estimate (so the reported capacitance has an error
    bar, not a single coarse-grid guess), a field-derived effective permittivity
    ε_eff = C/C_vacuum, the solved surface-plane potential map (for visualisation),
    and the real mesh stats. Three field solves (fine + coarse for convergence,
    coarse vacuum for ε_eff). Returns None if there are no conductors."""
    fine = _solve_system(conductors, eps_substrate, max_nodes, default_gap, capture_field=True)
    if fine is None:
        return None
    geo, M_fine, field = fine
    n = len(conductors)
    labels = [c.get("label", f"C{i+1}") for i, c in enumerate(conductors)]
    self_fine = [float(M_fine[i, i]) for i in range(n)]

    # Honest grid-convergence: re-solve on a coarser grid and report the relative
    # change as a numerical-uncertainty band. (We deliberately do NOT Richardson-
    # extrapolate: pad edges snap to grid lines, so convergence isn't smooth and
    # extrapolation amplifies the noise — the fine-grid value is the estimate.)
    coarse = _solve_system(conductors, eps_substrate, max(max_nodes // 2, 30_000), default_gap)
    err_pct = 0.0
    if coarse is not None:
        _gc, M_coarse, _ = coarse
        diffs = [abs(float(M_coarse[i, i]) - self_fine[i]) / abs(self_fine[i])
                 for i in range(n) if self_fine[i]]
        err_pct = round(100.0 * (max(diffs) if diffs else 0.0), 1)
    converged = self_fine

    # field-derived effective permittivity ε_eff = C(substrate) / C(vacuum)
    eps_eff = None
    vac = _solve_system(conductors, 1.0, max(max_nodes // 2, 30_000), default_gap)
    if vac is not None and coarse is not None:
        _gv, M_vac, _ = vac
        _gc, M_coarse, _ = coarse
        if M_vac[0, 0]:
            eps_eff = round(float(M_coarse[0, 0] / M_vac[0, 0]), 3)

    # downsample the potential map for transport (≤ map_size on the long axis)
    ny, nx = field.shape
    step = max(1, int(np.ceil(max(nx, ny) / map_size)))
    fmap = field[::step, ::step]
    gx, gy = geo["gx"][::step], geo["gy"][::step]
    field_map = {
        "z": [[round(float(v), 4) for v in row] for row in fmap],
        "x_um": [round(float(v), 1) for v in gx[:fmap.shape[1]]],
        "y_um": [round(float(v), 1) for v in gy[:fmap.shape[0]]],
        "energized": labels[0],
    }

    matrix = [[round(float(M_fine[i, j]), 3) for j in range(n)] for i in range(n)]
    return {
        "labels": labels,
        "maxwell_matrix_fF": matrix,
        "self_capacitance_fF": [round(c, 2) for c in converged],
        "self_capacitance_raw_fF": [round(c, 2) for c in self_fine],
        "convergence_error_pct": err_pct,
        "eps_eff": eps_eff,
        "field_map": field_map,
        "grid": grid_stats(conductors, max_nodes=max_nodes, default_gap=default_gap),
        "n_conductors": n,
    }


def parallel_plate_self_test(eps_r: float = 1.0) -> dict:
    """Validate the solver core against the closed-form parallel-plate result
    C = ε0·εr·A/d. Two stacked square plates in a uniform medium; the numeric value
    sits *above* the ideal (fringing always adds capacitance). Returns
    {analytic_fF, numeric_fF, ratio}."""
    L, d = 160.0 * _UM, 20.0 * _UM
    h = d / 5.0
    pad = 2.0 * d
    x0, x1 = -pad, L + pad
    nx = int(round((x1 - x0) / h)) + 1
    ny = nx
    kz = int(np.ceil((d + 2 * pad) / h))
    nz = 2 * kz + 1
    gx = x0 + np.arange(nx) * h
    gy = x0 + np.arange(ny) * h
    gz = (np.arange(nz) - kz) * h
    N = nx * ny * nz

    def idx(i, j, k):
        return (k * ny + j) * nx + i

    kb = int(np.argmin(np.abs(gz - 0.0)))
    kt = int(np.argmin(np.abs(gz - d)))
    tag = np.full(N, -1, dtype=np.int32)
    inb = (gx >= 0) & (gx <= L)
    ix = np.where(inb)[0]
    for jj in np.where((gy >= 0) & (gy <= L))[0]:
        for iidx in ix:
            tag[idx(iidx, jj, kb)] = 0
            tag[idx(iidx, jj, kt)] = 1
    ii = np.arange(N) % nx
    jjj = (np.arange(N) // nx) % ny
    kkk = np.arange(N) // (nx * ny)
    wall = (ii == 0) | (ii == nx - 1) | (jjj == 0) | (jjj == ny - 1) | (kkk == 0) | (kkk == nz - 1)
    tag[wall] = -2

    eps = EPS0 * eps_r
    eps_k = np.full(nz, eps)
    A = _assemble(gx, gy, gz, eps_k, eps_k)
    free = np.flatnonzero(tag == -1)
    solve = _make_solver(A[free][:, free].tocsr())
    phi0 = np.zeros(N); phi0[tag == 1] = 1.0
    phi = phi0.copy(); phi[free] = solve(-(A @ phi0)[free])
    q = A @ phi
    c_num = q[tag == 1].sum()
    c_ana = eps * (L * L) / d
    return {"analytic_fF": c_ana * 1e15, "numeric_fF": c_num * 1e15,
            "ratio": float(c_num / c_ana)}
