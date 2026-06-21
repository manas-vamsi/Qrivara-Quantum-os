import { seeded } from "@/lib/utils";

/* ===========================================================================
   QRIVARA — mock data layer
   Realistic superconducting-quantum-hardware data used across all modules.
   =========================================================================== */

export type ComponentKind =
  | "transmon"
  | "fluxonium"
  | "resonator"
  | "coupler"
  | "feedline"
  | "launchpad"
  | "flux-line"
  | "junction"
  | "squid"
  | "airbridge"
  | "tsv"
  | "ground"
  | "parametric-amplifier"
  | "purcell-filter";

export interface ComponentDef {
  id: string;
  kind: ComponentKind;
  name: string;
  category:
    | "Qubits"
    | "Resonators"
    | "Couplers"
    | "Control"
    | "Readout"
    | "Chip";
  description: string;
  defaults: Record<string, number | string>;
  color: "primary" | "cyan" | "violet" | "success" | "warning";
}

export const COMPONENT_LIBRARY: ComponentDef[] = [
  /* -------------------------------- Qubits -------------------------------- */
  {
    id: "transmon",
    kind: "transmon",
    name: "Transmon",
    category: "Qubits",
    description: "Charge-insensitive qubit (EJ ≫ EC)",
    defaults: {
      pad_width_um: 455,
      pad_height_um: 90,
      pad_gap_um: 30,
      junction_width_nm: 200,
      junction_length_nm: 200,
      fillet_radius_um: 10,
      halo_gap_um: 40,
      target_freq_GHz: 5.2,
      anharmonicity_MHz: -310,
      material: "Aluminum",
      layer: 1,
    },
    color: "primary",
  },
  {
    id: "xmon",
    kind: "transmon",
    name: "Xmon",
    category: "Qubits",
    description: "Cross-shaped transmon with 4 coupling arms",
    defaults: {
      arm_length_um: 180,
      arm_width_um: 24,
      cross_width_um: 24,
      gap_um: 30,
      fillet_radius_um: 5,
      target_freq_GHz: 5.0,
      material: "Aluminum",
      layer: 1,
    },
    color: "primary",
  },
  {
    id: "concentric-transmon",
    kind: "transmon",
    name: "Concentric Transmon",
    category: "Qubits",
    description: "Circular center pad with outer ring, low footprint",
    defaults: {
      inner_radius_um: 120,
      outer_radius_um: 160,
      gap_um: 20,
      target_freq_GHz: 4.8,
    },
    color: "primary",
  },
  {
    id: "fluxonium",
    kind: "fluxonium",
    name: "Fluxonium",
    category: "Qubits",
    description: "Junction-array shunted qubit, high anharmonicity",
    defaults: {
      inductor_count: 100,
      loop_area_um2: 30,
      junction_area_um2: 0.02,
      kinetic_inductance_pH: 15,
      target_freq_GHz: 0.5,
    },
    color: "violet",
  },

  /* ------------------------------ Resonators ------------------------------ */
  {
    id: "cpw-resonator",
    kind: "resonator",
    name: "CPW Resonator",
    category: "Resonators",
    description: "Coplanar-waveguide resonator",
    defaults: {
      length_um: 4200,
      width_um: 10,
      gap_um: 6,
      fillet_radius_um: 90,
      impedance_ohm: 50,
      target_freq_GHz: 6.5,
    },
    color: "cyan",
  },
  {
    id: "readout-resonator",
    kind: "resonator",
    name: "Readout Resonator",
    category: "Resonators",
    description: "Dispersive readout resonator",
    defaults: { length_um: 4200, fillet_radius_um: 90, coupling_MHz: 1.2, frequency_GHz: 7.1 },
    color: "cyan",
  },
  {
    id: "purcell-filter",
    kind: "purcell-filter",
    name: "Purcell Filter",
    category: "Resonators",
    description: "Bandpass filter to prevent qubit decay via readout",
    defaults: { bandwidth_MHz: 50, frequency_GHz: 7.1, length_um: 2000 },
    color: "cyan",
  },

  /* ------------------------------- Couplers ------------------------------- */
  {
    id: "capacitive-coupler",
    kind: "coupler",
    name: "Capacitive Coupler",
    category: "Couplers",
    description: "Direct capacitive qubit–qubit coupling",
    defaults: { distance_um: 12, coupling_length_um: 120, capacitance_fF: 4.5 },
    color: "violet",
  },
  {
    id: "inductive-coupler",
    kind: "coupler",
    name: "Inductive Coupler",
    category: "Couplers",
    description: "Mutual-inductance coupling element",
    defaults: { mutual_inductance_pH: 2.1, loop_area_um2: 40, distance_um: 10 },
    color: "violet",
  },
  {
    id: "snail-coupler",
    kind: "squid",
    name: "SNAIL Coupler",
    category: "Couplers",
    description: "Asymmetric SQUID for 3-wave mixing and 0-ZZ crosstalk",
    defaults: { loop_area_um2: 25, asymmetry_ratio: 0.1, target_g_MHz: 100 },
    color: "violet",
  },

  /* ----------------------------- Control lines ---------------------------- */
  {
    id: "drive-line",
    kind: "junction",
    name: "Drive Line",
    category: "Control",
    description: "XY microwave drive line",
    defaults: { width_um: 10, gap_um: 6, impedance_ohm: 50, power_dBm: -30 },
    color: "warning",
  },
  {
    id: "flux-line",
    kind: "flux-line",
    name: "Flux Line",
    category: "Control",
    description: "Z flux-bias control line",
    defaults: { current_mA: 1.0, width_um: 4, distance_um: 8 },
    color: "warning",
  },

  /* -------------------------------- Readout ------------------------------- */
  {
    id: "feedline",
    kind: "feedline",
    name: "Feedline",
    category: "Readout",
    description: "Shared readout transmission line",
    defaults: { length_um: 2800, width_um: 10, gap_um: 6, fillet_radius_um: 90, impedance_ohm: 50 },
    color: "success",
  },
  {
    id: "readout-port",
    kind: "launchpad",
    name: "Readout Port",
    category: "Readout",
    description: "Wirebond IO port for readout",
    defaults: { freq_range_GHz: "6–8", power_dBm: -40 },
    color: "success",
  },
  {
    id: "jpa",
    kind: "parametric-amplifier",
    name: "Parametric Amp (JPA)",
    category: "Readout",
    description: "On-chip Josephson Parametric Amplifier for signal boost",
    defaults: { gain_dB: 20, bandwidth_MHz: 20, center_freq_GHz: 7.1 },
    color: "success",
  },

  /* ----------------------------- Chip level ------------------------------- */
  {
    id: "chip-substrate",
    kind: "ground",
    name: "Chip Substrate",
    category: "Chip",
    description: "Wafer substrate the circuit is patterned on",
    defaults: { length_mm: 9, width_mm: 9, thickness_um: 525, material: "Silicon" },
    color: "success",
  },
  {
    id: "ground-plane",
    kind: "ground",
    name: "Ground Plane",
    category: "Chip",
    description: "Patterned ground reference layer",
    defaults: { layer: 0, thickness_nm: 200 },
    color: "success",
  },
  {
    id: "air-bridge",
    kind: "airbridge",
    name: "Air Bridges",
    category: "Chip",
    description: "Crossover suppressing slotline modes",
    defaults: { length_um: 30, width_um: 8, height_um: 3 },
    color: "success",
  },
  {
    id: "tsv",
    kind: "tsv",
    name: "Through-Silicon Via",
    category: "Chip",
    description: "Vertical interconnect for 3D routing",
    defaults: { diameter_um: 20, depth_um: 150, material: "Copper" },
    color: "success",
  },
];

