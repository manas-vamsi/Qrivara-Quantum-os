import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import {
  Search,
  Code2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  MousePointer2,
  Cpu,
  Radio,
  Link2,
  Minus,
  CircleDot,
  Zap,
  Activity,
  Atom,
  Spline,
  Cable,
  Layers,
  Grid3x3,
  Play,
  TerminalSquare,
  Copy,
  Check,
  ArrowUpRight,
  X,
  Download,
  PanelRight,
  Share2,
  CopyPlus,
  Magnet,
  Keyboard,
  LayoutGrid,
  RotateCcw,
  Gauge,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QuantumNode, { type QuantumNodeData } from "@/designer/QuantumNode";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/Badge";
import { Input, Slider } from "@/components/ui/Form";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/common/EmptyState";
import { ShareDialog } from "@/components/collab/ShareDialog";
import { type ComponentDef } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { CHART } from "@/lib/chartTheme";
import { toneChip, type Tone } from "@/lib/tones";
import { api } from "@/lib/api";
import { useDesignStore } from "@/store/useDesignStore";
import { ecFromCapacitance, ejFromIc, f01 as f01Calc, anharmonicity } from "@/lib/quantum";
import { cn } from "@/lib/utils";

/** Parameter spec from the backend catalog (unit / range / typical / group). */
interface ParamSpec {
  unit: string;
  min: number;
  max: number;
  typical: number;
  group: string;
}

const QUBIT_PHYS_KINDS = new Set(["transmon", "squid", "fluxonium"]);

/** Live qubit properties computed instantly client-side (mirrors backend physics).
 *  Prefers the extracted geometry (CΣ + Ic); falls back to the design targets. */
function qubitPhysics(
  kind: string,
  params: Record<string, number | string>,
): { f01: number; anh: number; ecMHz: number; ej: number; ejec: number } | null {
  if (!QUBIT_PHYS_KINDS.has(kind)) return null;
  const n = (keys: string[]): number | null => {
    for (const k of keys) {
      const v = params[k];
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };
  let ec: number | null = null;
  let ej: number | null = null;
  const cs = n(["c_sigma_fF"]);
  const ic = n(["ic_nA"]);
  if (cs != null && ic != null) {
    ec = ecFromCapacitance(cs);
    ej = ejFromIc(ic);
  } else {
    const tf = n(["target_freq_GHz", "frequency_GHz"]);
    if (tf == null) return null;
    const ta = n(["anharmonicity_MHz"]) ?? -300;
    ec = Math.max(Math.abs(ta) / 1000, 1e-3);
    ej = (tf + ec) ** 2 / (8 * ec);
  }
  if (ec == null || ej == null || ec <= 0) return null;
  return {
    f01: f01Calc(ej, ec),
    anh: anharmonicity(ec),
    ecMHz: ec * 1000,
    ej,
    ejec: ej / ec,
  };
}

const nodeTypes = { quantum: QuantumNode };

const kindIcon: Record<string, typeof Cpu> = {
  transmon: Cpu,
  fluxonium: Atom,
  resonator: Radio,
  coupler: Link2,
  feedline: Minus,
  launchpad: CircleDot,
  "flux-line": Zap,
  junction: Activity,
  squid: Spline,
  airbridge: Cable,
  tsv: Layers,
  ground: Grid3x3,
  "purcell-filter": Radio,
  "parametric-amplifier": Zap,
};

const miniColor: Record<string, string> = {
  primary: "rgb(200 128 58)",
  cyan: "rgb(224 178 85)",
  violet: "rgb(180 124 240)",
  success: "rgb(64 192 138)",
  warning: "rgb(240 138 60)",
};

function mk(
  id: string,
  def: ComponentDef,
  x: number,
  y: number,
  label?: string,
): Node {
  return {
    id,
    type: "quantum",
    position: { x, y },
    data: {
      label: label ?? def.name,
      kind: def.kind,
      color: def.color,
      params: { ...def.defaults },
    } as QuantumNodeData,
  };
}

function buildInitial(COMPONENT_LIBRARY: ComponentDef[]): { nodes: Node[]; edges: Edge[] } {
  const byId = (id: string) => COMPONENT_LIBRARY.find((c) => c.id === id)!;
  const nodes: Node[] = [
    mk("q1", byId("xmon"), 80, 120, "Q1 · Xmon"),
    mk("q2", byId("xmon"), 80, 360, "Q2 · Xmon"),
    mk("cpl", byId("capacitive-coupler"), 340, 240, "Coupler C1"),
    mk("r1", byId("readout-resonator"), 600, 120, "Readout R1"),
    mk("r2", byId("readout-resonator"), 600, 360, "Readout R2"),
    mk("feed", byId("feedline"), 860, 240, "Feedline"),
  ];
  const edge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    animated: true,
    style: { stroke: CHART.cyan, strokeWidth: 1.75 },
  });
  const edges: Edge[] = [
    edge("e1", "q1", "cpl"),
    edge("e2", "q2", "cpl"),
    edge("e3", "q1", "r1"),
    edge("e4", "q2", "r2"),
    edge("e5", "r1", "feed"),
    edge("e6", "r2", "feed"),
  ];
  return { nodes, edges };
}

const cyanEdge = (id: string, source: string, target: string): Edge => ({
  id, source, target, type: "smoothstep", animated: true,
  style: { stroke: CHART.cyan, strokeWidth: 1.75 },
});

/** Starter layouts offered on a blank canvas — a quantum engineer rarely starts
 *  from a single bare pad; these are the canonical building blocks. */
