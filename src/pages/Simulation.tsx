import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Zap,
  RotateCw,
  LineChart as LineIcon,
  Table as TableIcon,
  Play,
  ArrowUpRight,
  Download,
  Info,
  Cpu,
  Copy,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  AreaChart,
  Area,
  Legend,
  ReferenceLine,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { Select, Field, Input } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

type Tab = "validation" | "frequency" | "eigenmode" | "eigenmode_fullwave" | "capacitance" | "field_solver" | "lom" | "circuit_graph" | "coupling" | "crosstalk" | "hamiltonian" | "sweep" | "mesh" | "epr" | "scattering" | "kinetic_inductance" | "feedback" | "gate_fidelity" | "two_qubit_gate" | "frequency_collisions" | "decoherence" | "flux_spectrum" | "coupled_spectrum" | "readout" | "qec" | "packaging" | "surface_participation" | "qubit_family" | "cryogenic" | "control_electronics" | "calibration" | "knowledge_graph";

const TABS: { value: Tab; label: string }[] = [
  { value: "validation", label: "Validation" },
  { value: "frequency", label: "Readout S21" },
  { value: "eigenmode", label: "Eigenmode" },
  { value: "eigenmode_fullwave", label: "Eigenmode (Full-Wave)" },
  { value: "capacitance", label: "Capacitance" },
  { value: "field_solver", label: "Field Solver" },
  { value: "lom", label: "LOM" },
  { value: "circuit_graph", label: "Circuit Graph" },
  { value: "knowledge_graph", label: "Knowledge Graph" },
  { value: "coupling", label: "Coupling" },
  { value: "crosstalk", label: "Crosstalk" },
  { value: "hamiltonian", label: "Hamiltonian" },
  { value: "flux_spectrum", label: "Flux Spectroscopy" },
  { value: "coupled_spectrum", label: "Coupled Spectrum (Exact)" },
  { value: "qubit_family", label: "Qubit Zoo" },
  { value: "epr", label: "EPR" },
  { value: "decoherence", label: "Decoherence (T1/T2)" },
  { value: "surface_participation", label: "Surface Participation → T1" },
  { value: "gate_fidelity", label: "Gate Fidelity" },
  { value: "two_qubit_gate", label: "2Q Gate (Time-Domain)" },
  { value: "frequency_collisions", label: "Freq. Collisions / Yield" },
  { value: "control_electronics", label: "Control Electronics" },
  { value: "readout", label: "Readout Fidelity" }, // distinct from "Readout S21" (the S-param sweep)
  { value: "qec", label: "Error Correction" },
  { value: "packaging", label: "Packaging / Box Modes" },
  { value: "scattering", label: "Scattering" },
  { value: "kinetic_inductance", label: "Kinetic L" },
  { value: "sweep", label: "Sweep" },
  { value: "mesh", label: "Mesh" },
  { value: "feedback", label: "Feedback" },
  { value: "cryogenic", label: "Cryogenic Line" },
  { value: "calibration", label: "Auto-Calibration" },
];

// Group the 18 analyses into intuitive categories (the SC design-loop order) so
// the navigation is a 5-pill category bar + a short per-category tab row — no
// horizontal overflow, and related analyses sit together.
const TAB_BY_VALUE: Record<Tab, { value: Tab; label: string }> = Object.fromEntries(
  TABS.map((t) => [t.value, t]),
) as Record<Tab, { value: Tab; label: string }>;

const GROUPS: { label: string; hint: string; tabs: Tab[] }[] = [
  { label: "Layout", hint: "Geometry, field & extraction", tabs: ["validation", "capacitance", "field_solver", "circuit_graph", "knowledge_graph", "mesh"] },
  { label: "Modes & RF", hint: "EM modes & scattering", tabs: ["eigenmode", "eigenmode_fullwave", "frequency", "scattering", "kinetic_inductance"] },
  { label: "Quantum", hint: "Hamiltonian, coupling & flux", tabs: ["lom", "hamiltonian", "epr", "coupling", "flux_spectrum", "coupled_spectrum", "qubit_family"] },
  { label: "Performance", hint: "Coherence, gates, QEC & yield", tabs: ["decoherence", "surface_participation", "gate_fidelity", "two_qubit_gate", "frequency_collisions", "readout", "qec", "crosstalk", "packaging", "control_electronics"] },
  { label: "Tools", hint: "Sweeps, feedback, cryo & calibration", tabs: ["sweep", "feedback", "cryogenic", "calibration"] },
];

// Dev guard: every analysis must live in exactly one group, or it becomes
// unreachable from the nav (the activeCategory fallback would hide the omission).
if (import.meta.env.DEV) {
  const grouped = GROUPS.flatMap((g) => g.tabs);
  const missing = TABS.map((t) => t.value).filter((v) => !grouped.includes(v));
  if (missing.length) console.warn("[Simulation] ungrouped analysis tabs:", missing);
}