/* --------------------------------- Projects ------------------------------- */
export interface Project {
  id: string;
  name: string;
  description: string;
  qubits: number;
  status: "active" | "review" | "archived" | "simulating";
  updatedAt: string;
  collaborators: string[];
  progress: number;
  tags: string[];
}

/** SSOT for project-status → tone (used by Dashboard & Collaboration). */
export const PROJECT_STATUS_TONE: Record<string, "primary" | "cyan" | "warning" | "neutral"> = {
  active: "primary",
  simulating: "cyan",
  review: "warning",
  archived: "neutral",
};

export const PROJECTS: Project[] = [
  {
    id: "p-falcon",
    name: "Falcon-17 Processor",
    description: "17-qubit heavy-hex lattice with tunable couplers",
    qubits: 17,
    status: "active",
    updatedAt: "2026-06-14T08:20:00Z",
    collaborators: ["Karthik Nair", "Lena Müller", "Diego Santos", "Yuki Tanaka"],
    progress: 72,
    tags: ["heavy-hex", "tunable", "flagship"],
  },
  {
    id: "p-sparrow",
    name: "Sparrow Test Chip",
    description: "2-qubit gate-fidelity characterization device",
    qubits: 2,
    status: "simulating",
    updatedAt: "2026-06-13T16:45:00Z",
    collaborators: ["Lena Müller", "Aisha Khan"],
    progress: 91,
    tags: ["test", "two-qubit"],
  },
  {
    id: "p-condor",
    name: "Condor Readout Array",
    description: "Multiplexed readout for 8 qubits on a single feedline",
    qubits: 8,
    status: "review",
    updatedAt: "2026-06-12T11:10:00Z",
    collaborators: ["Diego Santos", "Karthik Nair", "Priya Raman"],
    progress: 58,
    tags: ["readout", "multiplexed"],
  },
  {
    id: "p-wren",
    name: "Wren Coupler Study",
    description: "Parametric study of tunable coupler geometries",
    qubits: 4,
    status: "active",
    updatedAt: "2026-06-11T09:05:00Z",
    collaborators: ["Yuki Tanaka", "Aisha Khan"],
    progress: 34,
    tags: ["coupler", "sweep"],
  },
  {
    id: "p-heron",
    name: "Heron Legacy Tile",
    description: "Archived 5-qubit reference design",
    qubits: 5,
    status: "archived",
    updatedAt: "2026-05-28T14:30:00Z",
    collaborators: ["Priya Raman"],
    progress: 100,
    tags: ["reference"],
  },
];

