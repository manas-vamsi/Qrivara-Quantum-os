/* ===========================================================================
   QRIVARA — Quantum physics engine
   Citation-grounded formulas for superconducting-qubit design (the
   "EM → Hamiltonian → coherence" layer). Energies are handled in GHz unless
   noted; couplings/shifts in MHz. Sources: Koch 2007 (PRA 76, 042319),
   Krantz 2019 (arXiv:1904.06560), Kjaergaard 2019 (arXiv:1905.13641).
   =========================================================================== */

// Physical constants (SI)
const H = 6.62607015e-34; // J·s
const E = 1.602176634e-19; // C
const PHI0 = H / (2 * E); // magnetic flux quantum, Wb
const KB = 1.380649e-23; // J/K

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Charging energy EC [GHz] from total qubit capacitance C_Σ [fF].
 *  EC = e²/(2 C_Σ). Typical: C_Σ ≈ 80 fF → EC ≈ 0.24 GHz (240 MHz). */
export function ecFromCapacitance(cFf: number): number {
  const C = Math.max(cFf, 1e-6) * 1e-15;
  return (E * E) / (2 * C * H) / 1e9;
}

/** Josephson energy EJ [GHz] from junction critical current Ic [nA].
 *  EJ = Ic·Φ0/(2π). Typical: Ic ≈ 30 nA → EJ ≈ 14.9 GHz. */
export function ejFromIc(icNa: number): number {
  const Ic = icNa * 1e-9;
  return (Ic * PHI0) / (2 * Math.PI) / H / 1e9;
}

/** Josephson energy EJ [GHz] from Josephson inductance Lj [nH].
 *  EJ = (Φ0/2π)²/Lj. Typical: Lj ≈ 10 nH → EJ ≈ 16.3 GHz. */
export function ejFromLj(ljNh: number): number {
  const Lj = Math.max(ljNh, 1e-6) * 1e-9;
  const phi = PHI0 / (2 * Math.PI);
  return (phi * phi) / Lj / H / 1e9;
}

/** Transmon 0→1 transition f01 [GHz] = √(8·EJ·EC) − EC.
 *  Guards against a negative radicand so the UI never shows NaN. */
export function f01(ejGhz: number, ecGhz: number): number {
  return Math.sqrt(Math.max(0, 8 * ejGhz * ecGhz)) - ecGhz;
}

/** Anharmonicity α [MHz] ≈ −EC. */
export function anharmonicity(ecGhz: number): number {
  return -ecGhz * 1000;
}

/** Effective EJ of a (a)symmetric SQUID at flux Φ/Φ0.
 *  EJ_eff = EJΣ·|cos(πφ)|·√(1 + d²·tan²(πφ)),  d = (γ−1)/(γ+1). */
export function squidEj(
  ejSumGhz: number,
  fluxRatio: number,
  asymmetryD = 0,
): number {
  const p = Math.PI * fluxRatio;
  return (
    ejSumGhz *
    Math.abs(Math.cos(p)) *
    Math.sqrt(1 + asymmetryD * asymmetryD * Math.tan(p) * Math.tan(p))
  );
}

/** Qubit–resonator coupling g [MHz] (capacitive, leading order).
 *  g ≈ ½·(Cg/√(Cq·Cr))·√(fq·fr). */
export function couplingG(
  cgFf: number,
  cqFf: number,
  crFf: number,
  fqGhz: number,
  frGhz: number,
): number {
  const beta = cgFf / Math.sqrt(Math.max(cqFf * crFf, 1e-6));
  return 0.5 * beta * Math.sqrt(Math.max(fqGhz * frGhz, 0)) * 1000;
}

/** Dispersive shift χ [MHz] for a transmon:
 *  χ = (g²/Δ)·α/(Δ+α), Δ = fq − fr. */
export function dispersiveShift(
  gMhz: number,
  fqGhz: number,
  frGhz: number,
  anharmMhz: number,
): number {
  const delta = (fqGhz - frGhz) * 1000; // MHz
  if (Math.abs(delta) < 1e-6 || Math.abs(delta + anharmMhz) < 1e-6) return 0;
  return ((gMhz * gMhz) / delta) * (anharmMhz / (delta + anharmMhz));
}

/** Purcell-limited T1 [µs]: Γ_p = (g/Δ)²·κ, T1 = 1/Γ_p. */
export function purcellT1(
  gMhz: number,
  fqGhz: number,
  frGhz: number,
  kappaMhz: number,
): number {
  const delta = (fqGhz - frGhz) * 1000; // MHz
  if (Math.abs(delta) < 1e-6 || kappaMhz <= 0) return Infinity;
  const gammaP = Math.pow(gMhz / delta, 2) * (kappaMhz * 1e6); // Hz
  return (1 / gammaP) * 1e6; // µs
}