export default function Simulation() {
  const { projects, fetchProjects } = useDataStore();
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<Tab>("frequency");
  const [solver, setSolver] = useState("qrivara_fem");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [params, setParams] = useState<any>({
    resonator_freq_GHz: 7.1,
    kappa_MHz: 1.2,
    qubit: "transmon",
    parameter: "c_sigma_fF",
    start: 60,
    stop: 100,
    steps: 14,
    quality: "medium",
    material: "Aluminum",
    length_um: 1000,
    width_um: 10,
    thickness_nm: 20,
    gate: "cz",
    g_MHz: 12,
    drive_MHz: 50,
    topology: "heavy_hex",
    n_qubits: 18,
    sigma_MHz: 15,
    family: "fluxonium",
  });
  const [formats, setFormats] = useState<any>(null);
  const [families, setFamilies] = useState<any[]>([]);
  // Qiskit Target export ("digital twin") modal state.
  const [qtOpen, setQtOpen] = useState(false);
  const [qtData, setQtData] = useState<any>(null);
  const [qtLoading, setQtLoading] = useState(false);
  // Monotonic run token: a poll that resolves after a newer run started (or
  // after the user switched tabs) is ignored, so results never land on the
  // wrong tab. Now that runs are async (submit + poll) this race is reachable.
  const runSeq = useRef(0);

  useEffect(() => {
    fetchProjects();
    api.getExportFormats().then(setFormats).catch(console.error);
    api.getQubitFamilies().then((d: any) => setFamilies(d?.families || [])).catch(console.error);
  }, [fetchProjects]);

  const project = projects.find((p: any) => p.id === projectId);

  const run = async () => {
    if (!projectId) return;
    const seq = ++runSeq.current;          // claim this as the latest run
    const requestedTab = tab;
    setRunning(true);
    setRes(null);
    setJobId(null);
    try {
      // Find design ID for project
      const designs = await api.getProjectDesigns(projectId);
      const dId = designs?.[0]?.id;
      if (!dId) throw new Error("No design found for project");

      // Submit (202, queued) then poll until the background worker finishes —
      // non-blocking on the server side (api.runSimulation polls internally).
      const job = await api.runSimulation(dId, requestedTab, solver, params);
      if (seq !== runSeq.current) return;   // a newer run superseded this one
      setJobId(job.id);
      if (job.status === "done") {
        setRes(job.result);
      } else {
        setRes(null);
        console.error(`Simulation ${job.status}:`, job.error);
      }
    } catch (err) {
      if (seq === runSeq.current) console.error(err);
    } finally {
      if (seq === runSeq.current) setRunning(false);
    }
  };

  const handleExportResult = (fmt: string) => {
    if (jobId) api.downloadSimulationExport(jobId, fmt);
  };

  const handleExportDesign = async (fmt: string) => {
    if (!projectId) return;
    try {
      // Design export routes need the DESIGN id, not the project id — resolve it.
      const designs = await api.getProjectDesigns(projectId);
      const dId = designs?.[0]?.id;
      if (dId) api.downloadDesignExport(dId, fmt);
    } catch (err) {
      console.error(err);
    }
  };

  // Export the chip as a Qiskit Target ("digital twin") — resolves the project's
  // design, fetches the descriptor, and opens the modal.
  const openQiskitTarget = async () => {
    if (!projectId) return;
    setQtOpen(true);
    setQtLoading(true);
    setQtData(null);
    try {
      const designs = await api.getProjectDesigns(projectId);
      const dId = designs?.[0]?.id;
      if (!dId) throw new Error("No design found for this project");
      setQtData(await api.getQiskitTarget(dId));
    } catch (e: any) {
      setQtData({ error: e?.message || "Failed to build the Qiskit Target" });
    } finally {
      setQtLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation Engine"
        subtitle="Layout, modes, quantum, performance & error-correction analyses — live."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48">
              <option value="">Select project…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select value={solver} onChange={(e) => setSolver(e.target.value)} className="w-48">
              <option value="qrivara_fem">QRIVARA FEM (3-D field solver)</option>
              <option value="analytic">QRIVARA analytic / circuit model</option>
              <option value="palace" disabled>AWS Palace (full-wave) — coming soon</option>
            </Select>
            {formats?.design && (
              <div className="flex gap-1">
                {Object.keys(formats.design).map(f => (
                  <Button key={f} size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => handleExportDesign(f)} disabled={!projectId}>
                    {f.toUpperCase()}
                  </Button>
                ))}
              </div>
            )}
            <Button variant="outline" icon={<Cpu className="h-4 w-4" />} onClick={openQiskitTarget} disabled={!projectId}>
              Qiskit
            </Button>
            <Button icon={<RotateCw className="h-4 w-4" />} loading={running} onClick={run} disabled={!projectId}>
              Run
            </Button>
          </>
        }
      />

      {/* Two-tier analysis nav: category pills (tier 1) + per-category tabs (tier 2).
          Switching tabs invalidates any in-flight run so a stale result can't land
          on the new tab (the run is async + polled). */}
      {(() => {
        const selectTab = (v: Tab) => {
          runSeq.current++;
          setRes(null);
          setTab(v);
        };
        const activeCategory = GROUPS.find((g) => g.tabs.includes(tab)) ?? GROUPS[0];
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Analysis category">
              {GROUPS.map((g) => {
                const active = g.label === activeCategory.label;
                return (
                  <button
                    key={g.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={g.hint}
                    onClick={() => { if (!g.tabs.includes(tab)) selectTab(g.tabs[0]); }}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                        : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            <Tabs
              value={tab}
              onChange={(v) => selectTab(v as Tab)}
              items={activeCategory.tabs.map((v) => TAB_BY_VALUE[v])}
            />
          </div>
        );
      })()}

      {/* Per-tab parameter controls */}
      <ParamBar tab={tab} params={params} setParams={setParams} onRun={run} running={running} families={families} />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          {!res ? (
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title={running ? "Simulation in progress…" : "No results yet"}
              description={running ? "The solver is processing your design on the backend." : "Select a project and click 'Run' to start the simulation."}
            />
          ) : (
            <div className="space-y-6">
              {res.method && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                  <Info className="h-3.5 w-3.5" />
                  Method: {res.method}
                </div>
              )}
              {/* FEM coverage — never silently drop qubits past the solver cap */}
              {res.truncated && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {res.coverage_note ||
                      `Showing ${res.qubits_simulated} of ${res.qubits_total} qubits (FEM solver cap).`}
                  </span>
                </div>
              )}
              {res.truncated === false && res.qubits_total > 0 && (
                <p className="px-1 text-2xs text-fg-subtle">
                  Simulated all {res.qubits_total} qubit{res.qubits_total === 1 ? "" : "s"} in the layout.
                </p>
              )}
              {/* Result Views */}
              {tab === "validation" && <ValidationView res={res} />}
              {tab === "frequency" && <FrequencyView res={res} />}
              {tab === "eigenmode" && <EigenmodeView res={res} />}
              {tab === "eigenmode_fullwave" && <EigenmodeView res={res} />}
              {tab === "capacitance" && <CapacitanceView res={res} />}
              {tab === "field_solver" && <FieldSolverView res={res} />}
              {tab === "lom" && <LOMView res={res} />}
              {tab === "circuit_graph" && <CircuitGraphView res={res} />}
              {tab === "coupling" && <CouplingView res={res} />}
              {tab === "crosstalk" && <CrosstalkView res={res} />}
              {tab === "hamiltonian" && <HamiltonianView res={res} />}
              {tab === "flux_spectrum" && <FluxSpectrumView res={res} />}
              {tab === "coupled_spectrum" && <CoupledSpectrumView res={res} />}
              {tab === "qubit_family" && <QubitFamilyView res={res} />}
              {tab === "cryogenic" && <CryogenicView res={res} />}
              {tab === "control_electronics" && <ControlView res={res} />}
              {tab === "calibration" && <CalibrationView res={res} />}
              {tab === "knowledge_graph" && <KnowledgeGraphView res={res} />}
              {tab === "epr" && <EPRView res={res} />}
              {tab === "decoherence" && <DecoherenceView res={res} />}
              {tab === "gate_fidelity" && <GateFidelityView res={res} />}
              {tab === "two_qubit_gate" && <TwoQubitGateView res={res} />}
              {tab === "frequency_collisions" && <FrequencyCollisionView res={res} />}
              {tab === "readout" && <ReadoutView res={res} />}
              {tab === "qec" && <QecView res={res} />}
              {tab === "packaging" && <PackagingView res={res} />}
              {tab === "surface_participation" && <SurfaceParticipationView res={res} />}
              {tab === "scattering" && <ScatteringView res={res} />}
              {tab === "kinetic_inductance" && <KineticLView res={res} />}
              {tab === "sweep" && <SweepView res={res} />}
              {tab === "mesh" && <MeshView res={res} />}
              {tab === "feedback" && <FeedbackView res={res} />}

              {/* Export Result */}
              {jobId && formats?.result && (
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-fg">Export simulation data</p>
                      <p className="text-xs text-fg-subtle">Download raw results and reports.</p>
                    </div>
                    <div className="flex gap-2">
                      {Object.keys(formats.result).map(f => (
                        <Button key={f} size="sm" variant="outline" onClick={() => handleExportResult(f)}>
                          {f.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <QiskitTargetModal open={qtOpen} onClose={() => setQtOpen(false)} data={qtData} loading={qtLoading} />
    </div>
  );
}

/** Python to rebuild a live qiskit Target from the exported descriptor — runnable as-is. */
function qiskitSnippet(d: any): string {
  const fname = `${d.design_id || "qrivara"}_qiskit_target.json`;
  return `# QRIVARA -> Qiskit: a digital twin of the chip you designed.
# pip install qiskit            (qiskit-aer optional, for noisy simulation)
import json
from qiskit.transpiler import Target, InstructionProperties
from qiskit.providers import QubitProperties
from qiskit.circuit import Parameter, Measure
from qiskit.circuit.library import RZGate, SXGate, XGate, CXGate, CZGate, iSwapGate

d = json.load(open("${fname}"))
GATES = {"rz": RZGate(Parameter("theta")), "sx": SXGate(), "x": XGate(),
         "cx": CXGate(), "cz": CZGate(), "iswap": iSwapGate(), "measure": Measure()}

qprops = [QubitProperties(frequency=q["frequency_GHz"] * 1e9,
                          t1=q["T1_us"] * 1e-6, t2=q["T2_us"] * 1e-6) for q in d["qubits"]]
target = Target(num_qubits=d["num_qubits"], qubit_properties=qprops, dt=2.2222e-9)
for name in d["basis_gates"]:
    props = {tuple(i["qargs"]): InstructionProperties(duration=i["duration_s"], error=i["error"])
             for i in d["instructions"] if i["gate"] == name}
    target.add_instruction(GATES[name], props)

# Transpile any circuit onto YOUR chip's topology, gates and error rates:
from qiskit import QuantumCircuit, transpile
qc = QuantumCircuit(d["num_qubits"]); qc.h(0)
if d["num_qubits"] > 1: qc.cx(0, 1)
qc.measure_all()
print(transpile(qc, target=target))`;
}

function QiskitTargetModal({ open, onClose, data, loading }: {
  open: boolean; onClose: () => void; data: any; loading: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const ok = data && !data.error;
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked — ignore */ }
  };
  const download = () => {
    if (!ok) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.design_id || "qrivara"}_qiskit_target.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Export to Qiskit — chip digital twin"
      description="Transpile and simulate circuits against the chip you designed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant="outline"
            icon={copied === "json" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            onClick={() => copy(JSON.stringify(data, null, 2), "json")}
            disabled={!ok}
          >
            Copy JSON
          </Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={download} disabled={!ok}>
            Download target.json
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-fg-subtle">
          Assembling the Qiskit Target from your simulation results…
        </div>
      ) : !data ? null : data.error ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {data.error}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{data.num_qubits} qubits</Badge>
            <Badge tone="cyan">2Q gate: {data.two_qubit_gate}</Badge>
            <Badge tone="violet">basis: {(data.basis_gates || []).join(", ")}</Badge>
            <Badge tone={data.qiskit_installed ? "success" : "warning"}>
              {data.qiskit_installed ? "qiskit available on server" : "descriptor is portable (no qiskit needed)"}
            </Badge>
          </div>
          <p className="text-2xs text-fg-subtle">
            Assembled from: {(data.simulation_types_used || []).join(" · ") || "live Hamiltonian solve"}
          </p>

          <div>
            <div className="mb-2 text-sm font-semibold">Qubit properties</div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-fg-subtle">
                    <th className="p-1.5 text-left">Q</th>
                    <th className="p-1.5 text-right">f₀₁ (GHz)</th>
                    <th className="p-1.5 text-right">α (MHz)</th>
                    <th className="p-1.5 text-right">T₁ (µs)</th>
                    <th className="p-1.5 text-right">T₂ (µs)</th>
                    <th className="p-1.5 text-right">RO error</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.qubits || []).map((q: any) => (
                    <tr key={q.index} className="border-t border-line">
                      <td className="p-1.5 font-mono">{q.index}</td>
                      <td className="p-1.5 text-right font-mono">{num(q.frequency_GHz).toFixed(4)}</td>
                      <td className="p-1.5 text-right font-mono">{num(q.anharmonicity_MHz).toFixed(1)}</td>
                      <td className="p-1.5 text-right font-mono">{num(q.T1_us).toFixed(1)}</td>
                      <td className="p-1.5 text-right font-mono">{num(q.T2_us).toFixed(1)}</td>
                      <td className="p-1.5 text-right font-mono">{num(q.readout_error).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs">
            <span className="font-semibold">Coupling map: </span>
            <span className="font-mono text-fg-muted">{JSON.stringify(data.coupling_map)}</span>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Load it in Qiskit</div>
              <Button
                size="sm"
                variant="ghost"
                icon={copied === "py" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={() => copy(qiskitSnippet(data), "py")}
              >
                Copy
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-bg-deep/60 p-3 text-2xs leading-relaxed text-fg-muted">
              {qiskitSnippet(data)}
            </pre>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ParamBar({ tab, params, setParams, onRun, running, families }: any) {
  const set = (k: string, v: any) => setParams({ ...params, [k]: v });
  const fam = (families || []).find((f: any) => f.id === (params.family ?? "fluxonium"));
  return (
    <Card inset>
      <CardContent className="flex flex-wrap items-center gap-6 py-3">
        {tab === "calibration" && (
          <Mini label="Ramsey detuning (MHz)"><Input value={params.detuning_MHz ?? 0.5} onChange={(e) => set("detuning_MHz", Number(e.target.value))} /></Mini>
        )}
        {tab === "control_electronics" && (
          <>
            <Mini label="AWG rate (GSa/s)"><Input value={params.sample_rate_GSps ?? 2.4} onChange={(e) => set("sample_rate_GSps", Number(e.target.value))} /></Mini>
            <Mini label="DAC bits"><Input value={params.dac_bits ?? 14} onChange={(e) => set("dac_bits", Number(e.target.value))} /></Mini>
            <Mini label="Pulse σ (ns)"><Input value={params.sigma_ns ?? 10} onChange={(e) => set("sigma_ns", Number(e.target.value))} /></Mini>
            <Mini label="IQ phase err (°)"><Input value={params.iq_phase_deg ?? 1.0} onChange={(e) => set("iq_phase_deg", Number(e.target.value))} /></Mini>
            <Mini label="DRAG">
              <Select value={params.drag === false ? "off" : "on"} onChange={(e) => set("drag", e.target.value === "on")}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </Select>
            </Mini>
          </>
        )}
        {tab === "cryogenic" && (
          <>
            <Mini label="Drive f (GHz)"><Input value={params.f_GHz ?? 5.0} onChange={(e) => set("f_GHz", Number(e.target.value))} /></Mini>
            <Mini label="Input power (dBm)"><Input value={params.input_power_dBm ?? -20} onChange={(e) => set("input_power_dBm", Number(e.target.value))} /></Mini>
            <Mini label="MXC atten (dB)"><Input value={params.mxc_attenuation_dB ?? 20} onChange={(e) => set("mxc_attenuation_dB", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "qubit_family" && (
          <>
            <Mini label="Family">
              <Select
                value={params.family ?? "fluxonium"}
                onChange={(e) => setParams({
                  ...params, family: e.target.value,
                  EJ: undefined, EC: undefined, EL: undefined, flux: undefined,
                  EJmax: undefined, d: undefined, E_osc: undefined, K: undefined,
                })}
              >
                {(families || []).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.label}{f.supported ? "" : " (concept)"}</option>
                ))}
              </Select>
            </Mini>
            {fam?.tunable && fam?.supported && (
              <Mini label="Flux Φ/Φ₀"><Input value={params.flux ?? (fam.params?.flux ?? 0.5)} onChange={(e) => set("flux", Number(e.target.value))} /></Mini>
            )}
            {fam?.supported && fam?.params?.EJ != null && (
              <Mini label="EJ (GHz)"><Input value={params.EJ ?? fam.params.EJ} onChange={(e) => set("EJ", Number(e.target.value))} /></Mini>
            )}
            {fam?.supported && fam?.params?.EC != null && (
              <Mini label="EC (GHz)"><Input value={params.EC ?? fam.params.EC} onChange={(e) => set("EC", Number(e.target.value))} /></Mini>
            )}
          </>
        )}
        {tab === "frequency" && (
          <Mini label="Res freq (GHz)"><Input value={params.resonator_freq_GHz} onChange={(e) => set("resonator_freq_GHz", Number(e.target.value))} /></Mini>
        )}
        {tab === "kinetic_inductance" && (
          <>
            <Mini label="Material">
              <Select value={params.material} onChange={(e) => set("material", e.target.value)}>
                <option value="Aluminum">Aluminum</option>
                <option value="Niobium">Niobium</option>
                <option value="TiN">TiN (High Lk)</option>
              </Select>
            </Mini>
            <Mini label="Thickness (nm)"><Input value={params.thickness_nm} onChange={(e) => set("thickness_nm", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "sweep" && (
          <>
            <Mini label="Param">
              <Select value={params.parameter} onChange={(e) => set("parameter", e.target.value)}>
                <option value="c_sigma_fF">Qubit Cap (fF)</option>
                <option value="cg_fF">Coupling Cap (fF)</option>
              </Select>
            </Mini>
            <Mini label="Start"><Input value={params.start} onChange={(e) => set("start", Number(e.target.value))} /></Mini>
            <Mini label="Stop"><Input value={params.stop} onChange={(e) => set("stop", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "feedback" && (
          <>
            <Mini label="Measured f₀₁ (GHz)"><Input value={params.measured_f01_GHz ?? ""} onChange={(e) => set("measured_f01_GHz", e.target.value === "" ? undefined : Number(e.target.value))} /></Mini>
            <Mini label="Measured T₁ (µs)"><Input value={params.measured_T1_us ?? ""} onChange={(e) => set("measured_T1_us", e.target.value === "" ? undefined : Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "gate_fidelity" && (
          <>
            <Mini label="1Q gate (ns)"><Input value={params.t_gate_1q_ns ?? 20} onChange={(e) => set("t_gate_1q_ns", Number(e.target.value))} /></Mini>
            <Mini label="2Q gate (ns)"><Input value={params.t_gate_2q_ns ?? 200} onChange={(e) => set("t_gate_2q_ns", Number(e.target.value))} /></Mini>
            <Mini label="Residual ZZ (kHz)"><Input value={params.zz_kHz ?? 20} onChange={(e) => set("zz_kHz", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "decoherence" && (
          <>
            <Mini label="f₀₁ (GHz)"><Input value={params.f01_GHz ?? 5.0} onChange={(e) => set("f01_GHz", Number(e.target.value))} /></Mini>
            <Mini label="κ (MHz)"><Input value={params.kappa_MHz ?? 1.2} onChange={(e) => set("kappa_MHz", Number(e.target.value))} /></Mini>
            <Mini label="Tunable (flux)">
              <Select value={params.tunable ? "yes" : "no"} onChange={(e) => set("tunable", e.target.value === "yes")}>
                <option value="no">Fixed</option>
                <option value="yes">Tunable</option>
              </Select>
            </Mini>
          </>
        )}
        {tab === "flux_spectrum" && (
          <Mini label="Junction asym. d"><Input value={params.junction_asymmetry ?? 0.1} onChange={(e) => set("junction_asymmetry", Number(e.target.value))} /></Mini>
        )}
        {tab === "field_solver" && (
          <>
            <Mini label="Substrate εr">
              <Select value={params.eps_substrate ?? 11.7} onChange={(e) => set("eps_substrate", Number(e.target.value))}>
                <option value={11.7}>Silicon (11.7)</option>
                <option value={9.8}>Sapphire (9.8)</option>
                <option value={3.8}>Quartz (3.8)</option>
                <option value={1}>Vacuum (1.0)</option>
              </Select>
            </Mini>
            <Mini label="Grid nodes"><Input value={params.max_nodes ?? 120000} onChange={(e) => set("max_nodes", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "surface_participation" && (
          <Mini label="Substrate εr">
            <Select value={params.eps_substrate ?? 11.7} onChange={(e) => set("eps_substrate", Number(e.target.value))}>
              <option value={11.7}>Silicon (11.7)</option>
              <option value={9.8}>Sapphire (9.8)</option>
              <option value={3.8}>Quartz (3.8)</option>
            </Select>
          </Mini>
        )}
        {tab === "two_qubit_gate" && (
          <>
            <Mini label="Gate">
              <Select value={params.gate ?? "cz"} onChange={(e) => set("gate", e.target.value)}>
                <option value="cz">CZ (controlled-phase)</option>
                <option value="iswap">iSWAP</option>
                <option value="cr">Cross-Resonance</option>
              </Select>
            </Mini>
            <Mini label="Coupling g (MHz)"><Input value={params.g_MHz ?? 12} onChange={(e) => set("g_MHz", Number(e.target.value))} /></Mini>
            {params.gate === "cr" && (
              <Mini label="CR drive (MHz)"><Input value={params.drive_MHz ?? 50} onChange={(e) => set("drive_MHz", Number(e.target.value))} /></Mini>
            )}
          </>
        )}
        {tab === "frequency_collisions" && (
          <>
            <Mini label="Topology">
              <Select value={params.topology ?? "heavy_hex"} onChange={(e) => set("topology", e.target.value)}>
                <option value="heavy_hex">Heavy-hex (CR)</option>
                <option value="grid">Square grid</option>
                <option value="chain">Linear chain</option>
                <option value="auto">From layout</option>
              </Select>
            </Mini>
            <Mini label="Qubits"><Input value={params.n_qubits ?? 18} onChange={(e) => set("n_qubits", Number(e.target.value))} /></Mini>
            <Mini label="Fab σ (MHz)"><Input value={params.sigma_MHz ?? 15} onChange={(e) => set("sigma_MHz", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "readout" && (
          <>
            <Mini label="Photons n̄"><Input value={params.n_bar ?? 5} onChange={(e) => set("n_bar", Number(e.target.value))} /></Mini>
            <Mini label="Integration (ns)"><Input value={params.t_int_ns ?? 500} onChange={(e) => set("t_int_ns", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "packaging" && (
          <>
            <Mini label="Box a (mm)"><Input value={params.box_a_mm ?? ""} placeholder="auto" onChange={(e) => set("box_a_mm", e.target.value === "" ? undefined : Number(e.target.value))} /></Mini>
            <Mini label="Box b (mm)"><Input value={params.box_b_mm ?? ""} placeholder="auto" onChange={(e) => set("box_b_mm", e.target.value === "" ? undefined : Number(e.target.value))} /></Mini>
            <Mini label="Lid d (mm)"><Input value={params.box_d_mm ?? 4} onChange={(e) => set("box_d_mm", Number(e.target.value))} /></Mini>
            <Mini label="Collision ± (MHz)"><Input value={params.collision_margin_MHz ?? 200} onChange={(e) => set("collision_margin_MHz", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "qec" && (
          <>
            <Mini label="Target logical err">
              <Select value={params.target_pL ?? 1e-6} onChange={(e) => set("target_pL", Number(e.target.value))}>
                <option value={1e-3}>1e-3</option>
                <option value={1e-6}>1e-6</option>
                <option value={1e-9}>1e-9</option>
                <option value={1e-12}>1e-12</option>
              </Select>
            </Mini>
            <Mini label="Threshold p_th"><Input value={params.p_threshold ?? 0.01} onChange={(e) => set("p_threshold", Number(e.target.value))} /></Mini>
          </>
        )}
        <Button size="sm" variant="outline" icon={<Play className="h-3.5 w-3.5" />} loading={running} onClick={onRun} className="ml-auto">
          Re-run
        </Button>
      </CardContent>
    </Card>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return <Field label={label} className="w-32">{children}</Field>;
}

/* --------------------------------- Views ---------------------------------- */
// Shown when the active tab's result hasn't arrived yet (or `res` belongs to a
// different analysis after a tab switch) — prevents `.map`/`.toFixed` crashes.
function NoData() {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-8 text-center text-sm text-fg-subtle">
      No data for this analysis yet — click <span className="font-medium text-fg">Re-run</span>.
    </div>
  );
}
const num = (v: any, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const sci = (v: any) => (typeof v === "number" && isFinite(v) ? v.toExponential(2) : "—");

function ValidationView({ res }: { res: any }) {
  if (!Array.isArray(res?.checks)) return <NoData />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(res.checks || []).map((c: any) => (
        <Card key={c.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-fg-subtle uppercase">{c.name}</p>
              <StatusDot tone={c.passed ? "success" : "error"} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-fg">{c.count}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FrequencyView({ res }: { res: any }) {
  if (!Array.isArray(res?.s21_curve)) return <NoData />;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={res.s21_curve}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="freq" {...axisProps} unit=" GHz" />
              <YAxis {...axisProps} unit=" dB" />
              <RTooltip content={<ChartTooltip unit="dB" />} />
              <Line type="monotone" dataKey="s21" stroke={CHART.primary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <MetricCard label="Resonance" value={res.resonance_GHz ?? "—"} unit="GHz" tone="primary" />
        <MetricCard label="Q factor" value={(num(res.Qc) / 1000).toFixed(1)} unit="k" tone="cyan" />
        <MetricCard label="Linewidth (κ)" value={res.kappa_MHz ?? "—"} unit="MHz" tone="violet" />
      </div>
    </div>
  );
}

/** Field colormap: φ in [0,1] → blue (cold) through orange (hot). */
function fieldColor(v: number) {
  const p = Math.max(0, Math.min(1, v));
  return `hsl(${220 - 190 * p} 78% ${30 + 42 * p}%)`;
}

function FieldHeatmap({ field }: { field: any }) {
  const z: number[][] = field?.z || [];
  const ny = z.length;
  const nx = ny ? z[0].length : 0;
  if (!nx || !ny) return null;
  return (
    <svg
      viewBox={`0 0 ${nx} ${ny}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="rounded-lg border border-line"
      style={{ maxHeight: 360, background: fieldColor(0) }}
    >
      {z.map((row, j) =>
        row.map((v, i) => (
          <rect key={`${i}-${j}`} x={i} y={j} width={1.02} height={1.02} fill={fieldColor(v)} />
        )),
      )}
    </svg>
  );
}

function FieldSolverView({ res }: { res: any }) {
  if (!res?.field_map || !Array.isArray(res?.maxwell_matrix_fF)) {
    return res?.method ? (
      <div className="rounded-xl border border-line bg-surface-2 p-8 text-center text-sm text-fg-subtle">{res.method}</div>
    ) : <NoData />;
  }
  const labels: string[] = res.labels || [];
  const selfC: number[] = res.self_capacitance_fF || [];
  const err = num(res.convergence_error_pct);
  const xs: number[] = res.field_map.x_um || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={`Self-C (${labels[0] ?? "Q1"})`} value={num(selfC[0]).toFixed(1)} unit="fF" tone="primary" />
        <MetricCard label="ε_eff (field-derived)" value={num(res.eps_eff).toFixed(2)} tone="cyan" />
        <MetricCard label="Grid convergence" value={`±${err.toFixed(1)}`} unit="%" tone={err < 3 ? "success" : err < 8 ? "primary" : "warning"} />
        <MetricCard label="Grid nodes" value={num(res.grid?.nodes).toLocaleString()} tone="violet" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <div className="text-sm font-semibold">
            Solved electrostatic potential <span className="font-normal text-fg-subtle">· {res.field_map.energized} energised to 1 V, ∇·(ε∇φ)=0</span>
          </div>
          <Badge tone="primary">3-D FEM</Badge>
        </div>
        <CardContent className="pt-4">
          <FieldHeatmap field={res.field_map} />
          <div className="mt-2 flex items-center justify-between text-2xs text-fg-subtle">
            <span>chip surface · x {xs.length ? `${xs[0]}…${xs[xs.length - 1]} µm` : ""}</span>
            <span className="flex items-center gap-1.5">
              0&nbsp;V
              <span className="inline-block h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${fieldColor(0)}, ${fieldColor(0.5)}, ${fieldColor(1)})` }} />
              1&nbsp;V
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Maxwell capacitance matrix (fF) <span className="font-normal text-fg-subtle">· from the solved field</span></div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full max-w-lg text-xs font-mono">
            <thead>
              <tr>
                <th className="p-2"></th>
                {labels.map((l) => <th key={l} className="p-2 text-fg-subtle">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {res.maxwell_matrix_fF.map((row: number[], i: number) => (
                <tr key={i}>
                  <td className="p-2 font-semibold text-fg">{labels[i]}</td>
                  {(row || []).map((v: number, j: number) => (
                    <td key={j} className={cn("border border-line p-2 text-center", i === j ? "bg-primary/10 text-primary" : "text-fg-muted")}>
                      {num(v).toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 max-w-2xl text-2xs text-fg-subtle">
            Diagonal = self-capacitance to ground; off-diagonal = −mutual. Solved on an edge-conforming grid
            (pad edges are grid lines → exact areas), so the result is grid-converged to ±{err.toFixed(1)}%.
          </p>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function CapacitanceView({ res }: { res: any }) {
  if (!Array.isArray(res?.labels) || !Array.isArray(res?.maxwell_matrix_fF)) return <NoData />;
  return (
    <Card>
      <CardContent className="pt-6 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
              <th className="p-3">fF</th>
              {res.labels.map((l: string) => <th key={l} className="p-3 font-medium">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {res.maxwell_matrix_fF.map((row: any[], i: number) => (
              <tr key={i} className="border-b border-line/50 last:border-0">
                <td className="p-3 font-semibold text-fg">{res.labels[i]}</td>
                {(row || []).map((v: any, j: number) => (
                  <td key={j} className={cn("p-3 font-mono text-xs", i === j ? "text-primary" : "text-fg-muted")}>
                    {num(v).toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CircuitGraphView({ res }: { res: any }) {
  if (!Array.isArray(res?.branches)) return <NoData />;
  const tone: Record<string, string> = { junction: "text-violet", capacitor: "text-cyan", inductor: "text-primary" };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricCard label="Nodes" value={res.n_nodes} tone="primary" />
        <MetricCard label="Branches" value={res.n_branches} tone="cyan" />
        <MetricCard label="Junctions" value={res.branches.filter((b: any) => b.type === "junction").length} tone="violet" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Branches</div>
        <CardContent className="overflow-auto pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Type</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {res.branches.map((b: any, i: number) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className={cn("p-2 font-medium capitalize", tone[b.type] || "text-fg")}>{b.type}</td>
                  <td className="p-2 font-mono text-xs">{b.from}</td>
                  <td className="p-2 font-mono text-xs">{b.to}</td>
                  <td className="p-2 font-mono text-xs text-fg-muted">
                    {b.type === "junction" ? `EJ ${b.EJ_GHz} GHz · Lj ${b.Lj_nH} nH` : `${b.C_fF} fF`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {res.spice_netlist && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">SPICE netlist</div>
          <CardContent className="pt-3">
            <pre className="overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-2xs text-fg-muted">{res.spice_netlist}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EigenmodeView({ res }: { res: any }) {
  if (!Array.isArray(res?.modes) || !res.modes.length) return <NoData />;
  return (
    <Card>
      <div className="px-5 pt-5 text-sm font-semibold">Coupled normal modes — {res.n_modes} modes (FEM)</div>
      <CardContent className="overflow-auto pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
              <th className="p-2">Mode</th><th className="p-2">f (GHz)</th><th className="p-2">Dominant</th><th className="p-2">Q (internal)</th>
            </tr>
          </thead>
          <tbody>
            {res.modes.map((m: any, i: number) => (
              <tr key={i} className="border-b border-line/50 last:border-0">
                <td className="p-2 font-semibold text-fg">#{m.mode}</td>
                <td className="p-2 font-mono text-xs text-primary">{m.freq_GHz}</td>
                <td className="p-2 font-mono text-xs">{m.dominant}</td>
                <td className="p-2 font-mono text-xs">{num(m.Q) >= 1e6 ? `${(num(m.Q) / 1e6).toFixed(2)}M` : num(m.Q).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LOMView({ res }: { res: any }) {
  if (!Array.isArray(res?.qubits) || !res.qubits.length) return <NoData />;
  return (
    <div className="space-y-5">
      {res.source && (
        <p className="text-xs text-fg-subtle">Capacitance source: <span className="text-fg-muted">{res.source}</span></p>
      )}
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Per-qubit Hamiltonian — from extracted capacitance</div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Qubit</th><th className="p-2">CΣ (fF)</th><th className="p-2">EC (MHz)</th>
                <th className="p-2">EJ (GHz)</th><th className="p-2">EJ/EC</th><th className="p-2">f₀₁ (GHz)</th><th className="p-2">α (MHz)</th>
              </tr>
            </thead>
            <tbody>
              {res.qubits.map((q: any, i: number) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className="p-2 font-semibold text-fg">{q.qubit}</td>
                  <td className="p-2 font-mono text-xs">{q.C_sigma_fF}</td>
                  <td className="p-2 font-mono text-xs">{q.EC_MHz}</td>
                  <td className="p-2 font-mono text-xs">{q.EJ_GHz}</td>
                  <td className="p-2 font-mono text-xs">{q.EJ_EC}</td>
                  <td className="p-2 font-mono text-xs text-primary">{q.f01_GHz}</td>
                  <td className="p-2 font-mono text-xs">{q.anharmonicity_MHz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {Array.isArray(res.couplings) && res.couplings.length > 0 && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Capacitive couplings</div>
          <CardContent className="space-y-1.5 pt-3">
            {res.couplings.map((c: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <span className="font-medium text-fg">{c.pair}</span>
                <span className="font-mono text-xs text-fg-muted">Cg {c.Cg_fF} fF · g {c.g_MHz} MHz</span>
                {c.note && <span className="text-2xs text-warning">{c.note}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CrosstalkView({ res }: { res: any }) {
  if (!Array.isArray(res?.crosstalk_dB)) return <NoData />;
  const labels: string[] = res.labels || [];
  const tone = (db: number, i: number, j: number) =>
    i === j ? "text-fg-subtle" : db > -20 ? "text-error" : db > -35 ? "text-warning" : "text-success";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Worst crosstalk" value={res.worst_dB} unit="dB" tone={num(res.worst_dB) > -30 ? "danger" : "success"} />
        <MetricCard label="Worst pair" value={res.worst_pair || "—"} tone="neutral" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Crosstalk matrix (dB) — drive on column leaks to row</div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr>
                <th className="p-2"></th>
                {labels.map((l) => <th key={l} className="p-2 text-fg-subtle">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {res.crosstalk_dB.map((row: number[], i: number) => (
                <tr key={i}>
                  <td className="p-2 font-semibold text-fg">{labels[i]}</td>
                  {(row || []).map((db: number, j: number) => (
                    <td key={j} className={cn("border border-line p-2 text-center", tone(db, i, j))}>
                      {i === j ? "—" : num(db).toFixed(0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-2xs text-fg-subtle">Lower (more negative) dB is better. {">"} −20 dB (red) indicates significant leakage — increase spacing or add air-bridge field confinement.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CouplingView({ res }: { res: any }) {
  if (!Array.isArray(res?.g_vs_flux)) return <NoData />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={res.g_vs_flux}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="flux" {...axisProps} />
              <YAxis {...axisProps} unit=" MHz" />
              <RTooltip content={<ChartTooltip unit="MHz" />} />
              <Line type="monotone" name="g" dataKey="g" stroke={CHART.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" name="ZZ" dataKey="zz" stroke={CHART.violet} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Max Coupling" value={res.g_MHz ?? "—"} unit="MHz" tone="primary" />
        <MetricCard label="Min ZZ" value={res.zz_min_MHz ?? "—"} unit="MHz" tone="violet" />
      </div>
    </div>
  );
}

function HamiltonianView({ res }: { res: any }) {
  if (res?.f01_GHz == null) return <NoData />;
  const levels: number[] = Array.isArray(res.levels_GHz) ? res.levels_GHz : [];
  const max = levels.length ? levels[levels.length - 1] || 1 : 1;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="f₀₁" value={res.f01_GHz} unit="GHz" tone="primary" />
        <MetricCard label="Anharmonicity" value={res.anharmonicity_MHz} unit="MHz" tone="violet" />
        <MetricCard label="T₁ time" value={res.T1_us ?? "—"} unit="µs" tone="success" />
        <MetricCard label="T₂ time" value={res.T2_us ?? "—"} unit="µs" tone="success" />
      </div>
      {(res.EC_MHz != null || res.chi_MHz != null) && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {res.EC_MHz != null && <MetricCard label="EC" value={res.EC_MHz} unit="MHz" tone="cyan" />}
          {res.EJ_GHz != null && <MetricCard label="EJ" value={res.EJ_GHz} unit="GHz" tone="cyan" />}
          {res.EJ_EC != null && <MetricCard label="EJ / EC" value={res.EJ_EC} tone="neutral" />}
          {res.chi_MHz != null && <MetricCard label="χ dispersive" value={res.chi_MHz} unit="MHz" tone="violet" />}
        </div>
      )}
      {levels.length > 1 && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">
            Energy levels
            {res.method && <span className="ml-2 font-normal text-fg-subtle">· {res.method}</span>}
          </div>
          <CardContent className="space-y-1.5 pt-4">
            {levels.map((lv: number, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 shrink-0 font-mono text-2xs text-fg-subtle">|{i}⟩</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(num(lv) / max) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-xs text-fg-muted">{num(lv).toFixed(3)} GHz</span>
              </div>
            ))}
            {levels.length >= 3 && (
              <p className="pt-2 text-2xs text-fg-subtle">
                f₀₁ = {num(levels[1] - levels[0]).toFixed(4)} GHz · f₁₂ = {num(levels[2] - levels[1]).toFixed(4)} GHz · α = {num(((levels[2] - levels[1]) - (levels[1] - levels[0])) * 1000).toFixed(1)} MHz
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EPRView({ res }: { res: any }) {
  if (!Array.isArray(res?.frequencies_GHz) || !Array.isArray(res?.EPR_matrix)) return <NoData />;
  const anh: any[] = res.anharmonicities_MHz || [];
  const ck: any[] = res.cross_kerr_MHz || [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {res.frequencies_GHz.map((f: number, i: number) => (
          <div key={i} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Mode {i + 1}</p>
            <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-primary">
              {num(f).toFixed(3)} <span className="text-xs font-medium text-fg-subtle">GHz</span>
            </p>
            {anh[i] != null && <p className="text-2xs text-fg-muted">α {num(anh[i]).toFixed(1)} MHz</p>}
          </div>
        ))}
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">EPR participation matrix (mode × junction)</div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-xs font-mono">
            <tbody>
              {res.EPR_matrix.map((row: any[], i: number) => (
                <tr key={i}>
                  {(row || []).map((v: any, j: number) => (
                    <td key={j} className="border border-line p-2 text-center">{num(v).toFixed(3)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {ck.length > 0 && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Cross-Kerr matrix χ (MHz)</div>
          <CardContent className="overflow-auto pt-4">
            <table className="w-full text-xs font-mono">
              <tbody>
                {ck.map((row: any[], i: number) => (
                  <tr key={i}>
                    {(row || []).map((v: any, j: number) => (
                      <td key={j} className={cn("border border-line p-2 text-center", i === j ? "text-primary" : "text-fg-muted")}>
                        {num(v).toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScatteringView({ res }: { res: any }) {
  if (!Array.isArray(res?.freq_points_GHz) || !Array.isArray(res?.S21_dB)) return <NoData />;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={res.freq_points_GHz.map((f: number, i: number) => ({ f, s21: res.S21_dB?.[i], s11: res.S11_dB?.[i] }))}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="f" {...axisProps} unit=" GHz" />
              <YAxis {...axisProps} unit=" dB" />
              <RTooltip content={<ChartTooltip unit="dB" />} />
              <Line type="monotone" name="S21" dataKey="s21" stroke={CHART.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" name="S11" dataKey="s11" stroke={CHART.cyan} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <MetricCard label="External Q" value={res.Q_ext} tone="cyan" />
        <p className="text-xs text-fg-subtle p-2">S-parameter scan used to characterize coupling and loss in the feedline/readout resonator interface.</p>
      </div>
    </div>
  );
}

function KineticLView({ res }: { res: any }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <MetricCard label="Sheet Lk" value={res.lk_sheet_pH} unit="pH/sq" tone="warning" />
      <MetricCard label="Total Lk" value={res.lk_total_nH} unit="nH" tone="primary" />
      <MetricCard label="Freq Shift" value={res.freq_shift_pct} unit="%" tone="danger" />
    </div>
  );
}

function SweepView({ res }: { res: any }) {
  if (!Array.isArray(res?.sweep_curve)) return <NoData />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={res.sweep_curve}>
            <defs>
              <linearGradient id="sweep-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="x" {...axisProps} label={{ value: res.parameter, position: "insideBottom", offset: -2, fill: CHART.axis, fontSize: 10 }} />
            <YAxis {...axisProps} label={{ value: res.metric, angle: -90, position: "insideLeft", fill: CHART.axis, fontSize: 10 }} />
            <RTooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="y" stroke={CHART.primary} strokeWidth={2.5} fill="url(#sweep-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: any; sub?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", sub && "pl-3")}>
      <span className={sub ? "text-fg-subtle" : "text-fg-muted"}>{label}</span>
      <span className="font-mono text-xs text-fg">{value}</span>
    </div>
  );
}

function GateFidelityView({ res }: { res: any }) {
  if (res?.fidelity_1q_pct == null) return <NoData />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="1Q fidelity" value={res.fidelity_1q_pct} unit="%" tone={num(res.fidelity_1q_pct) > 99.9 ? "success" : "primary"} />
        <MetricCard label="2Q fidelity" value={res.fidelity_2q_pct} unit="%" tone={num(res.fidelity_2q_pct) > 99 ? "success" : "warning"} />
        <MetricCard label="T₁" value={res.T1_us} unit="µs" tone="cyan" />
        <MetricCard label="T₂" value={res.T2_us} unit="µs" tone="violet" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Error breakdown</div>
        <CardContent className="space-y-2 pt-4 text-sm">
          <MetricRow label={`1Q gate error (${res.t_gate_1q_ns} ns)`} value={sci(res.error_1q)} />
          <MetricRow label={`2Q gate error (${res.t_gate_2q_ns} ns)`} value={sci(res.error_2q)} />
          <MetricRow label="↳ coherence-limited" value={sci(res.error_2q_coherence)} sub />
          <MetricRow label="↳ residual ZZ" value={sci(res.error_2q_zz)} sub />
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function TwoQubitGateView({ res }: { res: any }) {
  if (res?.fidelity_pct == null || !Array.isArray(res?.trajectory)) return <NoData />;
  const basis = ["00", "01", "10", "11"];
  const fid = num(res.fidelity_pct);
  const gate: string = res.gate || "";
  const isCZ = gate === "CZ";
  // What the population trace should show, per gate — orients the reader.
  const dynamicsHint = isCZ
    ? "|11⟩ swaps to the non-computational |02⟩ state and back; at the gate time it returns to |11⟩ having picked up the conditional phase."
    : gate.toLowerCase().includes("swap")
      ? "Excitation is exchanged |01⟩ ⇄ |10⟩; a full transfer at the gate time is the iSWAP."
      : "The driven control conditionally rotates the target; the dashed line is population leaking out of the computational subspace.";
  // |U| caption — CZ magnitudes are identity by design (the gate is the phase).
  const uHint = isCZ
    ? "CZ acts only through phase, so |U| magnitudes are the identity — the gate is the −1 (≈180°) conditional phase on |11⟩ shown above, not a population change."
    : gate.toLowerCase().includes("swap")
      ? "iSWAP swaps the |01⟩ and |10⟩ amplitudes (the two off-diagonal 1's), with |00⟩ and |11⟩ unchanged."
      : "Cross-resonance entangles control and target (ZX): each control state drives a different target rotation — the locally-equivalent CNOT.";
  return (
    <div className="space-y-5">
      {res.coupling_note && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{res.coupling_note}</span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Avg gate fidelity" value={fid.toFixed(3)} unit="%" tone={fid > 99 ? "success" : fid > 95 ? "primary" : "warning"} />
        <MetricCard label="Leakage" value={num(res.leakage_pct).toFixed(3)} unit="%" tone={num(res.leakage_pct) < 0.5 ? "success" : "warning"} />
        <MetricCard label="Gate time" value={num(res.t_gate_ns).toFixed(1)} unit="ns" tone="cyan" />
        <MetricCard
          label={isCZ ? "Conditional phase" : "Coupling g"}
          value={isCZ ? num(res.conditional_phase_deg).toFixed(0) : num(res.g_MHz).toFixed(1)}
          unit={isCZ ? "°" : "MHz"}
          tone="violet"
        />
      </div>

      {res.calibration && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
            <div>
              <div className="text-sm font-semibold">Closed-loop pulse calibration</div>
              <p className="mt-0.5 max-w-2xl text-2xs text-fg-subtle">
                The pulse knobs below were tuned by Nelder-Mead to maximise the leakage-aware
                fidelity to ZX(π/2) — a real in-silico calibration of the two-tone echoed
                cross-resonance gate (Sheldon 2016; Sundaresan 2020). Every value is a solved
                two-qutrit propagator, not an estimate.
              </p>
            </div>
            <Badge tone="success">QuTiP · two-tone CR + DRAG</Badge>
          </div>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["CR drive amplitude", `${num(res.calibration.cr_amp_MHz).toFixed(1)} MHz`, "Gaussian drive on the control at the target frequency"],
                ["Cancellation tone", `${num(res.calibration.cancel_amp_MHz).toFixed(1)} MHz @ ${num(res.calibration.cancel_phase_deg).toFixed(0)}°`, "Driven on the target — nulls the residual IX crosstalk"],
                ["DRAG weight", num(res.calibration.drag_weight).toFixed(2), "Y-quadrature ∝ envelope slope — suppresses |1⟩→|2⟩ leakage"],
                ["Control qubit", res.calibration.control_is_q2 ? "Q2 (higher f)" : "Q1 (higher f)", "CR requires the control to be the higher-frequency transmon"],
              ] as [string, string, string][]).map(([l, v, h]) => (
                <div key={l} className="rounded-lg border border-line bg-surface/40 p-3">
                  <div className="text-2xs uppercase tracking-wide text-fg-subtle">{l}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-fg">{v}</div>
                  <div className="mt-1 text-2xs leading-snug text-fg-subtle">{h}</div>
                </div>
              ))}
            </div>
            {res.analytic_fidelity_pct != null && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-fg-subtle">Un-calibrated square-pulse estimate</span>
                <span className="font-mono text-fg-muted">{num(res.analytic_fidelity_pct).toFixed(2)}%</span>
                <span className="text-success">→</span>
                <span className="text-fg-subtle">DRAG-calibrated</span>
                <span className="font-mono font-semibold text-success">{fid.toFixed(2)}%</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {res.coherence && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
            <div>
              <div className="text-sm font-semibold">
                On-chip fidelity estimate <span className="font-normal text-fg-subtle">· with the design&apos;s T₁/T₂</span>
              </div>
              <p className="mt-0.5 max-w-2xl text-2xs text-fg-subtle">{res.coherence.note}</p>
            </div>
            <Badge tone={num(res.coherence.onchip_fidelity_pct) > 99 ? "success" : "primary"}>realistic estimate</Badge>
          </div>
          <CardContent className="pt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="On-chip fidelity"
                value={num(res.coherence.onchip_fidelity_pct).toFixed(3)}
                unit="%"
                tone={num(res.coherence.onchip_fidelity_pct) > 99 ? "success" : num(res.coherence.onchip_fidelity_pct) > 95 ? "primary" : "warning"}
              />
              <MetricCard label="Control error" value={num(res.coherence.control_error_pct).toFixed(3)} unit="%" tone="cyan" />
              <MetricCard label="T₁/T₂ error" value={num(res.coherence.coherence_error_pct).toFixed(3)} unit="%" tone="violet" />
              <MetricCard
                label="Static ZZ"
                value={res.coherence.zz_near_collision ? "near coll." : num(res.coherence.zz_kHz).toFixed(0)}
                unit={res.coherence.zz_near_collision ? "" : "kHz"}
                tone={res.coherence.zz_near_collision ? "warning" : "primary"}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-fg-subtle">Coherent-control</span>
              <span className="font-mono text-fg-muted">{fid.toFixed(2)}%</span>
              <span className="text-success">— add T₁/T₂ →</span>
              <span className="font-mono font-semibold text-success">{num(res.coherence.onchip_fidelity_pct).toFixed(2)}%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-2xs text-fg-subtle">
              <span>Q1: T₁ {num(res.coherence.T1_q1_us).toFixed(0)} µs · T₂ {num(res.coherence.T2_q1_us).toFixed(0)} µs</span>
              <span>Q2: T₁ {num(res.coherence.T1_q2_us).toFixed(0)} µs · T₂ {num(res.coherence.T2_q2_us).toFixed(0)} µs</span>
              <span>Source: {res.coherence.t1t2_source}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <div>
            <div className="text-sm font-semibold">
              Population dynamics — {gate} <span className="font-normal text-fg-subtle">· initial |{res.init_state}⟩</span>
            </div>
            <p className="mt-0.5 max-w-2xl text-2xs text-fg-subtle">{dynamicsHint}</p>
          </div>
          <Badge tone="primary">leakage-aware fidelity (Pedersen 2007)</Badge>
        </div>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={res.trajectory} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t_ns" type="number" domain={[0, "dataMax"]} {...axisProps} unit=" ns" tickFormatter={(v) => v.toFixed(0)} />
              <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
              <RTooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="plainline" />
              {/* gate completes here */}
              <ReferenceLine
                x={num(res.t_gate_ns)}
                stroke={CHART.success}
                strokeDasharray="5 4"
                label={{ value: "gate", position: "top", fill: CHART.success, fontSize: 10 }}
              />
              <Line type="monotone" name="|00⟩" dataKey="p00" stroke={CHART.axis} strokeWidth={1.5} dot={false} />
              <Line type="monotone" name="|01⟩" dataKey="p01" stroke={CHART.cyan} strokeWidth={2} dot={false} />
              <Line type="monotone" name="|10⟩" dataKey="p10" stroke={CHART.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" name="|11⟩" dataKey="p11" stroke={CHART.violet} strokeWidth={2} dot={false} />
              <Line type="monotone" name="leakage" dataKey="leak" stroke={CHART.error} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {Array.isArray(res.U_abs) && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">|U| — achieved 2-qubit unitary (magnitudes)</div>
          <CardContent className="overflow-auto pt-4">
            <table className="w-full max-w-md text-xs font-mono">
              <thead>
                <tr>
                  <th className="p-2"></th>
                  {basis.map((b) => <th key={b} className="p-2 text-fg-subtle">|{b}⟩</th>)}
                </tr>
              </thead>
              <tbody>
                {res.U_abs.map((row: number[], i: number) => (
                  <tr key={i}>
                    <td className="p-2 font-semibold text-fg">⟨{basis[i]}|</td>
                    {(row || []).map((v: number, j: number) => (
                      <td
                        key={j}
                        className={cn("border border-line p-2 text-center", num(v) > 0.5 ? "bg-primary/10 text-primary" : num(v) > 0.1 ? "text-fg-muted" : "text-fg-subtle/50")}
                      >
                        {num(v).toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 max-w-2xl text-2xs text-fg-subtle">{uHint}</p>
          </CardContent>
        </Card>
      )}

      {res.note && (
        <div className="flex items-start gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-xs text-fg-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
          <span>{res.note}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-2xs text-fg-subtle">
        <span>Operating point: f₁ = {num(res.f1_op_GHz).toFixed(3)} GHz · f₂ = {num(res.f2_op_GHz).toFixed(3)} GHz</span>
        {res.source && <span>Source: {res.source}</span>}
      </div>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

/** Green→red heat for a collision probability in [0,1]. */
function collisionColor(prob: number) {
  const p = Math.max(0, Math.min(1, prob));
  return `hsl(${(1 - p) * 140} 70% 48%)`;
}

function LatticeMap({ nodes, edges }: { nodes: any[]; edges: any[] }) {
  if (!nodes.length) return null;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs);
  const miny = Math.min(...ys), maxy = Math.max(...ys);
  const W = 460, pad = 30;
  const aspect = (maxy - miny + 1) / (maxx - minx + 1 || 1);
  const H = Math.max(150, Math.min(360, W * aspect));
  const sx = (x: number) => pad + (maxx > minx ? (x - minx) / (maxx - minx) : 0.5) * (W - 2 * pad);
  const sy = (y: number) => pad + (maxy > miny ? (y - miny) / (maxy - miny) : 0.5) * (H - 2 * pad);
  const r = nodes.length > 28 ? 7 : 11;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
      {edges.map((e, i) => {
        const a = nodes[e.a], b = nodes[e.b];
        if (!a || !b) return null;
        return (
          <line key={i} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)}
            stroke={collisionColor(e.collision_prob)} strokeWidth={e.collision_prob > 0.15 ? 3 : 2}
            strokeOpacity={0.55} />
        );
      })}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={sx(n.x)} cy={sy(n.y)} r={r} fill={collisionColor(n.collision_prob)}
            stroke="rgb(var(--surface))" strokeWidth={2}>
            <title>{`${n.id}: ${n.f_GHz} GHz · collision ${(n.collision_prob * 100).toFixed(0)}%`}</title>
          </circle>
          {nodes.length <= 28 && (
            <text x={sx(n.x)} y={sy(n.y) + r + 9} textAnchor="middle"
              fontSize="8" fill="rgb(var(--fg-subtle))" className="font-mono">
              {n.f_GHz.toFixed(2)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function FrequencyCollisionView({ res }: { res: any }) {
  if (res?.yield_pct == null || !Array.isArray(res?.lattice_nodes)) return <NoData />;
  const y = num(res.yield_pct);
  const nom = num(res.nominal_yield_pct);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Fabrication yield" value={y.toFixed(1)} unit="%" tone={y > 80 ? "success" : y > 40 ? "warning" : "danger"} />
        <MetricCard label="Nominal plan yield" value={nom.toFixed(0)} unit="%" tone={nom > 99 ? "success" : "warning"} />
        <MetricCard label="Lattice" value={res.n_qubits} unit="qubits" tone="cyan" />
        <MetricCard label="Fab precision σ" value={num(res.sigma_MHz).toFixed(0)} unit="MHz" tone="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
            <div>
              <div className="text-sm font-semibold">Collision map</div>
              <p className="mt-0.5 text-2xs text-fg-subtle">{res.topology} · node/bond colour = collision probability</p>
            </div>
            <div className="flex items-center gap-1.5 text-2xs text-fg-subtle">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: collisionColor(0) }} /> safe
              <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: collisionColor(1) }} /> collision-prone
            </div>
          </div>
          <CardContent className="pt-4">
            <LatticeMap nodes={res.lattice_nodes} edges={res.lattice_edges || []} />
          </CardContent>
        </Card>

        <Card>
          <div className="px-5 pt-5">
            <div className="text-sm font-semibold">Yield vs fabrication precision</div>
            <p className="mt-0.5 text-2xs text-fg-subtle">Tighter σ (e.g. laser-annealing) lifts whole-chip yield</p>
          </div>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={res.yield_curve} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="yield-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.success} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sigma_MHz" type="number" domain={[0, "dataMax"]} {...axisProps} unit=" MHz" tickFormatter={(v) => v.toFixed(0)} />
                <YAxis {...axisProps} domain={[0, 100]} unit="%" />
                <RTooltip content={<ChartTooltip unit="%" />} />
                <ReferenceLine x={num(res.sigma_MHz)} stroke={CHART.violet} strokeDasharray="5 4"
                  label={{ value: "σ", position: "top", fill: CHART.violet, fontSize: 10 }} />
                <Area type="monotone" name="Yield" dataKey="yield_pct" stroke={CHART.success} strokeWidth={2.5} fill="url(#yield-fill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {Array.isArray(res.collision_breakdown) && res.collision_breakdown.length > 0 && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Collision-type incidence — mean collisions per chip (σ={num(res.sigma_MHz).toFixed(0)} MHz)</div>
          <CardContent className="space-y-2 pt-4">
            {res.collision_breakdown.map((b: any) => {
              const frac = Math.min(1, num(b.incidence) / Math.max(num(res.collision_breakdown[0].incidence), 0.001));
              return (
                <div key={b.type} className="flex items-center gap-3">
                  <span className="w-56 shrink-0 text-xs text-fg-muted">{b.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${frac * 100}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-fg">{num(b.incidence).toFixed(2)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {Array.isArray(res.recommendations) && (
        <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4">
          <p className="mb-1.5 text-sm font-semibold text-fg">Recommendations</p>
          <ul className="space-y-1">
            {res.recommendations.map((rec: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" /> {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function ReadoutView({ res }: { res: any }) {
  if (res?.assignment_fidelity_pct == null) return <NoData />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Assignment fidelity" value={res.assignment_fidelity_pct} unit="%" tone={num(res.assignment_fidelity_pct) > 99 ? "success" : "primary"} />
        <MetricCard label="SNR" value={res.snr} tone="cyan" />
        <MetricCard label="χ (disp. shift)" value={res.chi_MHz} unit="MHz" tone="violet" />
        <MetricCard label="Integration" value={res.t_int_ns} unit="ns" tone="neutral" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Readout error budget</div>
        <CardContent className="space-y-2 pt-4 text-sm">
          <MetricRow label="Separation error" value={sci(res.separation_error)} />
          <MetricRow label="T₁ decay during readout" value={sci(res.t1_decay_error)} />
          <MetricRow label="κ (linewidth) / n̄" value={`${res.kappa_MHz} MHz / ${res.n_bar}`} />
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function QecView({ res }: { res: any }) {
  if (res?.distance == null && res?.physical_qubits_per_logical == null) return <NoData />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Physical error" value={sci(res.p_phys)} tone={res.below_threshold ? "primary" : "warning"} />
        <MetricCard label="Λ suppression" value={isFinite(res.lambda) ? num(res.lambda).toFixed(1) : "∞"} unit="×" tone={num(res.lambda) > 5 ? "success" : "warning"} />
        <MetricCard label="Code distance" value={res.distance ?? "—"} tone="cyan" />
        <MetricCard label="Qubits / logical" value={res.physical_qubits_per_logical ?? "—"} tone="violet" />
      </div>
      {!res.below_threshold && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Physical error ≥ threshold ({sci(res.threshold)}) — the surface code cannot suppress errors. Improve gate/coherence first.
        </div>
      )}
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Logical error vs code distance (target {sci(res.target_pL)})</div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Distance d</th><th className="p-2">Logical error / cycle</th><th className="p-2">Physical qubits</th>
              </tr>
            </thead>
            <tbody>
              {(res.distance_table ?? []).map((r: any) => (
                <tr key={r.distance} className={cn("border-b border-line/50 last:border-0", r.distance === res.distance && "bg-primary/5")}>
                  <td className="p-2 font-semibold text-fg">{r.distance}{r.distance === res.distance ? "  ◀ chosen" : ""}</td>
                  <td className="p-2 font-mono text-xs">{sci(r.p_logical)}</td>
                  <td className="p-2 font-mono text-xs">{r.physical_qubits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function SurfaceParticipationView({ res }: { res: any }) {
  if (!Array.isArray(res?.channel_T1_us)) {
    return res?.method ? (
      <div className="rounded-xl border border-line bg-surface-2 p-8 text-center text-sm text-fg-subtle">{res.method}</div>
    ) : <NoData />;
  }
  const chanColor: Record<string, string> = {
    substrate: "text-cyan", MA: "text-violet", MS: "text-primary", SA: "text-warning",
  };
  const chanName: Record<string, string> = {
    substrate: "Bulk substrate", MA: "Metal–air", MS: "Metal–substrate", SA: "Substrate–air",
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Dielectric T₁" value={res.T1_dielectric_us ?? "—"} unit="µs" tone="primary" />
        <MetricCard label="Dielectric Q" value={res.Q_dielectric != null ? (num(res.Q_dielectric) / 1e6).toFixed(2) : "—"} unit="M" tone="cyan" />
        <MetricCard label="Substrate participation" value={(num(res.p_substrate) * 100).toFixed(1)} unit="%" tone="violet" />
        <MetricCard label="Limiting channel" value={chanName[res.limiting_channel] ?? res.limiting_channel ?? "—"} tone="warning" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
        <Badge tone="primary">3-D field-derived</Badge>
        <span>qubit {res.energized} · f₀₁ {res.f01_GHz} GHz · grid {num(res.grid?.nodes).toLocaleString()} nodes</span>
      </div>

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">
          Loss channels <span className="font-normal text-fg-subtle">· 1/Q = Σ pᵢ·tanδᵢ — sorted by tightest T₁</span>
        </div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Channel</th><th className="p-2">Participation p</th>
                <th className="p-2">tan δ</th><th className="p-2">Q limit</th><th className="p-2">T₁ limit</th>
              </tr>
            </thead>
            <tbody>
              {res.channel_T1_us.map((c: any, i: number) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className={cn("p-2 font-semibold", chanColor[c.channel] || "text-fg")}>{chanName[c.channel] ?? c.channel}</td>
                  <td className="p-2 font-mono text-xs">{sci(c.participation)}</td>
                  <td className="p-2 font-mono text-xs text-fg-muted">{sci(c.tan_delta)}</td>
                  <td className="p-2 font-mono text-xs">{c.Q_limit != null ? num(c.Q_limit).toLocaleString() : "—"}</td>
                  <td className={cn("p-2 font-mono text-xs", i === 0 ? "text-warning font-semibold" : "text-fg-muted")}>
                    {c.T1_us != null ? `${num(c.T1_us).toLocaleString()} µs` : "∞"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 max-w-2xl text-2xs text-fg-subtle">
            Surface layers store a tiny fraction of the field but dominate loss — their tan δ is ~10⁴× the bulk
            substrate's, so a 10⁻⁵ participation rivals the 0.8+ bulk. Surface participations are 3-D-grid estimates
            (the true layers are nm-thin and the field peaks at pad edges); the bulk substrate value is robust.
          </p>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function PackagingView({ res }: { res: any }) {
  if (!Array.isArray(res?.box_modes)) return <NoData />;
  const box = res.box_mm || {};
  const collided = new Set((res.collisions || []).map((c: any) => c.package_mode));
  const hasCollisions = (res.n_collisions ?? 0) > 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Lowest box mode" value={res.lowest_mode_GHz ?? "—"} unit="GHz" tone="primary" />
        <MetricCard label="Modes (≤ band)" value={res.n_modes ?? 0} tone="cyan" />
        <MetricCard label="Chip↔package collisions" value={res.n_collisions ?? 0} tone={hasCollisions ? "danger" : "success"} />
        <MetricCard
          label="Worst radiative T₁"
          value={res.purcell_t1_us != null ? num(res.purcell_t1_us).toLocaleString() : "∞"}
          unit={res.purcell_t1_us != null ? "µs" : undefined}
          tone={res.purcell_t1_us != null && num(res.purcell_t1_us) < 200 ? "warning" : "success"}
        />
      </div>

      {res.device_freqs_assumed && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          No qubit/readout frequencies could be extracted from this layout — the screen below uses
          <span className="font-semibold"> reference values</span> (5.0 GHz qubit, 7.1 GHz readout), not your design.
          Add transmons/resonators with geometry for a real collision screen.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <Badge tone="violet">Enclosure {num(box.a).toFixed(1)} × {num(box.b).toFixed(1)} × {num(box.d).toFixed(1)} mm</Badge>
        <Badge tone="neutral">εr {num(box.eps_r).toFixed(1)}</Badge>
        <Badge tone="neutral">collision margin ±{res.collision_margin_MHz} MHz</Badge>
      </div>

      {Array.isArray(res.recommendations) && res.recommendations.length > 0 && (
        <div className={cn("rounded-lg border px-3 py-2 text-xs", hasCollisions ? "border-warning/30 bg-warning/5 text-warning" : "border-success/30 bg-success/5 text-success")}>
          <ul className="list-disc space-y-1 pl-4">
            {res.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Package eigenmodes <span className="font-normal text-fg-subtle">· rectangular cavity TE/TM</span></div>
          <CardContent className="overflow-auto pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="p-2">Mode</th><th className="p-2">Family</th><th className="p-2">f (GHz)</th>
                </tr>
              </thead>
              <tbody>
                {res.box_modes.map((m: any, i: number) => (
                  <tr key={i} className={cn("border-b border-line/50 last:border-0", collided.has(m.mode) && "bg-warning/5")}>
                    <td className="p-2 font-semibold text-fg">{m.mode}{collided.has(m.mode) ? "  ⚠" : ""}</td>
                    <td className="p-2 font-mono text-xs text-fg-muted">{m.family}</td>
                    <td className="p-2 font-mono text-xs text-primary">{num(m.freq_GHz).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">{hasCollisions ? "Collisions with on-chip frequencies" : "On-chip frequencies (no collisions)"}</div>
          <CardContent className="overflow-auto pt-4">
            {hasCollisions ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                    <th className="p-2">Box mode</th><th className="p-2">Device</th><th className="p-2">Detuning</th>
                  </tr>
                </thead>
                <tbody>
                  {res.collisions.map((c: any, i: number) => (
                    <tr key={i} className="border-b border-line/50 last:border-0">
                      <td className="p-2 font-mono text-xs">{c.family} {c.package_mode} · {num(c.mode_freq_GHz).toFixed(2)} GHz</td>
                      <td className="p-2 font-mono text-xs">{c.device} <span className="text-fg-subtle">({c.device_kind})</span></td>
                      <td className="p-2 font-mono text-xs text-warning">{c.detuning_MHz} MHz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="space-y-1.5">
                {(res.device_freqs || []).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
                    <span className="font-medium text-fg">{d.label} <span className="text-fg-subtle">({d.kind})</span></span>
                    <span className="font-mono text-fg-muted">{num(d.freq_GHz).toFixed(3)} GHz</span>
                  </div>
                ))}
                <p className="pt-1 text-2xs text-fg-subtle">All package modes are clear of the operating band by more than the collision margin.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function FeedbackView({ res }: { res: any }) {
  if (!Array.isArray(res?.comparison)) return <NoData />;
  const hasMeasured = res.mean_abs_delta_f01_MHz != null;
  return (
    <div className="space-y-5">
      {hasMeasured ? (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Mean |Δf₀₁|" value={res.mean_abs_delta_f01_MHz} unit="MHz" tone={num(res.mean_abs_delta_f01_MHz) > 50 ? "warning" : "success"} />
          <MetricCard label="Qubits measured" value={res.n_measured} tone="neutral" />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
          Enter <span className="font-medium text-fg">Measured f₀₁ / T₁</span> in the bar above, then Re-run — the loop compares against simulation and suggests an Ic recalibration.
        </div>
      )}
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Simulation vs measured</div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Qubit</th><th className="p-2">Sim f₀₁</th><th className="p-2">Meas f₀₁</th>
                <th className="p-2">Δf₀₁ (MHz)</th><th className="p-2">Ic correction</th>
              </tr>
            </thead>
            <tbody>
              {res.comparison.map((r: any, i: number) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className="p-2 font-semibold text-fg">{r.qubit}</td>
                  <td className="p-2 font-mono text-xs">{r.sim_f01_GHz} GHz</td>
                  <td className="p-2 font-mono text-xs">{r.meas_f01_GHz != null ? `${r.meas_f01_GHz} GHz` : "—"}</td>
                  <td className={cn("p-2 font-mono text-xs", r.delta_f01_MHz != null && Math.abs(r.delta_f01_MHz) > 50 ? "text-warning" : "text-fg-muted")}>
                    {r.delta_f01_MHz != null ? r.delta_f01_MHz : "—"}
                  </td>
                  <td className="p-2 font-mono text-xs text-primary">{r.ic_correction_pct != null ? `${r.ic_correction_pct > 0 ? "+" : ""}${r.ic_correction_pct}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MeshView({ res }: { res: any }) {
  // Backend (_mesh / fem3d.grid_stats) reports the REAL voxel grid the field solver
  // discretises onto: cell size, grid dimensions, node/cell counts, bounding box.
  if (res?.nodes == null && res?.cells == null) return <NoData />;
  const bbox = res.bbox_um || {};
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Grid nodes" value={num(res.nodes).toLocaleString()} tone="primary" />
        <MetricCard label="Cells (voxels)" value={num(res.cells).toLocaleString()} tone="cyan" />
        <MetricCard label="Cell size" value={num(res.cell_size_um).toFixed(2)} unit="µm" tone="violet" />
        <MetricCard label="Conductors" value={res.conductors ?? "—"} tone="neutral" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Discretisation grid</div>
        <CardContent className="space-y-2 pt-4 text-sm">
          <MetricRow label="Grid dimensions (nx × ny × nz)" value={res.grid_dimensions ?? "—"} />
          <MetricRow label="Scheme" value={res.scheme ?? "structured voxel grid"} />
          {bbox.x0 != null && (
            <MetricRow
              label="Domain bbox (µm)"
              value={`[${num(bbox.x0).toFixed(0)}, ${num(bbox.y0).toFixed(0)}] → [${num(bbox.x1).toFixed(0)}, ${num(bbox.y1).toFixed(0)}]`}
            />
          )}
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function FluxSpectrumView({ res }: { res: any }) {
  if (!Array.isArray(res?.spectrum) || !res.spectrum.length) return <NoData />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Upper sweet spot" value={num(res.upper_sweet_spot_GHz).toFixed(3)} unit="GHz" tone="primary" />
        <MetricCard label="Lower sweet spot" value={num(res.lower_sweet_spot_GHz).toFixed(3)} unit="GHz" tone="cyan" />
        <MetricCard label="Tunable range" value={num(res.tunable_range_GHz).toFixed(3)} unit="GHz" tone="violet" />
        <MetricCard label="∂f/∂Φ (max)" value={num(res.flux_sensitivity_GHz_per_Phi0).toFixed(2)} unit="GHz/Φ₀" tone="warning" />
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">f₀₁ vs external flux Φ/Φ₀ <span className="font-normal text-fg-subtle">· asymmetric-SQUID exact spectrum</span></div>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={res.spectrum} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="flux" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
              <YAxis {...axisProps} unit=" GHz" domain={["auto", "auto"]} />
              <RTooltip content={<ChartTooltip unit="GHz" />} />
              <Line type="monotone" name="f₀₁" dataKey="f01_GHz" stroke={CHART.primary} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function KnowledgeGraphView({ res }: { res: any }) {
  const nodes: any[] = Array.isArray(res?.nodes) ? res.nodes : [];
  const edges: any[] = Array.isArray(res?.edges) ? res.edges : [];
  if (!nodes.length) {
    return res?.method ? (
      <div className="rounded-xl border border-line bg-surface-2 p-8 text-center text-sm text-fg-subtle">{res.method}</div>
    ) : <NoData />;
  }
  const groupColor: Record<string, string> = {
    geometry: "rgb(200 128 58)", em: "rgb(224 178 85)", quantum: "rgb(180 124 240)", performance: "rgb(64 192 138)",
  };
  // layout: layer → column, index-within-layer → row
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const colW = 180, rowH = 78, boxW = 140, boxH = 50, padX = 16, padY = 20;
  const pos: Record<string, { x: number; y: number }> = {};
  const byLayer = layers.map((L) => nodes.filter((n) => n.layer === L));
  byLayer.forEach((col, li) => col.forEach((n, ri) => { pos[n.id] = { x: li * colW + padX, y: ri * rowH + padY }; }));
  const W = layers.length * colW + padX;
  const H = Math.max(1, ...byLayer.map((c) => c.length)) * rowH + padY;

  return (
    <div className="space-y-4">
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Design dependency graph <span className="font-normal text-fg-subtle">· how every figure of merit derives from the layout</span></div>
        <CardContent className="overflow-auto pt-4">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: W * 0.6, maxHeight: 460 }}>
            {edges.map((e, i) => {
              const s = pos[e.source]; const t = pos[e.target];
              if (!s || !t) return null;
              const x1 = s.x + boxW, y1 = s.y + boxH / 2, x2 = t.x, y2 = t.y + boxH / 2;
              const mx = (x1 + x2) / 2;
              return (
                <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none" stroke="rgb(var(--border-strong))" strokeWidth={1.5} opacity={0.7}>
                  {e.relation && <title>{e.relation}</title>}
                </path>
              );
            })}
            {nodes.map((n) => {
              const pp = pos[n.id]; const c = groupColor[n.group] || groupColor.quantum;
              return (
                <g key={n.id}>
                  <rect x={pp.x} y={pp.y} width={boxW} height={boxH} rx={10}
                    fill="rgb(var(--surface-2))" stroke={c} strokeWidth={1.5} />
                  <text x={pp.x + boxW / 2} y={pp.y + 19} textAnchor="middle" className="fill-fg" style={{ fontSize: 11, fontWeight: 600 }}>{n.label}</text>
                  <text x={pp.x + boxW / 2} y={pp.y + 36} textAnchor="middle" fill={c} style={{ fontSize: 11, fontFamily: "monospace" }}>
                    {typeof n.value === "number" ? num(n.value).toLocaleString() : n.value}{n.unit ? ` ${n.unit}` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Derivation relations</div>
        <CardContent className="pt-3">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {edges.filter((e) => e.relation).map((e, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-2xs">
                <span className="font-mono text-fg-subtle">{e.source} → {e.target}</span>
                <span className="ml-auto font-mono text-fg-muted">{e.relation}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function CalibrationView({ res }: { res: any }) {
  if (!Array.isArray(res?.experiments)) return <NoData />;
  const table = res.calibration_table || [];
  return (
    <div className="space-y-5">
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Calibration table <span className="font-normal text-fg-subtle">· design target vs emulated measurement</span></div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Experiment</th><th className="p-2">Parameter</th>
                <th className="p-2 text-right">Target</th><th className="p-2 text-right">Measured</th><th className="p-2 text-right">Error</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r: any, i: number) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className="p-2 font-medium text-fg">{r.experiment}</td>
                  <td className="p-2 font-mono text-xs text-fg-muted">{r.param}</td>
                  <td className="p-2 text-right font-mono text-xs tabular-nums">{r.target ?? "—"}</td>
                  <td className="p-2 text-right font-mono text-xs tabular-nums text-primary">{r.measured ?? "—"}</td>
                  <td className={cn("p-2 text-right font-mono text-xs tabular-nums", num(r.error_pct) > 5 ? "text-warning" : "text-success")}>
                    {r.error_pct == null ? "—" : `${r.error_pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-2xs text-fg-subtle">The emulator generates each curve from this design's physics (+ shot noise) and applies the standard fit — the measurements a bring-up would yield, and the digital-twin parameters they calibrate to.</p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {res.experiments.map((e: any, i: number) => (
          <Card key={i}>
            <div className="flex items-center justify-between px-5 pt-5">
              <div className="text-sm font-semibold">{e.experiment}</div>
              <Badge tone="cyan">{Object.entries(e.fit || {}).map(([k, v]) => `${k}=${v}`).join(" · ")}</Badge>
            </div>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={e.curve}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" {...axisProps} />
                  <YAxis {...axisProps} />
                  <RTooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="y" stroke={CHART.primary} strokeWidth={1.75} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-1 text-2xs text-fg-subtle">{e.x_label} → {e.y_label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function ControlView({ res }: { res: any }) {
  if (res?.control_fidelity_pct == null) return <NoData />;
  const wf = Array.isArray(res.waveform) ? res.waveform : [];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Control fidelity" value={num(res.control_fidelity_pct).toFixed(3)} unit="%" tone={num(res.control_fidelity_pct) > 99.9 ? "success" : "warning"} />
        <MetricCard label="Image rejection" value={res.image_rejection_dB} unit="dB" tone={num(res.image_rejection_dB) >= 30 ? "success" : "warning"} />
        <MetricCard label="Quantization SNR" value={res.quantization_snr_dB} unit="dB" tone="cyan" />
        <MetricCard label="Leakage → |2⟩" value={num(res.leakage_to_2_pct).toFixed(3)} unit="%" tone={num(res.leakage_to_2_pct) < 0.1 ? "success" : "warning"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={res.drag ? "success" : "neutral"}>DRAG {res.drag ? "on" : "off"}</Badge>
        <Badge tone="violet">{res.sample_rate_GSps} GSa/s · {res.dac_bits}-bit</Badge>
        <Badge tone="neutral">{res.samples_per_pulse} samples / {res.pulse_length_ns} ns pulse</Badge>
        {!res.nyquist_ok && <Badge tone="warning">below Nyquist</Badge>}
      </div>

      {Array.isArray(res.recommendations) && res.recommendations.length > 0 && (
        <div className={cn("rounded-lg border px-3 py-2 text-xs", num(res.control_fidelity_pct) > 99.9 ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning")}>
          <ul className="list-disc space-y-1 pl-4">{res.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Synthesised pulse <span className="font-normal text-fg-subtle">· I (quantised envelope) & Q (DRAG quadrature)</span></div>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={wf}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t_ns" {...axisProps} unit=" ns" />
              <YAxis {...axisProps} />
              <RTooltip content={<ChartTooltip />} />
              <Legend />
              <Line type="monotone" name="I (in-phase)" dataKey="I" stroke={CHART.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" name="Q (DRAG)" dataKey="Q" stroke={CHART.violet} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function CryogenicView({ res }: { res: any }) {
  if (!Array.isArray(res?.stages)) return <NoData />;
  const nbar = num(res.device_photons_nbar);
  const fmtW = (w: number) => {
    if (!w) return "0";
    const u = ["W", "mW", "µW", "nW", "pW"];
    let i = 0; let v = w;
    while (Math.abs(v) < 1 && i < u.length - 1) { v *= 1000; i++; }
    return `${v.toFixed(1)} ${u[i]}`;
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Thermal photons n̄" value={nbar.toFixed(4)} tone={nbar < 0.05 ? "success" : "warning"} />
        <MetricCard label="Total attenuation" value={res.total_attenuation_dB} unit="dB" tone="primary" />
        <MetricCard label="Signal at device" value={res.signal_at_device_dBm} unit="dBm" tone="cyan" />
        <MetricCard label="Device temp" value={(num(res.device_temp_K) * 1000).toFixed(0)} unit="mK" tone="violet" />
      </div>

      {Array.isArray(res.recommendations) && res.recommendations.length > 0 && (
        <div className={cn("rounded-lg border px-3 py-2 text-xs", nbar < 0.05 && !res.stages.some((s: any) => s.over_budget) ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning")}>
          <ul className="list-disc space-y-1 pl-4">
            {res.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">Fridge stages <span className="font-normal text-fg-subtle">· warmest → coldest (drive line)</span></div>
        <CardContent className="overflow-auto pt-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                <th className="p-2">Stage</th><th className="p-2 text-right">Temp</th>
                <th className="p-2 text-right">Atten</th><th className="p-2 text-right">Heat load</th>
                <th className="p-2 text-right">Cooling budget</th><th className="p-2 text-right">Headroom</th>
              </tr>
            </thead>
            <tbody>
              {res.stages.map((s: any, i: number) => (
                <tr key={i} className={cn("border-b border-line/50 last:border-0", s.over_budget && "bg-warning/5")}>
                  <td className="p-2 font-medium text-fg">{s.name}{s.over_budget ? "  ⚠" : ""}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{s.temp_K >= 1 ? `${s.temp_K} K` : `${(s.temp_K * 1000).toFixed(0)} mK`}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{s.attenuation_dB} dB</td>
                  <td className="p-2 text-right font-mono tabular-nums">{fmtW(s.heat_W)}</td>
                  <td className="p-2 text-right font-mono tabular-nums text-fg-subtle">{fmtW(s.cooling_W)}</td>
                  <td className={cn("p-2 text-right font-mono tabular-nums", s.over_budget ? "text-warning" : "text-success")}>
                    {s.headroom == null ? "—" : `${num(s.headroom) >= 100 ? Math.round(num(s.headroom)) : num(s.headroom).toFixed(1)}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 max-w-2xl text-2xs text-fg-subtle">
            Each attenuator both sets the drive level and thermalises the line. The coldest (MXC) attenuator dominates the residual photon number n̄ — the figure of merit (want ≪ 1). Headroom = cooling budget ÷ heat load.
          </p>
        </CardContent>
      </Card>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function QubitFamilyView({ res }: { res: any }) {
  if (!res?.family) return <NoData />;
  const refs: string[] = res.refs || [];
  // Conceptual / unsupported families: honest "not modeled" card, never fake numbers.
  if (!res.supported) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-fg">{res.label || res.family}</h3>
              <Badge tone="warning">not a circuit spectrum</Badge>
            </div>
            <p className="text-sm leading-relaxed text-fg-muted">{res.note}</p>
            {res.nearest_model && (
              <p className="text-xs text-fg-subtle">Closest lumped-circuit proxy: <span className="font-medium text-fg">{res.nearest_model}</span>.</p>
            )}
            {res.error && <p className="text-2xs text-warning">Solver note: {res.error}</p>}
            {refs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {refs.map((r) => <Badge key={r} tone="neutral">{r}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-2xs text-fg-subtle">{res.method}</p>
      </div>
    );
  }
  const levels: number[] = Array.isArray(res.levels_GHz) ? res.levels_GHz : [];
  const max = levels.length ? Math.max(...levels.map(Math.abs), 1) : 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="f₀₁" value={num(res.f01_GHz).toFixed(4)} unit="GHz" tone="primary" />
        <MetricCard label="f₁₂" value={num(res.f12_GHz).toFixed(4)} unit="GHz" tone="cyan" />
        <MetricCard label="Anharmonicity" value={res.anharmonicity_MHz == null ? "—" : num(res.anharmonicity_MHz).toFixed(0)} unit="MHz" tone="violet" />
        <MetricCard label="Levels" value={levels.length} tone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">scqubits · {res.solver}</Badge>
        {res.tunable && <Badge tone="cyan">flux-tunable</Badge>}
        {refs.map((r: string) => <Badge key={r} tone="neutral">{r}</Badge>)}
      </div>
      {res.note && <p className="text-xs leading-relaxed text-fg-muted">{res.note}</p>}

      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">
          Energy spectrum <span className="font-normal text-fg-subtle">· {res.label} — relative to ground, exact diagonalization</span>
        </div>
        <CardContent className="space-y-1.5 pt-4">
          {levels.map((lv, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-10 shrink-0 font-mono text-2xs text-fg-subtle">E{i}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (Math.abs(lv) / max) * 100)}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-2xs tabular-nums text-fg">{num(lv).toFixed(4)} GHz</span>
            </div>
          ))}
        </CardContent>
      </Card>
      {res.params_used && (
        <p className="text-2xs text-fg-subtle">
          Params: {Object.entries(res.params_used).map(([k, v]) => `${k}=${v}`).join(" · ")}
        </p>
      )}
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function CoupledSpectrumView({ res }: { res: any }) {
  if (res?.f01_q1_GHz == null) return <NoData />;
  const exact = res.exact_zz_kHz;
  const pert = res.perturbative_zz_kHz;
  const levels: number[] = Array.isArray(res.dressed_levels_GHz) ? res.dressed_levels_GHz : [];
  const max = levels.length ? levels[levels.length - 1] || 1 : 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="f₀₁ (Q1)" value={num(res.f01_q1_GHz).toFixed(4)} unit="GHz" tone="primary" />
        <MetricCard label="f₀₁ (Q2)" value={num(res.f01_q2_GHz).toFixed(4)} unit="GHz" tone="cyan" />
        <MetricCard label="ZZ (exact)" value={exact == null ? "—" : num(exact).toFixed(1)} unit="kHz" tone={num(exact) && Math.abs(num(exact)) > 200 ? "danger" : "success"} />
        <MetricCard label="ZZ (perturbative)" value={num(pert).toFixed(1)} unit="kHz" tone="violet" />
      </div>

      {res.near_collision && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Near a frequency collision — the static ZZ is large. The exact (diagonalized) value is trustworthy here; the perturbative formula over-estimates near resonance.</span>
        </div>
      )}

      {exact != null && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-xs text-fg-muted">
          <Info className="h-3.5 w-3.5 shrink-0 text-cyan" />
          Exact dressed-state ZZ from full diagonalization vs the leading-order perturbative estimate.
          {Math.abs(num(exact)) > 1e-9 && (
            <span className="ml-1">Ratio exact/perturbative = <span className="font-mono text-fg">{(num(exact) / (num(pert) || 1)).toFixed(2)}</span>.</span>
          )}
        </div>
      )}

      {levels.length > 1 && (
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Dressed energy levels <span className="font-normal text-fg-subtle">· two-transmon Hilbert space</span></div>
          <CardContent className="space-y-1.5 pt-4">
            {levels.map((lv, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-2xs text-fg-subtle">E{i}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(num(lv) / max) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-xs text-fg-muted">{num(lv).toFixed(4)} GHz</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {res.source && <p className="text-2xs text-fg-subtle">Source: {res.source}</p>}
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function DecoherenceView({ res }: { res: any }) {
  if (res?.T1_total_us == null) return <NoData />;
  const t1Channels = [
    ["Dielectric / TLS", res.T1_dielectric_us],
    ["Purcell", res.T1_purcell_us],
    ["Quasiparticle", res.T1_quasiparticle_us],
  ].filter(([, v]) => v != null) as [string, number][];
  const tphiChannels = [
    ["Photon shot-noise", res.Tphi_photon_us],
    ["Flux noise (1/f)", res.Tphi_flux_us],
  ].filter(([, v]) => v != null) as [string, number][];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="T₁ (total)" value={num(res.T1_total_us).toFixed(1)} unit="µs" tone="success" />
        <MetricCard label="T₂ echo" value={num(res.T2_echo_us).toFixed(1)} unit="µs" tone="primary" />
        <MetricCard label="T₂ Ramsey" value={num(res.T2_ramsey_us).toFixed(1)} unit="µs" tone="cyan" />
        <MetricCard label="Q dielectric" value={num(res.Q_dielectric) >= 1e6 ? `${(num(res.Q_dielectric) / 1e6).toFixed(2)}M` : `${(num(res.Q_dielectric) / 1e3).toFixed(0)}k`} tone="violet" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">T₁ channels <span className="font-normal text-fg-subtle">(parallel sum)</span></div>
          <CardContent className="space-y-2 pt-4 text-sm">
            {t1Channels.map(([k, v]) => (
              <MetricRow key={k} label={k} value={`${num(v).toFixed(1)} µs`} />
            ))}
            <div className="flex items-center justify-between border-t border-line pt-2 font-medium">
              <span className="text-fg">T₁ total</span>
              <span className="font-mono text-success">{num(res.T1_total_us).toFixed(1)} µs</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <div className="px-5 pt-5 text-sm font-semibold">Dephasing (Tφ) channels</div>
          <CardContent className="space-y-2 pt-4 text-sm">
            {tphiChannels.length ? (
              tphiChannels.map(([k, v]) => <MetricRow key={k} label={k} value={`${num(v).toFixed(1)} µs`} />)
            ) : (
              <p className="text-xs text-fg-subtle">No dephasing channels active (set Tunable for flux 1/f noise).</p>
            )}
            <MetricRow label="χ dispersive" value={`${num(res.chi_MHz).toFixed(3)} MHz`} />
          </CardContent>
        </Card>
      </div>
      <p className="text-2xs text-fg-subtle">{res.method}</p>
    </div>
  );
}

function MetricCard({ label, value, unit, tone }: any) {
  const tones = {
    primary: "text-primary border-primary/20 bg-primary/5",
    cyan: "text-cyan border-cyan/20 bg-cyan/5",
    violet: "text-violet border-violet/20 bg-violet/5",
    success: "text-success border-success/20 bg-success/5",
    warning: "text-warning border-warning/20 bg-warning/5",
    danger: "text-danger border-danger/20 bg-danger/5",
    neutral: "text-fg border-line bg-surface-2",
  };
  return (
    <div className={cn("rounded-xl border p-4", (tones as any)[tone])}>
      <p className="text-2xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium opacity-70">{unit}</span>}
      </p>
    </div>
  );
}