/* --------------------------------- Team ----------------------------------- */
export interface Member {
  name: string;
  role: string;
  email: string;
  status: "online" | "away" | "offline";
}

export const TEAM: Member[] = [
  { name: "Karthik Nair", role: "Lead Quantum Engineer", email: "karthik@nexvista.com", status: "online" },
  { name: "Lena Müller", role: "Device Physicist", email: "lena@qrivara.tech", status: "online" },
  { name: "Diego Santos", role: "RF / Microwave Engineer", email: "diego@qrivara.tech", status: "away" },
  { name: "Yuki Tanaka", role: "Fabrication Lead", email: "yuki@qrivara.tech", status: "offline" },
  { name: "Aisha Khan", role: "PhD Researcher", email: "aisha@qrivara.tech", status: "online" },
  { name: "Priya Raman", role: "Simulation Specialist", email: "priya@qrivara.tech", status: "offline" },
];

/* ------------------------------- Activity --------------------------------- */
export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  type: "design" | "sim" | "comment" | "optimize" | "review" | "commit";
  at: string;
}

export const ACTIVITY: ActivityItem[] = [
  { id: "a1", actor: "Lena Müller", action: "ran a frequency sweep on", target: "Falcon-17 / Q7", type: "sim", at: "2026-06-14T08:18:00Z" },
  { id: "a2", actor: "Karthik Nair", action: "committed", target: "v2.4 — coupler retune", type: "commit", at: "2026-06-14T07:52:00Z" },
  { id: "a3", actor: "Diego Santos", action: "left a review on", target: "Condor Readout Array", type: "review", at: "2026-06-14T06:40:00Z" },
  { id: "a4", actor: "Aisha Khan", action: "started optimization", target: "minimize ZZ crosstalk", type: "optimize", at: "2026-06-13T22:11:00Z" },
  { id: "a5", actor: "Yuki Tanaka", action: "commented on", target: "junction overlap geometry", type: "comment", at: "2026-06-13T18:30:00Z" },
  { id: "a6", actor: "Lena Müller", action: "updated design", target: "Sparrow Test Chip", type: "design", at: "2026-06-13T16:45:00Z" },
];

/* ---------------------------- Simulation runs ----------------------------- */
export type SimType = "frequency" | "capacitance" | "coupling" | "sweep" | "epr" | "scattering" | "validation" | "zz_crosstalk" | "decoherence";
export interface SimRun {
  id: string;
  name: string;
  type: SimType;
  solver: string;
  status: "completed" | "running" | "queued" | "failed";
  progress: number;
  duration: string;
  mesh: string;
  at: string;
  result?: string;
}