/** Intrinsic T1 [µs] from a quality factor Q at f01. T1 = Q/(2π f01). */
export function t1FromQ(qFactor: number, f01Ghz: number): number {
  return qFactor / (2 * Math.PI * f01Ghz * 1e9) * 1e6;
}

/** Combine relaxation channels (rates add): T1 = 1/Σ(1/Ti) [µs]. */
export function combineT1(...t1sUs: number[]): number {
  const rate = t1sUs.reduce((s, t) => s + (t > 0 ? 1 / t : 0), 0);
  return rate > 0 ? 1 / rate : Infinity;
}

/** T2 [µs] from T1 and pure dephasing Tφ: 1/T2 = 1/(2T1) + 1/Tφ. */
export function t2(t1Us: number, tPhiUs: number): number {
  const r = 1 / (2 * t1Us) + (tPhiUs > 0 ? 1 / tPhiUs : 0);
  return 1 / r;
}

/** Koch charge dispersion |ε_m| [MHz] — the splitting of level m vs offset
 *  charge. ε_m ∝ EC·(EJ/2EC)^(m/2+3/4)·e^(−√(8EJ/EC)). The |ε2/ε1| ratio
 *  (~40 at EJ/EC≈50) drives parity-switching errors on the |2⟩-using CZ gate. */
export function chargeDispersion(m: number, ejGhz: number, ecGhz: number): number {
  const ratio = ejGhz / ecGhz;
  const pref =
    ecGhz *
    (Math.pow(2, 4 * m + 5) / factorial(m)) *
    Math.sqrt(2 / Math.PI);
  const val =
    pref *
    Math.pow(ejGhz / (2 * ecGhz), m / 2 + 3 / 4) *
    Math.exp(-Math.sqrt(8 * ratio));
  return Math.abs(val) * 1000; // MHz
}

/** Thermal excited-state population (state-prep error) at temperature T [K]. */
export function thermalPopulation(f01Ghz: number, tempK = 0.02): number {
  return Math.exp(-(H * f01Ghz * 1e9) / (KB * tempK));
}

/* ----------------------- Multi-objective error model ----------------------- *
 * Physics-motivated error terms (IQM 2024, npj QI 10:43) used to score a
 * design point in EJ–EC space. The optimum is a REGION, not a point. Values
 * are normalized, illustrative weights — directions are physically correct. */
export interface DesignErrors {
  tls: number; // TLS / T1-limited gate error
  flux: number; // flux-noise dephasing (tunable qubits)
  leakage: number; // leakage from low anharmonicity
  prep: number; // finite-temperature state-prep error
  parity: number; // |2⟩-level charge-parity-switch (2-qubit gate)
  total: number;
}

export function designErrors(
  ejGhz: number,
  ecGhz: number,
  opts: { tempK?: number; tunable?: boolean } = {},
): DesignErrors {
  const f = f01(ejGhz, ecGhz);
  const anhMhz = ecGhz * 1000; // |α|
  // leakage rises as anharmonicity (≈EC) shrinks
  const leakage = 6e3 / (anhMhz * anhMhz);
  // parity-switch error tracks the |2⟩ charge dispersion (rises at low EJ/EC)
  const parity = Math.min(1, chargeDispersion(2, ejGhz, ecGhz) / 0.05);
  // thermal state-prep error (lower for higher f01)
  const prep = thermalPopulation(f, opts.tempK ?? 0.02) * 20;
  // TLS/T1 — weak rise with frequency (more TLS spectral density)
  const tls = 0.004 * f;
  // flux-noise dephasing only for flux-tunable designs
  const flux = opts.tunable ? 0.012 : 0.003;
  const total = tls + flux + leakage + prep + parity;
  return { tls, flux, leakage, prep, parity, total };
}

/* ----------------------------- Inverse design ----------------------------- *
 * Solve the transmon relations backwards: given a target f01 + anharmonicity,
 * recover the geometry (C_Σ) and junction (Ic) that realise them. */
const EC_AT_1FF = ecFromCapacitance(1); // EC [GHz] for C_Σ = 1 fF
const EJ_PER_NA = ejFromIc(1); // EJ [GHz] per nA of Ic

/** Required total capacitance C_Σ [fF] for a target EC [GHz]. */
export function capacitanceForEc(ecGhz: number): number {
  return EC_AT_1FF / ecGhz;
}
/** Required junction critical current Ic [nA] for a target EJ [GHz]. */
export function icForEj(ejGhz: number): number {
  return ejGhz / EJ_PER_NA;
}
/** Inverse design: target f01 [GHz] + anharmonicity [MHz] → device params. */
export function designForTarget(
  f01Ghz: number,
  anharmMhz: number,
): { ec: number; ej: number; ratio: number; cSigma: number; ic: number } {
  // Fail-fast: clamp inputs to physically valid, non-zero ranges.
  const ec = Math.max(Math.abs(anharmMhz) / 1000, 1e-3); // EC ≈ |α|
  const f = Math.max(f01Ghz, 0.01);
  const ej = Math.pow(f + ec, 2) / (8 * ec); // invert f01 = √(8EJEC) − EC
  return {
    ec,
    ej,
    ratio: ej / ec,
    cSigma: capacitanceForEc(ec),
    ic: icForEj(ej),
  };
}

