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
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Select, Field, Input } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

type Tab = "validation" | "frequency" | "eigenmode" | "capacitance" | "lom" | "circuit_graph" | "coupling" | "crosstalk" | "hamiltonian" | "sweep" | "mesh" | "epr" | "scattering" | "kinetic_inductance" | "feedback" | "gate_fidelity" | "readout" | "qec";

const TABS = [
  { value: "validation", label: "Validation" },
  { value: "frequency", label: "Readout S21" },
  { value: "eigenmode", label: "Eigenmode" },
  { value: "capacitance", label: "Capacitance" },
  { value: "lom", label: "LOM" },
  { value: "circuit_graph", label: "Circuit Graph" },
  { value: "coupling", label: "Coupling" },
  { value: "crosstalk", label: "Crosstalk" },
  { value: "hamiltonian", label: "Hamiltonian" },
  { value: "epr", label: "EPR" },
  { value: "gate_fidelity", label: "Gate Fidelity" },
  { value: "readout", label: "Readout" },
  { value: "qec", label: "Error Correction" },
  { value: "scattering", label: "Scattering" },
  { value: "kinetic_inductance", label: "Kinetic L" },
  { value: "sweep", label: "Sweep" },
  { value: "mesh", label: "Mesh" },
  { value: "feedback", label: "Feedback" },
];

export default function Simulation() {
  const { projects, fetchProjects } = useDataStore();
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<Tab>("frequency");
  const [solver, setSolver] = useState("palace");
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
  });
  const [formats, setFormats] = useState<any>(null);
  // Monotonic run token: a poll that resolves after a newer run started (or
  // after the user switched tabs) is ignored, so results never land on the
  // wrong tab. Now that runs are async (submit + poll) this race is reachable.
  const runSeq = useRef(0);

  useEffect(() => {
    fetchProjects();
    api.getExportFormats().then(setFormats).catch(console.error);
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

  const handleExportDesign = (fmt: string) => {
    const dId = projects.find(p => p.id === projectId)?.id; // simplification
    if (dId) api.downloadDesignExport(dId, fmt);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation Engine"
        subtitle="Validation, frequency, capacitance, EPR, scattering & mesh — live."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48">
              <option value="">Select project…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select value={solver} onChange={(e) => setSolver(e.target.value)} className="w-36">
              <option value="palace">AWS Palace</option>
              <option value="hfss">Ansys HFSS</option>
              <option value="q3d">Ansys Q3D</option>
              <option value="analytic">Analytic</option>
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
            <Button icon={<RotateCw className="h-4 w-4" />} loading={running} onClick={run} disabled={!projectId}>
              Run
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(v) => {
          runSeq.current++; // invalidate any in-flight run so its result can't land on the new tab
          setRes(null);
          setTab(v as Tab);
        }}
        items={TABS}
      />

      {/* Per-tab parameter controls */}
      <ParamBar tab={tab} params={params} setParams={setParams} onRun={run} running={running} />

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
              {/* Result Views */}
              {tab === "validation" && <ValidationView res={res} />}
              {tab === "frequency" && <FrequencyView res={res} />}
              {tab === "eigenmode" && <EigenmodeView res={res} />}
              {tab === "capacitance" && <CapacitanceView res={res} />}
              {tab === "lom" && <LOMView res={res} />}
              {tab === "circuit_graph" && <CircuitGraphView res={res} />}
              {tab === "coupling" && <CouplingView res={res} />}
              {tab === "crosstalk" && <CrosstalkView res={res} />}
              {tab === "hamiltonian" && <HamiltonianView res={res} />}
              {tab === "epr" && <EPRView res={res} />}
              {tab === "gate_fidelity" && <GateFidelityView res={res} />}
              {tab === "readout" && <ReadoutView res={res} />}
              {tab === "qec" && <QecView res={res} />}
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
    </div>
  );
}

function ParamBar({ tab, params, setParams, onRun, running }: any) {
  const set = (k: string, v: any) => setParams({ ...params, [k]: v });
  return (
    <Card inset>
      <CardContent className="flex flex-wrap items-center gap-6 py-3">
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
        {tab === "readout" && (
          <>
            <Mini label="Photons n̄"><Input value={params.n_bar ?? 5} onChange={(e) => set("n_bar", Number(e.target.value))} /></Mini>
            <Mini label="Integration (ns)"><Input value={params.t_int_ns ?? 500} onChange={(e) => set("t_int_ns", Number(e.target.value))} /></Mini>
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
  if (res?.elements == null) return <NoData />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Elements" value={num(res.elements).toLocaleString()} tone="neutral" />
      <MetricCard label="Nodes" value={num(res.nodes).toLocaleString()} tone="neutral" />
      <MetricCard label="Quality" value={res.quality ?? "—"} tone="success" />
      <MetricCard label="Regions" value={res.regions ?? "—"} tone="primary" />
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