const TEMPLATES: {
  id: string; name: string; hint: string;
  build: (lib: ComponentDef[]) => { nodes: Node[]; edges: Edge[] };
}[] = [
  {
    id: "single", name: "Transmon + readout", hint: "One qubit, readout resonator & feedline",
    build: (lib) => {
      const byId = (id: string) => lib.find((c) => c.id === id);
      const xmon = byId("xmon"); const res = byId("readout-resonator"); const feed = byId("feedline");
      if (!xmon || !res || !feed) return { nodes: [], edges: [] };
      const nodes = [
        mk("q1", xmon, 120, 200, "Q1 · Xmon"),
        mk("r1", res, 440, 200, "Readout R1"),
        mk("feed", feed, 760, 200, "Feedline"),
      ];
      return { nodes, edges: [cyanEdge("e1", "q1", "r1"), cyanEdge("e2", "r1", "feed")] };
    },
  },
  {
    id: "pair", name: "2-qubit + coupler", hint: "Two qubits, a coupler & individual readouts",
    build: (lib) => buildInitial(lib),
  },
  {
    id: "ring", name: "4-qubit ring", hint: "Four transmons in a ring with couplers",
    build: (lib) => {
      const byId = (id: string) => lib.find((c) => c.id === id);
      const xmon = byId("xmon"); const cpl = byId("capacitive-coupler");
      if (!xmon || !cpl) return { nodes: [], edges: [] };
      const pos = [[200, 120], [520, 120], [520, 440], [200, 440]];
      const nodes: Node[] = pos.map(([x, y], i) => mk(`q${i + 1}`, xmon, x, y, `Q${i + 1} · Xmon`));
      const cplPos = [[360, 120], [520, 280], [360, 440], [200, 280]];
      cplPos.forEach(([x, y], i) => nodes.push(mk(`c${i + 1}`, cpl, x, y, `Coupler C${i + 1}`)));
      const edges: Edge[] = [];
      for (let i = 0; i < 4; i++) {
        const a = `q${i + 1}`; const b = `q${((i + 1) % 4) + 1}`; const c = `c${i + 1}`;
        edges.push(cyanEdge(`e${i}a`, a, c), cyanEdge(`e${i}b`, c, b));
      }
      return { nodes, edges };
    },
  },
];

/* ----- Canvas → self-contained runnable Python (mirrors backend codegen) -----
   The "Code" button emits a script that runs with only NumPy installed
   (`python design.py`) and prints real simulation output — no Qiskit Metal,
   no Ansys Q3D/HFSS, no GUI. Physics mirrors backend/app/physics.py. This is
   the client-side fallback used only when the FastAPI /codegen call fails. */
const QUBIT_KINDS = new Set(["transmon", "squid"]);
const RES_KINDS = new Set(["resonator", "feedline", "purcell-filter"]);

function pyName(label: string, id: string) {
  return (
    label.replace(/[^A-Za-z0-9]/g, "_").replace(/^_+|_+$/g, "") ||
    id.replace(/[^A-Za-z0-9]/g, "_").replace(/^_+|_+$/g, "") ||
    "c"
  );
}

function numParam(params: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const k of keys) {
    if (!(k in params)) continue;
    const v = params[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const direct = Number(v);
      if (Number.isFinite(direct)) return direct;
      const nums = v.match(/-?\d+\.?\d*/g);
      if (nums && nums.length >= 2) return (Number(nums[0]) + Number(nums[1])) / 2;
      if (nums && nums.length === 1) return Number(nums[0]);
    }
  }
  return fallback;
}

const PHYS_BLOCK = `import numpy as np


# --- Physics (Koch 2007 transmon; Krantz 2019 cQED) -------------------------
def transmon_levels(ej, ec, ng=0.0, ncut=31, levels=3):
    """Exact transmon spectrum by charge-basis diagonalization:
    H = 4*EC*(n - ng)^2 - EJ*cos(phi). Returns lowest \`levels\` energies [GHz]."""
    n = np.arange(-ncut, ncut + 1)
    H = np.diag(4.0 * ec * (n - ng) ** 2)
    off = -0.5 * ej * np.ones(len(n) - 1)
    H += np.diag(off, 1) + np.diag(off, -1)
    ev = np.sort(np.linalg.eigvalsh(H))
    return ev[:levels] - ev[0]


def f01_anharm(ej, ec):
    """Exact (f01 [GHz], anharmonicity [MHz]) from the spectrum."""
    lv = transmon_levels(ej, ec, levels=3)
    f01 = lv[1] - lv[0]
    anh = ((lv[2] - lv[1]) - f01) * 1000.0
    return f01, anh


def design_for_target(f01_ghz, anharm_mhz):
    """Invert design targets -> (EJ, EC) [GHz]. EC = |alpha|, EJ from f01."""
    ec = max(abs(anharm_mhz) / 1000.0, 1e-3)
    f = max(f01_ghz, 0.01)
    ej = (f + ec) ** 2 / (8.0 * ec)
    return ej, ec


def coupling_g(fq, fr, cg_ff=8.0, cq_ff=70.0, cr_ff=120.0):
    """Jaynes-Cummings coupling g [MHz] from a capacitive divider (Krantz 2019)."""
    beta = cg_ff / np.sqrt(cq_ff * cr_ff)
    return 0.5 * beta * np.sqrt(max(fq * fr, 0.0)) * 1000.0


def dispersive_shift(g_mhz, fq, fr, anh_mhz):
    """Dispersive cross-Kerr shift chi [MHz] = g^2 * a / (D * (D + a)) (Koch 2007)."""
    delta = (fq - fr) * 1000.0
    if abs(delta) < 1e-6 or abs(delta + anh_mhz) < 1e-6:
        return 0.0
    return (g_mhz ** 2 / delta) * (anh_mhz / (delta + anh_mhz))
`;