/* ------------------------- Surface participation / TLS --------------------- *
 * Dielectric loss budget: 1/Q = Σ pᵢ·tanδᵢ, then T1 = Q/(2π f01). */
export function lossBudget(
  interfaces: { p: number; tanD: number }[],
  f01Ghz: number,
): { invQ: number; Q: number; t1Us: number; contributions: number[] } {
  const contributions = interfaces.map((x) => x.p * x.tanD);
  const invQ = contributions.reduce((s, c) => s + c, 0);
  const Q = invQ > 0 ? 1 / invQ : Infinity;
  return { invQ, Q, t1Us: t1FromQ(Q, f01Ghz), contributions };
}

/* --------------------------- Linear algebra (Jacobi) ----------------------- */
function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}
function matmul(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let l = 0; l < k; l++) {
      const a = A[i][l];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[l][j];
    }
  return C;
}

/** Cyclic Jacobi eigensolver for a real symmetric matrix.
 *  Returns eigenvalues and eigenvectors (columns of `vectors`). */
export function eigSym(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const A = input.map((r) => r.slice());
  const V = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-16) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-18) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const aip = A[i][p], aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = A[p][i], aqi = A[q][i];
          A[p][i] = c * api - s * aqi;
          A[q][i] = s * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const values = A.map((_, i) => A[i][i]);
  return { values, vectors: V };
}

/* --------------------------- Fluxonium spectrum ---------------------------- *
 * H = 4·EC·n² + ½·EL·φ² − EJ·cos(φ − 2πΦ/Φ0), diagonalized in the harmonic
 * (LC-oscillator) basis. Returns the lowest levels [GHz] relative to ground.
 * This is the scqubits-class numerical model (true diagonalization). */
export function fluxoniumLevels(
  ejGhz: number,
  ecGhz: number,
  elGhz: number,
  fluxRatio: number,
  dim = 40,
): number[] {
  const N = dim;
  const phiZpf = Math.pow((8 * ecGhz) / elGhz, 0.25);
  const nZpf = 0.5 * Math.pow(elGhz / (8 * ecGhz), 0.25);

  // ladder operators in the Fock basis
  const a = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let n = 1; n < N; n++) a[n - 1][n] = Math.sqrt(n);
  const aT = a[0].map((_, j) => a.map((row) => row[j])); // transpose

  const phi: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const Mmat: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      phi[i][j] = phiZpf * (a[i][j] + aT[i][j]);
      Mmat[i][j] = aT[i][j] - a[i][j]; // (a† − a)
    }
  const phi2 = matmul(phi, phi);
  const M2 = matmul(Mmat, Mmat);
  // n² = −nZpf²·(a†−a)²  (real, symmetric, positive)
  const n2 = M2.map((row) => row.map((v) => -nZpf * nZpf * v));

  // cos(φ − φ_ext) via eigendecomposition of φ
  const { values: pv, vectors: pV } = eigSym(phi);
  const phiExt = 2 * Math.PI * fluxRatio;
  const cosD = pv.map((v) => Math.cos(v - phiExt));
  const cosPhi: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let k = 0; k < N; k++) sum += pV[i][k] * cosD[k] * pV[j][k];
      cosPhi[i][j] = sum;
    }

  const H: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      H[i][j] = 4 * ecGhz * n2[i][j] + 0.5 * elGhz * phi2[i][j] - ejGhz * cosPhi[i][j];

  const { values } = eigSym(H);
  const sorted = values.slice().sort((x, y) => x - y);
  const e0 = sorted[0];
  return sorted.slice(0, 6).map((e) => e - e0);
}

/** Sample EJ–EC space → grid points with a 0..100 quality score (for the
 *  optimal-region visualization). EC in GHz, EJ/EC ratio on the other axis. */
export function sweepEjEc(
  opts: { tunable?: boolean } = {},
): { ec: number; ratio: number; ejec: number; score: number; total: number }[] {
  const pts: { ec: number; ratio: number; ejec: number; score: number; total: number }[] = [];
  for (let ratio = 30; ratio <= 120; ratio += 4) {
    for (let ecMhz = 150; ecMhz <= 400; ecMhz += 12) {
      const ec = ecMhz / 1000;
      const ej = ratio * ec;
      const { total } = designErrors(ej, ec, opts);
      pts.push({ ec, ratio, ejec: ratio, score: total, total });
    }
  }
  // normalize total → score 0..100 (100 = best / lowest error)
  const totals = pts.map((p) => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return pts.map((p) => ({
    ...p,
    score: Math.round(100 * (1 - (p.total - min) / (max - min || 1))),
  }));
}