export const SIM_RUNS: SimRun[] = [
  { id: "s1", name: "Q7 resonance", type: "frequency", solver: "QRIVARA FEM", status: "completed", progress: 100, duration: "4m 12s", mesh: "168k nodes", at: "2026-06-14T08:18:00Z", result: "5.214 GHz" },
  { id: "s2", name: "Cross-coupling matrix", type: "capacitance", solver: "QRIVARA 3-D FEM", status: "running", progress: 64, duration: "2m 40s", mesh: "150k nodes", at: "2026-06-14T08:30:00Z" },
  { id: "s3", name: "Coupler g sweep", type: "coupling", solver: "QRIVARA Quantum Engine", status: "queued", progress: 0, duration: "—", mesh: "—", at: "2026-06-14T08:34:00Z" },
  { id: "s4", name: "Readout κ", type: "frequency", solver: "QRIVARA FEM", status: "completed", progress: 100, duration: "6m 05s", mesh: "240k nodes", at: "2026-06-13T20:02:00Z", result: "1.18 MHz" },
  { id: "s5", name: "Junction LJ", type: "capacitance", solver: "QRIVARA 3-D FEM", status: "failed", progress: 38, duration: "1m 50s", mesh: "70k nodes", at: "2026-06-13T15:20:00Z" },
];

/* ----------------------- Chart-friendly datasets -------------------------- */
const rng = seeded(42);

// S21 transmission curve (readout resonance dip) around 7.1 GHz
export const S21_CURVE = Array.from({ length: 81 }, (_, i) => {
  const f = 6.9 + (i / 80) * 0.4; // GHz
  const f0 = 7.1;
  const kappa = 0.012;
  const lorentz = 1 - 0.92 / (1 + ((f - f0) / kappa) ** 2);
  const db = 20 * Math.log10(lorentz) + (rng() - 0.5) * 0.25;
  return { freq: Number(f.toFixed(4)), s21: Number(db.toFixed(3)) };
});

// Convergence of eigenfrequency vs mesh pass
export const CONVERGENCE = Array.from({ length: 10 }, (_, i) => ({
  pass: i + 1,
  freq: Number((5.18 + 0.06 * Math.exp(-i / 2.2) + (rng() - 0.5) * 0.004).toFixed(4)),
  error: Number((Math.max(0.02, 2.4 * Math.exp(-i / 1.8)) ).toFixed(3)),
}));

// Capacitance matrix (fF) — symmetric, qubit/island
export const CAP_MATRIX = {
  labels: ["Q1", "Q2", "Cpl", "Res", "Gnd"],
  values: [
    [78.2, 2.1, 4.4, 0.9, 61.0],
    [2.1, 79.1, 4.6, 0.8, 60.4],
    [4.4, 4.6, 41.2, 1.4, 33.1],
    [0.9, 0.8, 1.4, 55.7, 48.2],
    [61.0, 60.4, 33.1, 48.2, 320.0],
  ],
};

// Coupling strength vs coupler flux (Φ/Φ0)
export const COUPLING_SWEEP = Array.from({ length: 41 }, (_, i) => {
  const flux = -0.5 + (i / 40) * 1.0;
  const g = 4 + 88 * Math.abs(Math.cos(Math.PI * flux)) ** 2;
  const zz = 0.02 + 0.85 * Math.abs(Math.cos(Math.PI * flux)) ** 4;
  return {
    flux: Number(flux.toFixed(3)),
    g: Number(g.toFixed(2)),
    zz: Number(zz.toFixed(3)),
  };
});

// T1 / T2 distribution across qubits
export const COHERENCE = Array.from({ length: 17 }, (_, i) => ({
  qubit: `Q${i + 1}`,
  t1: Math.round(85 + rng() * 60),
  t2: Math.round(60 + rng() * 55),
}));

/* --------------------------- Optimization runs ---------------------------- */
export interface OptObjective {
  id: string;
  name: string;
  target: string;
  current: number;
  goal: number;
  unit: string;
  weight: number;
  direction: "min" | "max" | "target";
}

export const OPT_OBJECTIVES: OptObjective[] = [
  { id: "o1", name: "Qubit frequency", target: "5.200 GHz", current: 5.214, goal: 5.2, unit: "GHz", weight: 1.0, direction: "target" },
  { id: "o2", name: "Anharmonicity", target: "-310 MHz", current: -298, goal: -310, unit: "MHz", weight: 0.8, direction: "target" },
  { id: "o3", name: "ZZ crosstalk", target: "minimize", current: 142, goal: 50, unit: "kHz", weight: 1.0, direction: "min" },
  { id: "o4", name: "Coupling g", target: "92 MHz", current: 88, goal: 92, unit: "MHz", weight: 0.6, direction: "target" },
];

export const OPT_PARAMS = [
  { id: "pad_gap", name: "Pad gap", value: 30, min: 10, max: 60, unit: "µm" },
  { id: "claw_len", name: "Claw length", value: 145, min: 80, max: 220, unit: "µm" },
  { id: "coupler_w", name: "Coupler width", value: 12, min: 4, max: 30, unit: "µm" },
  { id: "junction", name: "Junction area", value: 0.045, min: 0.02, max: 0.09, unit: "µm²" },
];