const MAIN_BLOCK = `

# --- Solve ------------------------------------------------------------------
def main():
    print("QRIVARA design simulation")
    print("=" * 68)
    solved = {}
    for q in QUBITS:
        ej, ec = design_for_target(q["target_f01_GHz"], q["anharm_MHz"])
        f01, anh = f01_anharm(ej, ec)
        solved[q["name"]] = {"f01": f01, "anh": anh, "ej": ej, "ec": ec}
        print("[qubit] {:>10}: EJ={:7.2f} GHz  EC={:6.3f} GHz  EJ/EC={:6.1f}"
              "  ->  f01={:6.3f} GHz  alpha={:7.1f} MHz"
              .format(q["name"], ej, ec, ej / ec, f01, anh))
    for r in RESONATORS:
        print("[reson] {:>10}: f_r={:6.3f} GHz  kappa~{:.2f} MHz"
              .format(r["name"], r["freq_GHz"], r["kappa_MHz"]))
    for qn, rn in COUPLINGS:
        q = solved.get(qn)
        r = next((x for x in RESONATORS if x["name"] == rn), None)
        if not q or not r:
            continue
        g = coupling_g(q["f01"], r["freq_GHz"])
        chi = dispersive_shift(g, q["f01"], r["freq_GHz"], q["anh"])
        print("[disp ] {:>10}: g={:6.2f} MHz  chi={:7.3f} MHz  2chi(split)={:7.3f} MHz"
              .format(qn + "<->" + rn, g, chi, 2.0 * chi))
    print("=" * 68)
    print("{} qubit(s), {} resonator(s), {} readout coupling(s)"
          .format(len(QUBITS), len(RESONATORS), len(COUPLINGS)))


if __name__ == "__main__":
    main()
`;

function generateMetalCode(nodes: Node[], edges: Edge[]): string {
  const idToName = new Map<string, string>();
  const idToRole = new Map<string, string>();
  const seen = new Set<string>();
  const unique = (name: string) => {
    let out = name;
    let i = 1;
    while (seen.has(out)) {
      i += 1;
      out = `${name}_${i}`;
    }
    seen.add(out);
    return out;
  };

  const qubits: { name: string; f01: number; anh: number }[] = [];
  const resonators: { name: string; freq: number; kappa: number }[] = [];
  const skipped: { name: string; kind: string }[] = [];

  nodes.forEach((n) => {
    const d = n.data as QuantumNodeData;
    const params = (d.params ?? {}) as Record<string, unknown>;
    const name = unique(pyName(d.label, n.id));
    idToName.set(n.id, name);
    if (QUBIT_KINDS.has(d.kind)) {
      qubits.push({
        name,
        f01: round4(numParam(params, ["target_freq_GHz", "frequency_GHz"], 5.2)),
        anh: round2(numParam(params, ["anharmonicity_MHz", "anharm_MHz"], -310)),
      });
      idToRole.set(n.id, "qubit");
    } else if (RES_KINDS.has(d.kind)) {
      resonators.push({
        name,
        freq: round4(numParam(params, ["frequency_GHz", "target_freq_GHz", "center_freq_GHz"], 7.1)),
        kappa: round3(numParam(params, ["coupling_MHz", "bandwidth_MHz"], 1.2)),
      });
      idToRole.set(n.id, "resonator");
    } else {
      idToRole.set(n.id, "other");
      skipped.push({ name, kind: d.kind || "?" });
    }
  });

  const couplings: [string, string][] = [];
  edges.forEach((e) => {
    const rs = idToRole.get(e.source);
    const rt = idToRole.get(e.target);
    if (rs === "qubit" && rt === "resonator")
      couplings.push([idToName.get(e.source)!, idToName.get(e.target)!]);
    else if (rs === "resonator" && rt === "qubit")
      couplings.push([idToName.get(e.target)!, idToName.get(e.source)!]);
  });

  const pyList = (items: string[]) =>
    items.length ? `[\n${items.map((s) => `    ${s},`).join("\n")}\n]` : "[]";

  const qubitsSrc = pyList(
    qubits.map((q) => `{"name": "${q.name}", "target_f01_GHz": ${q.f01}, "anharm_MHz": ${q.anh}}`),
  );
  const resSrc = pyList(
    resonators.map((r) => `{"name": "${r.name}", "freq_GHz": ${r.freq}, "kappa_MHz": ${r.kappa}}`),
  );
  const cplSrc = pyList(couplings.map(([a, b]) => `("${a}", "${b}")`));

  let skipNote = "";
  if (skipped.length) {
    const items = skipped.slice(0, 12).map((s) => `${s.name} (${s.kind})`).join(", ");
    skipNote =
      "\n# Non-transmon / structural components captured in the layout but not\n" +
      "# diagonalized by this script (need the full server-side solver):\n" +
      `#   ${items}\n`;
  }

  const header =
    `"""Auto-generated by the QRIVARA Visual Designer (${nodes.length} components).\n\n` +
    "Self-contained: requires only NumPy (pip install numpy).\n" +
    "Run it:  python design.py\n" +
    '"""\n';
  const designBlock =
    "\n\n# --- Design (from the Visual Designer canvas) ---------------------------\n" +
    `QUBITS = ${qubitsSrc}\n\n` +
    `RESONATORS = ${resSrc}\n\n` +
    "# (qubit, resonator) readout pairs from the design connectivity\n" +
    `COUPLINGS = ${cplSrc}\n` +
    skipNote;
  return header + PHYS_BLOCK + designBlock + MAIN_BLOCK;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const round3 = (x: number) => Math.round(x * 1e3) / 1e3;
const round2 = (x: number) => Math.round(x * 1e2) / 1e2;

type LogLine = { k: "prompt" | "info" | "ok" | "warn"; t: string };

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One parameter row in the Inspector. With a backend spec it shows the unit, a
 *  correctly-ranged slider (handles negatives like anharmonicity), a one-tap reset
 *  to the typical value, and an out-of-range warning — the affordances a hardware
 *  engineer expects. Without a spec it degrades to a plain, safe numeric input. */
function ParamControl({ name, value, spec, onChange }: {
  name: string;
  value: number | string;
  spec?: ParamSpec;
  onChange: (v: number | string) => void;
}) {
  const isNum = typeof value === "number";
  const label = name.replace(/_/g, " ");
  const num = isNum ? (value as number) : NaN;
  const out = isNum && spec && (num < spec.min || num > spec.max);
  const showReset = isNum && spec && Math.abs(num - spec.typical) > 1e-9;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium capitalize text-fg-muted">
          {label}
          {spec?.unit && <span className="ml-1 normal-case text-fg-subtle">({spec.unit})</span>}
        </label>
        {showReset && (
          <Tooltip content={`Reset to typical (${spec!.typical} ${spec!.unit})`}>
            <button
              type="button"
              onClick={() => onChange(spec!.typical)}
              className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-3xs font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <RotateCcw className="h-2.5 w-2.5" /> typ
            </button>
          </Tooltip>
        )}
      </div>
      <Input
        value={String(value)}
        className={cn("mt-1 h-8 text-xs tabular-nums", out && "border-warning/60")}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(e.target.value === "" || isNaN(n) ? e.target.value : n);
        }}
      />
      {isNum && spec && (
        <>
          <div className="mt-1.5">
            <Slider
              value={clampNum(num, spec.min, spec.max)}
              min={spec.min}
              max={spec.max}
              step={Math.max((spec.max - spec.min) / 100, 1e-4)}
              onChange={(v) => onChange(Number(v.toFixed(3)))}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-3xs tabular-nums text-fg-subtle">
            <span>{spec.min}</span>
            <span>typ {spec.typical}</span>
            <span>{spec.max}</span>
          </div>
          {out && (
            <p className="mt-0.5 text-3xs text-warning">Outside the typical range — check fabricability.</p>
          )}
        </>
      )}
    </div>
  );
}

