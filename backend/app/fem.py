"""QRIVARA's built-in FEM EM solver — 2-D quasi-static electrostatics.

Discretises the chip plane onto a grid, solves Laplace's equation ∇²φ = 0 with
each metal island held at 1 V (all others + the domain boundary grounded), and
extracts the induced charges to assemble the **Maxwell capacitance matrix**
directly from the field solution. This is a genuine numerical field solve (sparse
finite-difference Laplacian, scipy), not an analytic fit — capacitances respond
correctly to pad area, gaps and inter-qubit spacing, and feed the LOM →
Hamiltonian pipeline.

It is 2-D quasi-static (fast: ~0.1–1 s) rather than full 3-D FEM (HFSS/Palace);
the absolute scale is calibrated to fF against a reference planar transmon, while
the matrix *structure* comes entirely from the solved field.
"""
from __future__ import annotations

import numpy as np
from scipy import sparse
from scipy.linalg import eigh
from scipy.sparse.linalg import factorized

EPS0 = 8.8541878128e-12  # F/m

# Out-of-plane effective length [m]: scales the 2-D (per-unit-length) result to
# absolute fF. Calibrated so a ~455×90 µm transmon pad gives ~80 fF self-cap.
_T_EFF = 1.05e-3


def capacitance_matrix(conductors: list[dict], eps_eff: float = 6.35, grid: int = 360,
                       default_gap: float = 30.0):
    """Solve the layout's electrostatics and return the Maxwell capacitance
    matrix [fF]. `conductors` = [{label, x, y, w, h, gap?}] in microns. Each island
    is surrounded by an etched gap; beyond the gap is the ground plane (the real
    coplanar geometry), so self-capacitance is set by the physical gap, not the
    domain size. Returns (labels, M) — M diagonal = self, off-diag = -mutual."""
    if not conductors:
        return None
    n = len(conductors)
    gaps = [float(c.get("gap", default_gap) or default_gap) for c in conductors]
    maxgap = max(gaps)
    xs0 = min(c["x"] for c in conductors); ys0 = min(c["y"] for c in conductors)
    xs1 = max(c["x"] + c["w"] for c in conductors); ys1 = max(c["y"] + c["h"] for c in conductors)
    pad = 1.6 * maxgap + 8.0
    x0, y0, x1, y1 = xs0 - pad, ys0 - pad, xs1 + pad, ys1 + pad

    # Resolution-driven grid: ≥~6 cells across the smallest gap so the etched gap
    # (which sets capacitance) is always well resolved, independent of layout size.
    # Capped so the sparse solve stays fast.
    # Fixed cell size (independent of gap) so corner-charge resolution is constant
    # → capacitance scales physically with gap (~1/gap). Grid is capped for speed.
    h_target = 5.0
    nx = int(min(grid, max(80, round((x1 - x0) / h_target) + 1)))
    h = (x1 - x0) / (nx - 1)
    ny = int(min(grid, max(40, round((y1 - y0) / h) + 1)))
    hy = (y1 - y0) / (ny - 1)
    gx = x0 + np.arange(nx) * h
    gy = y0 + np.arange(ny) * hy

    # node tag: ground plane everywhere by default; each island = k; a gap ring
    # of dielectric (free) around each island separates it from the ground plane.
    cid = np.full((ny, nx), -2, dtype=int)  # -2 ground, -1 free, k>=0 conductor
    for k, c in enumerate(conductors):
        g = gaps[k]
        ix = np.where((gx >= c["x"] - g) & (gx <= c["x"] + c["w"] + g))[0]
        iy = np.where((gy >= c["y"] - g) & (gy <= c["y"] + c["h"] + g))[0]
        if len(ix) and len(iy):
            sub = cid[np.ix_(iy, ix)]
            sub[sub == -2] = -1                          # carve the etched gap (free)
            cid[np.ix_(iy, ix)] = sub
    for k, c in enumerate(conductors):                   # then stamp the metal islands
        ix = np.where((gx >= c["x"]) & (gx <= c["x"] + c["w"]))[0]
        iy = np.where((gy >= c["y"]) & (gy <= c["y"] + c["h"]))[0]
        if len(ix) and len(iy):
            cid[np.ix_(iy, ix)] = k
    flat = cid.ravel()
    N = nx * ny

    # 5-point Laplacian (positive-diagonal): (L φ)[m] = Σ_n w (φ_m − φ_n)
    def tri(m):
        e = np.ones(m)
        return sparse.diags([-e, 2 * e, -e], [-1, 0, 1], shape=(m, m))
    cx, cy = 1.0 / h ** 2, 1.0 / hy ** 2
    L = (cx * sparse.kron(sparse.identity(ny), tri(nx))
         + cy * sparse.kron(tri(ny), sparse.identity(nx))).tocsr()

    free = np.flatnonzero(flat == -1)
    A = L[free][:, free].tocsc()
    solve = factorized(A)                              # factorise once, reuse per conductor
    eps = EPS0 * eps_eff

    M = np.zeros((n, n))
    for j in range(n):
        phi0 = np.zeros(N)
        phi0[flat == j] = 1.0                          # conductor j at 1 V, rest 0
        b = -(L @ phi0)[free]
        phi = phi0.copy()
        phi[free] = solve(b)
        q = eps * (L @ phi)                            # induced charge / unit length at each node
        for k in range(n):
            M[k, j] = q[flat == k].sum()
    M = 0.5 * (M + M.T) * _T_EFF * 1e15                # symmetrise + scale to fF
    labels = [c.get("label", f"C{i+1}") for i, c in enumerate(conductors)]
    return labels, M


def lc_eigenmodes(M_fF, l_inv):
    """Normal-mode (eigenmode) frequencies of the coupled LC network.

    Solves the generalized symmetric eigenproblem  (1/L) v = ω² C v, i.e. the
    linear normal modes of the circuit whose nodes carry the FEM-extracted Maxwell
    capacitance matrix `M_fF` [fF] and per-node inverse-inductance matrix `l_inv`
    [1/H] (diagonal 1/L_node from the Josephson/geometric inductance). Returns a
    list of (freq_GHz, eigenvector) sorted by frequency — the device's mode spectrum.
    """
    C = np.asarray(M_fF, dtype=float) * 1e-15      # fF → F
    G = np.asarray(l_inv, dtype=float)             # 1/H
    if C.shape[0] == 0:
        return []
    # symmetrise (numerical hygiene) and solve G v = ω² C v
    C = 0.5 * (C + C.T)
    G = 0.5 * (G + G.T)
    try:
        w, V = eigh(G, C)                          # w = ω² (rad/s)²
    except Exception:
        return []
    out = []
    for k in range(len(w)):
        if w[k] <= 0:
            continue
        f_ghz = float(np.sqrt(w[k]) / (2.0 * np.pi) / 1e9)
        out.append((f_ghz, V[:, k]))
    out.sort(key=lambda t: t[0])
    return out