// Physics-based error budget (IQM 2024, npj QI 10:43). The optimum is a region
// in EJ–EC space found by jointly minimizing these five error sources.
export interface ErrorTerm {
  id: string;
  name: string;
  value: number; // current contribution, ×1e-3 (per-gate)
  weight: number;
  note: string;
}
export const OPT_ERRORS: ErrorTerm[] = [
  { id: "tls", name: "TLS / T₁ decay", value: 1.8, weight: 1.0, note: "Surface two-level-system loss" },
  { id: "flux", name: "Flux-noise dephasing", value: 1.2, weight: 0.8, note: "1/f flux noise on tunable qubits" },
  { id: "leakage", name: "Leakage", value: 0.9, weight: 0.9, note: "Low anharmonicity → |2⟩ leakage" },
  { id: "prep", name: "State-prep error", value: 0.6, weight: 0.6, note: "Finite-temperature residual |1⟩" },
  { id: "parity", name: "Parity-switch (2Q)", value: 2.4, weight: 1.0, note: "|2⟩ charge dispersion, EJ/EC ≲ 65" },
];

// Optimization loss curve over iterations
export const OPT_HISTORY = Array.from({ length: 60 }, (_, i) => {
  const base = 1.0 * Math.exp(-i / 14);
  return {
    iter: i + 1,
    loss: Number((base + (rng() - 0.5) * 0.04 * base + 0.012).toFixed(4)),
    best: Number((1.0 * Math.exp(-i / 12) + 0.01).toFixed(4)),
  };
});

// Pareto front points (two competing objectives)
export const PARETO = Array.from({ length: 28 }, (_, i) => {
  const x = 40 + i * 4 + rng() * 8;
  const y = 200 - 3.0 * i + rng() * 20;
  return {
    zz: Number(x.toFixed(1)),
    anharm: Number(y.toFixed(1)),
    dominated: rng() > 0.62,
  };
});

/* ----------------------------- Experiments -------------------------------- */
export interface Version {
  id: string;
  label: string;
  message: string;
  author: string;
  at: string;
  freq: number;
  fidelity: number;
  tag?: string;
  current?: boolean;
}

export const VERSIONS: Version[] = [
  { id: "v24", label: "v2.4", message: "Coupler retune for lower ZZ", author: "Karthik Nair", at: "2026-06-14T07:52:00Z", freq: 5.214, fidelity: 99.62, tag: "candidate", current: true },
  { id: "v23", label: "v2.3", message: "Adjusted claw geometry", author: "Lena Müller", at: "2026-06-13T14:20:00Z", freq: 5.231, fidelity: 99.48 },
  { id: "v22", label: "v2.2", message: "Purcell filter bandwidth +40 MHz", author: "Diego Santos", at: "2026-06-12T10:05:00Z", freq: 5.225, fidelity: 99.41 },
  { id: "v21", label: "v2.1", message: "Re-routed feedline to reduce crosstalk", author: "Karthik Nair", at: "2026-06-10T16:40:00Z", freq: 5.240, fidelity: 99.20 },
  { id: "v20", label: "v2.0", message: "Migrated to heavy-hex lattice", author: "Lena Müller", at: "2026-06-08T09:15:00Z", freq: 5.260, fidelity: 98.95, tag: "milestone" },
  { id: "v15", label: "v1.5", message: "Baseline 17-qubit layout", author: "Karthik Nair", at: "2026-06-02T11:30:00Z", freq: 5.290, fidelity: 98.40 },
];

// Design evolution metric over versions (oldest -> newest)
export const EVOLUTION = [...VERSIONS]
  .reverse()
  .map((v) => ({
    version: v.label,
    fidelity: v.fidelity,
    freq: v.freq,
    zz: Number((220 - v.fidelity * 0.8 + 80).toFixed(0)),
  }));

/* ----------------------------- Comments ----------------------------------- */
export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string;
  resolved?: boolean;
  target: string;
}