function DesignerCanvas() {
  const storeComps = useDataStore((s) => s.components);
  const storeProjects = useDataStore((s) => s.projects);
  const fetchProjects = useDataStore((s) => s.fetchProjects);
  const COMPONENT_LIBRARY = useMemo(() => [...(storeComps?.built_in || []), ...(storeComps?.custom || [])], [storeComps]);
  // Backend parameter catalog: unit / range / typical / group per parameter — drives
  // the Inspector's units, slider ranges and recommended values.
  const paramSpecs = useMemo(
    () => (storeComps?.parameter_specs ?? {}) as Record<string, ParamSpec>,
    [storeComps],
  );
  
  // A fresh "New Design" (?new=1) opens a clean canvas; otherwise show the demo layout.
  const [searchParams] = useSearchParams();
  const designId = searchParams.get("id");
  const projectId = searchParams.get("projectId");
  const isNew = searchParams.get("new") === "1";
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Undo / redo — debounced full-graph snapshots so rapid drags coalesce into one
  // history step. `applying` suppresses recording our own restore.
  const histPast = useRef<string[]>([]);
  const histFuture = useRef<string[]>([]);
  const histApplying = useRef(false);
  const histBaseline = useRef<string | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(!!(designId || projectId));
  const [activeDesignId, setActiveDesignId] = useState<string | null>(designId);
  // Resolved project id for sharing — from the URL, or from the loaded design.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectId);
  const [shareOpen, setShareOpen] = useState(false);

  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const data = await api.getComments();
      setComments(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function handleAddComment() {
    if (!newCommentText.trim() || !selectedId) return;
    try {
      const newComment = await api.addComment({
        target: selectedId,
        body: newCommentText.trim(),
      });
      setComments((prev) => [newComment, ...prev]);
      setNewCommentText("");
    } catch {
      /* ignore */
    }
  }

  async function handleResolveComment(commentId: string) {
    try {
      const updated = await api.resolveComment(commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, resolved: updated.resolved } : c))
      );
    } catch {
      /* ignore */
    }
  }

  // Load design if ID or ProjectID is present
  useEffect(() => {
    async function load() {
      let targetDesignId = activeDesignId;
      
      if (!targetDesignId && projectId) {
        setLoading(true);
        try {
          const designs = await api.getProjectDesigns(projectId);
          if (designs && designs.length > 0) {
            targetDesignId = designs[0].id;
            setActiveDesignId(targetDesignId);
          }
        } catch (err) {
          console.error("Failed to fetch project designs:", err);
        }
      }

      if (targetDesignId) {
        setLoading(true);
        api.getDesign(targetDesignId)
          .then((d) => {
            if (d.project_id) setActiveProjectId(d.project_id);
            if (d.doc) {
              setNodes(d.doc.nodes || []);
              setEdges(d.doc.edges || []);
              setVersion(d.version);
            }
          })
          .catch(console.error)
          .finally(() => setLoading(false));
      } else if (isNew) {
        setNodes([]);
        setEdges([]);
        setLoading(false);
      } else {
        const initial = buildInitial(COMPONENT_LIBRARY);
        setNodes(initial.nodes);
        setEdges(initial.edges);
        setLoading(false);
      }
    }
    load();
  }, [activeDesignId, projectId, isNew, COMPONENT_LIBRARY, setNodes, setEdges]);

  // Auto-save. Tracks a real save status (dirty → saving → saved) so the toolbar
  // can show it honestly, and exposes saveNow() for the Cmd/Ctrl+S shortcut.
  const lastSavedRef = useRef(JSON.stringify({ nodes, edges }));
  const saveNow = useCallback(async () => {
    if (!activeDesignId) return;
    const current = JSON.stringify({ nodes, edges });
    if (current === lastSavedRef.current) { setSaveState("saved"); return; }
    setSaveState("saving");
    try {
      const res = await api.saveDesign(activeDesignId, version, { nodes, edges });
      setVersion(res.version);
      lastSavedRef.current = current;
      setSaveState("saved");
    } catch (err) {
      console.error("Save failed:", err);
      setSaveState("dirty");
    }
  }, [activeDesignId, nodes, edges, version]);

  useEffect(() => {
    if (!activeDesignId || loading) return;
    if (JSON.stringify({ nodes, edges }) === lastSavedRef.current) return;
    setSaveState("dirty");
    const timer = setTimeout(saveNow, 3000);
    return () => clearTimeout(timer);
  }, [nodes, edges, activeDesignId, loading, saveNow]);

  // Publish the canvas to the shared store so the 3D View mirrors it.
  const publishGraph = useDesignStore((s) => s.setGraph);
  useEffect(() => {
    publishGraph(nodes, edges);
  }, [nodes, edges, publishGraph]);
  const [selectedId, setSelectedId] = useState<string | null>("q1");
  // Inspector starts CLOSED for a roomy canvas; opens when a component is clicked.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const idRef = useRef(100);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const navigate = useNavigate();
  const [codeOpen, setCodeOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone] = useState(false);
  const [copied, setCopied] = useState(false);
  // UX state: snap-to-grid for clean layouts, shortcut help, and a real save status.
  const [snap, setSnap] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "local">(
    designId || projectId ? "saved" : "local",
  );
  const clipboard = useRef<Node[] | null>(null);

  const generatedCode = useMemo(() => generateMetalCode(nodes, edges), [nodes, edges]);
  const pushLog = (k: LogLine["k"], t: string) => setLogs((l) => [...l, { k, t }]);

  const [liveGeneratedCode, setLiveGeneratedCode] = useState("");

  const handleGenerate = async () => {
    setOutputOpen(true);
    setCodeOpen(true);
    pushLog("info", `Requesting codegen from FastAPI...`);
    try {
      const res = await api.generateCode({ nodes, edges });
      setLiveGeneratedCode(res.code);
      pushLog("info", `Generated ${nodes.length} components → ${res.filename}`);
    } catch (err: any) {
      pushLog("info", `Codegen error: ${err.message}. Falling back to client-side...`);
      setLiveGeneratedCode(generateMetalCode(nodes, edges));
    }
  };
  const openInStudio = () => {
    try {
      sessionStorage.setItem("qrivara:generated", liveGeneratedCode || generatedCode);
    } catch {
      /* ignore */
    }
    setCodeOpen(false);
    navigate("/app/code");
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(liveGeneratedCode || generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const runSim = async () => {
    setOutputOpen(true);
    setSimRunning(true);
    setSimDone(false);
    pushLog("prompt", ">>> initializing simulation job...");
    
    try {
      if (!activeDesignId) throw new Error("No saved design yet — save the design first (it needs a project).");
      pushLog("info", "running error-budget analysis on the backend...");
      const res = await api.runSimulation(activeDesignId, "design_errors", "qrivara_fem", { ej: 14.5, ec: 0.24, tunable: true });
      pushLog("info", `job ${res.id} · ${res.status}`);
      if (res.status === "done" && res.result) {
        const d = res.result;
        pushLog("ok", `✓ total gate error ≈ ${d.total != null ? (d.total * 1e3).toFixed(2) + " ×10⁻³" : "N/A"}`);
        for (const k of ["tls", "flux", "leakage", "prep", "parity"]) {
          if (d[k] != null) pushLog("info", `  ${k}: ${(d[k] * 1e3).toFixed(2)} ×10⁻³`);
        }
        pushLog("ok", "Open the Simulation page for the full analysis suite.");
      } else {
        pushLog("warn", `job did not complete (${res.status})${res.error ? ": " + res.error : ""}`);
      }
    } catch (err: any) {
      pushLog("warn", `Simulation failed: ${err.message}`);
    } finally {
      setSimRunning(false);
      setSimDone(true);
    }
  };

  const runDrc = async () => {
    setOutputOpen(true);
    pushLog("prompt", ">>> running Design Rule Check (DRC)...");
    try {
      if (!activeDesignId) throw new Error("No active design");
      const res = await api.runSimulation(activeDesignId, "validation", "drc", {});
      if (res.status === "done") {
        const d = res.result;
        pushLog("info", `Checks: ${d.passed}/${d.total} passed`);
        if (d.drc_warnings && d.drc_warnings.length > 0) {
          d.drc_warnings.forEach((w: string) => pushLog("warn", `WARN: ${w}`));
        } else {
          pushLog("ok", "✓ DRC Passed. Ready for GDS export.");
        }
      }
    } catch (err: any) {
      pushLog("warn", `DRC failed to run: ${err.message}`);
    }
  };

  const exportGds = async () => {
    setOutputOpen(true);
    pushLog("prompt", ">>> exporting layout to GDSII format...");
    try {
      if (!activeDesignId) throw new Error("No saved design — save it first.");
      // use the auth-aware export helper (raw fetch would drop the access header)
      await api.downloadDesignExport(activeDesignId, "gds");
      pushLog("ok", "✓ GDSII layout exported.");
    } catch (err: any) {
      pushLog("warn", `Export failed: ${err.message}`);
    }
  };

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...c, type: "smoothstep", animated: true, style: { stroke: CHART.cyan, strokeWidth: 1.75 } },
          eds,
        ),
      ),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/qrivara");
      if (!raw) return;
      const def = JSON.parse(raw) as ComponentDef;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n${idRef.current++}`;
      setNodes((nds) => nds.concat(mk(id, def, position.x, position.y)));
      setSelectedId(id);
      setInspectorOpen(true); // newly dropped component → open its params
    },
    [screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // Real design name for the toolbar status (no more hardcoded "Falcon-17").
  const designName = useMemo(() => {
    const p = storeProjects.find((pp) => pp.id === activeProjectId);
    return p?.name || (activeDesignId ? "Untitled design" : "Untitled · local draft");
  }, [storeProjects, activeProjectId, activeDesignId]);

  const updateParam = (key: string, value: number | string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? { ...n, data: { ...n.data, params: { ...(n.data as QuantumNodeData).params, [key]: value } } }
          : n,
      ),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  // Duplicate the selected component (Cmd/Ctrl+D) — offset, fresh id, auto-selected.
  const duplicateSelected = () => {
    const src = nodes.find((n) => n.id === selectedId);
    if (!src) return;
    const id = `n${idRef.current++}`;
    const clone: Node = {
      ...src, id, selected: false,
      position: { x: src.position.x + 40, y: src.position.y + 40 },
      data: JSON.parse(JSON.stringify(src.data)),
    };
    setNodes((nds) => nds.concat(clone));
    setSelectedId(id);
    setInspectorOpen(true);
  };

  const copySelected = () => {
    const src = nodes.find((n) => n.id === selectedId);
    if (src) clipboard.current = [JSON.parse(JSON.stringify(src))];
  };

  const pasteClipboard = () => {
    const buf = clipboard.current;
    if (!buf || !buf.length) return;
    const fresh = buf.map((n) => {
      const id = `n${idRef.current++}`;
      return { ...n, id, selected: false,
        position: { x: n.position.x + 48, y: n.position.y + 48 },
        data: JSON.parse(JSON.stringify(n.data)) } as Node;
    });
    setNodes((nds) => nds.concat(fresh));
    setSelectedId(fresh[fresh.length - 1].id);
    setInspectorOpen(true);
  };

  // Arrow-key nudge of the selected node (Shift = 1 px fine, else snap step).
  const nudgeSelected = (dx: number, dy: number) => {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) =>
      n.id === selectedId
        ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
        : n));
  };

  const applyTemplate = (build: (lib: ComponentDef[]) => { nodes: Node[]; edges: Edge[] }) => {
    const t = build(COMPONENT_LIBRARY);
    setNodes(t.nodes);
    setEdges(t.edges);
    setSelectedId(null);
    fitView({ duration: 400 });
  };

  // record graph snapshots into the undo stack (debounced; skips our own restore)
  useEffect(() => {
    const cur = JSON.stringify({ nodes, edges });
    if (histApplying.current) { histApplying.current = false; histBaseline.current = cur; return; }
    if (histBaseline.current === null) { histBaseline.current = cur; return; }
    if (cur === histBaseline.current) return;
    const prev = histBaseline.current;
    const t = setTimeout(() => {
      histPast.current.push(prev);
      if (histPast.current.length > 50) histPast.current.shift();
      histFuture.current = [];
      histBaseline.current = cur;
      setHistTick((v) => v + 1);
    }, 400);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  // reset history when a different design loads
  useEffect(() => {
    histPast.current = []; histFuture.current = []; histBaseline.current = null;
    setHistTick((v) => v + 1);
  }, [activeDesignId]);

  const undo = () => {
    if (!histPast.current.length) { pushLog("info", "Nothing to undo"); return; }
    histFuture.current.push(JSON.stringify({ nodes, edges }));
    const s = JSON.parse(histPast.current.pop()!);
    histApplying.current = true;
    setNodes(s.nodes || []); setEdges(s.edges || []);
    setSelectedId(null); setHistTick((v) => v + 1);
    pushLog("info", "Undo");
  };
  const redo = () => {
    if (!histFuture.current.length) { pushLog("info", "Nothing to redo"); return; }
    histPast.current.push(JSON.stringify({ nodes, edges }));
    const s = JSON.parse(histFuture.current.pop()!);
    histApplying.current = true;
    setNodes(s.nodes || []); setEdges(s.edges || []);
    setSelectedId(null); setHistTick((v) => v + 1);
    pushLog("info", "Redo");
  };

  // Keyboard shortcuts — the biggest productivity multiplier for a power user.
  // A ref-to-latest-handler keeps a single listener while always seeing current
  // state, and we never fire while the user is typing in an input/textarea.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "?" && !typing) { e.preventDefault(); setShortcutsOpen((o) => !o); return; }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === "y") { e.preventDefault(); redo(); return; }
    if (mod && k === "d") { e.preventDefault(); duplicateSelected(); return; }
    if (mod && k === "s") { e.preventDefault(); saveNow(); return; }
    if (mod && k === "c") { copySelected(); return; }
    if (mod && k === "v") { e.preventDefault(); pasteClipboard(); return; }
    if (mod) return;                                   // leave other Cmd/Ctrl combos to the browser
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
    if (e.key === "Escape") { setSelectedId(null); setShortcutsOpen(false); return; }
    if (k === "f") { fitView({ duration: 400 }); return; }
    if (e.key.startsWith("Arrow") && selectedId) {
      e.preventDefault();
      const step = e.shiftKey ? 1 : (snap ? 16 : 8);
      const d: Record<string, [number, number]> = {
        ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      };
      const mv = d[e.key];
      if (mv) nudgeSelected(mv[0], mv[1]);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = COMPONENT_LIBRARY.filter((c) =>
      c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
    const map = new Map<string, ComponentDef[]>();
    filtered.forEach((c) => {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    });
    return [...map.entries()];
  }, [search]);

  const selData = selected?.data as QuantumNodeData | undefined;

  return (
    <div className="flex h-full">
      {/* Palette */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface/50 md:flex">
        <div className="border-b border-line p-3">
          <h3 className="mb-2 px-1 font-display text-sm font-semibold">Components</h3>
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <p className="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                {cat}
              </p>
              <div className="space-y-1.5">
                {items.map((c) => {
                  const Icon = kindIcon[c.kind] ?? Cpu;
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/qrivara", JSON.stringify(c));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex cursor-grab items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5 transition-all hover:border-line-strong hover:bg-surface-3 active:cursor-grabbing"
                    >
                      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", toneChip[c.color as Tone])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-fg">{c.name}</p>
                        <p className="truncate text-2xs text-fg-subtle">{c.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas + output console */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => { setSelectedId(n.id); setInspectorOpen(true); }}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.1}
            maxZoom={4}
            snapToGrid={snap}
            snapGrid={[16, 16]}
            deleteKeyCode={null}  // we handle Delete/Backspace ourselves (also clears connected edges)
            zoomOnScroll         // two-finger scroll/wheel = ZOOM (reliable on every trackpad — no pinch detection needed)
            zoomOnPinch          // pinch also zooms where the OS reports it
            zoomOnDoubleClick    // double-click to zoom in
            panOnDrag            // pan by click-dragging the empty canvas
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="rgb(var(--border))" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => miniColor[(n.data as QuantumNodeData).color] ?? miniColor.primary}
              maskColor="rgb(var(--bg-deep) / 0.6)"
            />
          </ReactFlow>

          {/* Quick-start templates — a blank canvas is intimidating; offer the
              canonical building blocks. Wrapper is click-through so palette drops
              still land on the canvas; only the card captures clicks. */}
          {!loading && nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-surface/95 p-6 shadow-pop">
                <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <LayoutGrid className="h-4 w-4 text-primary" /> Start your chip
                </div>
                <p className="mt-1 text-xs text-fg-subtle">
                  Drag components from the left, or start from a template:
                </p>
                <div className="mt-4 grid gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t.build)}
                      className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
                    >
                      <div>
                        <p className="text-sm font-medium text-fg">{t.name}</p>
                        <p className="text-2xs text-fg-subtle">{t.hint}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-3xs text-fg-subtle">
                  Tip: press <kbd className="rounded border border-line bg-surface-2 px-1 font-mono">?</kbd> any time for keyboard shortcuts.
                </p>
              </div>
            </div>
          )}

          {/* Floating toolbar */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line p-1.5 shadow-pop">
              <Tooltip content={
                saveState === "saving" ? "Saving…" :
                saveState === "dirty" ? "Unsaved changes — autosaves shortly (⌘S to save now)" :
                saveState === "local" ? "Local draft — open from a project to save to the cloud" :
                "All changes saved"
              }>
                <div className="flex items-center gap-2 px-2">
                  <StatusDot
                    tone={saveState === "saved" ? "success" : saveState === "saving" ? "cyan" : saveState === "dirty" ? "warning" : "neutral"}
                    pulse={saveState === "saving"}
                  />
                  <span className="hidden max-w-[140px] truncate text-xs font-medium text-fg sm:inline">
                    {designName}
                    <span className="ml-1.5 font-normal text-fg-subtle">
                      {saveState === "saving" ? "saving…" : saveState === "dirty" ? "unsaved" : saveState === "local" ? "draft" : "saved"}
                    </span>
                  </span>
                </div>
              </Tooltip>
              <div className="h-5 w-px bg-line" />
              <Tooltip content="Undo (⌘Z)"><IconButton size="sm" onClick={undo} disabled={histPast.current.length === 0}><Undo2 className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Redo (⌘⇧Z)"><IconButton size="sm" onClick={redo} disabled={histFuture.current.length === 0}><Redo2 className="h-4 w-4" /></IconButton></Tooltip>
              <div className="h-5 w-px bg-line" />
              <Tooltip content="Duplicate (⌘D)"><span><IconButton size="sm" onClick={duplicateSelected} disabled={!selectedId}><CopyPlus className="h-4 w-4" /></IconButton></span></Tooltip>
              <Tooltip content={snap ? "Snap to grid: on" : "Snap to grid: off"}><IconButton size="sm" active={snap} onClick={() => setSnap((v) => !v)}><Magnet className="h-4 w-4" /></IconButton></Tooltip>
              <div className="h-5 w-px bg-line" />
              <Tooltip content="Zoom in"><IconButton size="sm" onClick={() => zoomIn()}><ZoomIn className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Zoom out"><IconButton size="sm" onClick={() => zoomOut()}><ZoomOut className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Fit view (F)"><IconButton size="sm" onClick={() => fitView({ duration: 400 })}><Maximize2 className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Keyboard shortcuts (?)"><IconButton size="sm" onClick={() => setShortcutsOpen(true)}><Keyboard className="h-4 w-4" /></IconButton></Tooltip>
            </div>

            <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line p-1.5 pl-3 shadow-pop">
              <Tooltip content="Output console">
                <IconButton size="sm" active={outputOpen} onClick={() => setOutputOpen((o) => !o)}>
                  <TerminalSquare className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip content={inspectorOpen ? "Hide parameters" : "Show parameters"}>
                <IconButton size="sm" active={inspectorOpen} onClick={() => setInspectorOpen((o) => !o)}>
                  <PanelRight className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip content={activeProjectId ? "Share project" : "Open a project to share"}>
                <span>
                  <IconButton size="sm" disabled={!activeProjectId} onClick={() => setShareOpen(true)} aria-label="Share">
                    <Share2 className="h-4 w-4" />
                  </IconButton>
                </span>
              </Tooltip>
              <div className="h-5 w-px bg-line" />
              <Button size="sm" variant="ghost" icon={<Activity className="h-4 w-4" />} onClick={runDrc}>
                DRC
              </Button>
              <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={exportGds}>
                GDS
              </Button>
              <Button size="sm" variant="outline" loading={simRunning} icon={<Play className="h-4 w-4" />} onClick={runSim}>
                Simulate
              </Button>
              <Button size="sm" icon={<Code2 className="h-4 w-4" />} onClick={handleGenerate}>
                Code
              </Button>
            </div>
          </div>
        </div>

        {/* Output console */}
        {outputOpen && (
          <div className="flex h-44 shrink-0 flex-col border-t border-line bg-bg-deep/40">
            <div className="flex h-9 items-center gap-3 border-b border-line px-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <TerminalSquare className="h-3.5 w-3.5 text-cyan" /> Output
              </div>
              {simRunning && (
                <span className="flex items-center gap-1.5 text-2xs text-cyan">
                  <StatusDot tone="cyan" pulse /> running…
                </span>
              )}
              {simDone && !simRunning && (
                <button
                  onClick={() => navigate("/app/simulation")}
                  className="flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                >
                  View results <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
              <div className="ml-auto flex items-center gap-1">
                <IconButton size="sm" onClick={() => setLogs([])} aria-label="Clear">
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton size="sm" onClick={() => setOutputOpen(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-fg-subtle">Run a simulation or generate code to see output…</p>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.k === "prompt" ? "text-primary"
                        : l.k === "ok" ? "text-success"
                        : l.k === "warn" ? "text-warning"
                        : "text-fg-muted"
                    }
                  >
                    {l.t}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inspector — collapsed by default; opens on component click, closes via the X
          or the toolbar toggle, so the canvas stays roomy. */}
      {inspectorOpen && (
      <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface/50 lg:flex">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <h3 className="font-display text-sm font-semibold">Inspector</h3>
          <Tooltip content="Close">
            <IconButton size="sm" onClick={() => setInspectorOpen(false)} aria-label="Close inspector">
              <X className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        </div>
        {!selData ? (
          <div className="p-4">
            <EmptyState
              icon={<MousePointer2 className="h-5 w-5" />}
              title="No selection"
              description="Select a component on the canvas to edit its parameters, or drag a new one from the library."
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <h4 className="font-display text-base font-semibold">{selData.label}</h4>
            </div>
            <div className="mt-1.5">
              <Badge tone={selData.color as any}>{selData.kind}</Badge>
            </div>

            {(() => {
              const phys = qubitPhysics(selData.kind, selData.params);
              if (!phys) return null;
              const cards = [
                { l: "f₀₁", v: phys.f01.toFixed(4), u: "GHz" },
                { l: "α (anharm)", v: phys.anh.toFixed(1), u: "MHz" },
                { l: "E_C", v: phys.ecMHz.toFixed(1), u: "MHz" },
                { l: "E_J / E_C", v: phys.ejec.toFixed(1), u: "" },
              ];
              return (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-primary">
                    <Gauge className="h-3.5 w-3.5" /> Live properties
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {cards.map((m) => (
                      <div key={m.l} className="rounded-lg bg-surface/70 px-2.5 py-1.5">
                        <p className="text-3xs text-fg-subtle">{m.l}</p>
                        <p className="font-mono text-sm font-semibold tabular-nums text-fg">
                          {m.v}
                          {m.u && <span className="ml-0.5 text-2xs font-normal text-fg-subtle">{m.u}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-3xs leading-relaxed text-fg-subtle">
                    Instant estimate from this component's parameters — updates as you tune. Run a Simulation for the exact charge-basis solve.
                  </p>
                </div>
              );
            })()}

            <div className="mt-5 space-y-5">
              {(() => {
                const groups = new Map<string, [string, number | string][]>();
                for (const [k, v] of Object.entries(selData.params)) {
                  const g = paramSpecs[k]?.group ?? "general";
                  if (!groups.has(g)) groups.set(g, []);
                  groups.get(g)!.push([k, v as number | string]);
                }
                return [...groups.entries()].map(([group, items]) => (
                  <div key={group}>
                    <p className="pb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                      {group}
                    </p>
                    <div className="space-y-3.5">
                      {items.map(([key, value]) => (
                        <ParamControl
                          key={key}
                          name={key}
                          value={value}
                          spec={paramSpecs[key]}
                          onChange={(v) => updateParam(key, v)}
                        />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Derived
              </p>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Node ID</span>
                  <span className="font-mono text-fg">{selected?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Connections</span>
                  <span className="font-mono text-fg">
                    {edges.filter((e) => e.source === selected?.id || e.target === selected?.id).length}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Discussion
              </p>
              {loadingComments ? (
                <p className="mt-2 text-2xs text-fg-subtle">Loading comments…</p>
              ) : (
                <div className="mt-2.5 space-y-2.5">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ask a question or comment…"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" onClick={handleAddComment} disabled={!newCommentText.trim()}>
                      Send
                    </Button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {comments.filter((c) => c.target === selected?.id).length === 0 ? (
                      <p className="text-2xs text-fg-subtle italic">No comments yet. Start the discussion!</p>
                    ) : (
                      comments
                        .filter((c) => c.target === selected?.id)
                        .map((c) => (
                          <div
                            key={c.id}
                            className={cn(
                              "rounded-xl border border-line bg-surface-2 p-2 text-xs",
                              c.resolved && "opacity-60 bg-surface/30"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-semibold text-fg">{c.author}</span>
                              <button
                                onClick={() => handleResolveComment(c.id)}
                                className={cn(
                                  "text-2xs font-medium hover:underline",
                                  c.resolved ? "text-fg-subtle" : "text-primary"
                                )}
                              >
                                {c.resolved ? "Resolved" : "Resolve"}
                              </button>
                            </div>
                            <p className="mt-1 text-fg-muted leading-relaxed">{c.body}</p>
                            <span className="mt-1 block text-3xs text-fg-subtle text-right">
                              {new Date(c.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="danger"
              className="mt-5 w-full"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={deleteSelected}
            >
              Delete component
            </Button>
          </div>
        )}
      </aside>
      )}

      {/* Generated code preview */}
      <Modal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Generated Python — runnable (design.py)"
        description={`${nodes.length} components · ${edges.length} connections · pip install numpy, then python design.py`}
        size="xl"
        footer={
          <>
            <Button variant="ghost" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copyCode}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button icon={<Code2 className="h-4 w-4" />} onClick={openInStudio}>
              Open in Code Studio
            </Button>
          </>
        }
      >
        <pre className="max-h-[55vh] overflow-auto rounded-xl border border-line bg-bg-deep/60 p-4 font-mono text-xs leading-relaxed text-fg-muted">
          {liveGeneratedCode || generatedCode}
        </pre>
      </Modal>

      {/* Keyboard shortcuts help */}
      <Modal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard shortcuts"
        description="Design faster — most actions have a shortcut."
        size="md"
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            ["Undo", "⌘ / Ctrl + Z"],
            ["Redo", "⌘ / Ctrl + ⇧ + Z"],
            ["Duplicate component", "⌘ / Ctrl + D"],
            ["Copy", "⌘ / Ctrl + C"],
            ["Paste", "⌘ / Ctrl + V"],
            ["Save now", "⌘ / Ctrl + S"],
            ["Delete selected", "Delete / Backspace"],
            ["Nudge (⇧ = 1 px)", "Arrow keys"],
            ["Fit view", "F"],
            ["Deselect", "Esc"],
            ["This help", "?"],
          ].map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-line/50 py-1.5 last:border-0">
              <span className="text-sm text-fg-muted">{label}</span>
              <kbd className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-2xs text-fg">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </Modal>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        projectId={activeProjectId}
        projectName={
          storeProjects.find((p) => p.id === activeProjectId)?.name ?? "this project"
        }
        onChanged={() => fetchProjects()}
      />
    </div>
  );
}

export default function Designer() {
  return (
    <ReactFlowProvider>
      <DesignerCanvas />
    </ReactFlowProvider>
  );
}