export const COMMENTS: Comment[] = [
  { id: "c1", author: "Diego Santos", text: "The Q7 readout dip looks shallow — can we bump Qc to ~15k?", at: "2026-06-14T06:40:00Z", target: "Condor Readout Array", resolved: false },
  { id: "c2", author: "Aisha Khan", text: "ZZ on the Q3–Q4 pair is still above spec after the retune.", at: "2026-06-13T22:30:00Z", target: "Falcon-17 / coupler", resolved: false },
  { id: "c3", author: "Yuki Tanaka", text: "Junction overlap is fine for our fab tolerance, approved.", at: "2026-06-13T18:30:00Z", target: "Sparrow Test Chip", resolved: true },
  { id: "c4", author: "Lena Müller", text: "Nice — eigenmode converged in 8 passes now.", at: "2026-06-13T17:02:00Z", target: "Falcon-17 / Q7", resolved: true },
];

/* --------------------------- Dashboard KPIs ------------------------------- */
export const KPI_TREND = Array.from({ length: 14 }, (_, i) => ({
  day: i,
  sims: Math.round(8 + 6 * Math.sin(i / 2) + rng() * 5),
  designs: Math.round(3 + 2 * Math.cos(i / 3) + rng() * 3),
}));

/* --------------------------- Materials database ---------------------------- */
export interface ConductorDef {
  id: string;
  name: string;
  conductivity_Sm: number; // S/m
  tcK: number; // superconducting Tc (0 = normal metal)
  note: string;
}
export const CONDUCTORS: ConductorDef[] = [
  { id: "al", name: "Aluminum", conductivity_Sm: 3.8e7, tcK: 1.2, note: "Junction electrodes" },
  { id: "nb", name: "Niobium", conductivity_Sm: 6.6e6, tcK: 9.3, note: "Workhorse film" },
  { id: "tin", name: "Titanium Nitride", conductivity_Sm: 5.0e6, tcK: 4.5, note: "High kinetic inductance" },
  { id: "ta", name: "Tantalum", conductivity_Sm: 7.7e6, tcK: 4.4, note: "Record coherence" },
  { id: "au", name: "Gold", conductivity_Sm: 4.1e7, tcK: 0, note: "Normal-metal wirebond / GND" },
  { id: "cu", name: "Copper", conductivity_Sm: 5.96e7, tcK: 0, note: "Normal-metal packaging" },
];
/** Back-compat alias (used by Fabrication). */
export const METALS = CONDUCTORS;

export interface SubstrateDef {
  id: string;
  name: string;
  eps: number; // relative permittivity εr
  tanD: number; // loss tangent
  thickness_um: number;
  note: string;
}
export const SUBSTRATES: SubstrateDef[] = [
  { id: "si", name: "Silicon", eps: 11.7, tanD: 2e-7, thickness_um: 525, note: "High-resistivity Si" },
  { id: "sapphire", name: "Sapphire", eps: 9.8, tanD: 1e-7, thickness_um: 430, note: "Low-loss c-plane" },
  { id: "sic", name: "Silicon Carbide", eps: 9.7, tanD: 5e-7, thickness_um: 500, note: "High thermal conductivity" },
  { id: "quartz", name: "Quartz", eps: 3.8, tanD: 3e-7, thickness_um: 500, note: "Fused silica" },
];

export interface LossInterface {
  id: string;
  name: string;
  p: number; // surface participation ratio
  tanD: number; // loss tangent
}
export const LOSS_INTERFACES: LossInterface[] = [
  { id: "MA", name: "Metal–Air", p: 6e-5, tanD: 1.5e-3 },
  { id: "SA", name: "Substrate–Air", p: 9e-5, tanD: 2.2e-3 },
  { id: "MS", name: "Metal–Substrate", p: 3e-5, tanD: 2.6e-3 },
  { id: "bulk", name: "Bulk dielectric", p: 0.9, tanD: 1.8e-7 },
];

export interface DrcRule {
  id: string;
  name: string;
  value: number;
  min: number;
  max?: number;
  unit: string;
}
export const DRC_RULES: DrcRule[] = [
  { id: "gap", name: "Min CPW gap", value: 6, min: 4, unit: "µm" },
  { id: "width", name: "Min trace width", value: 10, min: 4, unit: "µm" },
  { id: "jj", name: "Junction overlap", value: 0.045, min: 0.02, max: 0.09, unit: "µm²" },
  { id: "spacing", name: "Qubit spacing", value: 1200, min: 800, unit: "µm" },
  { id: "airbridge", name: "Airbridge span", value: 30, min: 10, max: 60, unit: "µm" },
  { id: "tsv", name: "TSV pitch", value: 100, min: 80, unit: "µm" },
  { id: "keepout", name: "Dicing keep-out", value: 200, min: 150, unit: "µm" },
];
