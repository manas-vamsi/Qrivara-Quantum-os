import { useEffect, useMemo, useState } from "react";
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

type Tab = "validation" | "frequency" | "capacitance" | "coupling" | "hamiltonian" | "sweep" | "mesh" | "epr" | "scattering" | "kinetic_inductance";

const TABS = [
  { value: "validation", label: "Validation" },
  { value: "frequency", label: "Eigenmode" },
  { value: "capacitance", label: "Capacitance" },
  { value: "coupling", label: "Coupling" },
  { value: "hamiltonian", label: "Hamiltonian" },
  { value: "epr", label: "EPR" },
  { value: "scattering", label: "Scattering" },
  { value: "kinetic_inductance", label: "Kinetic L" },
  { value: "sweep", label: "Sweep" },
  { value: "mesh", label: "Mesh" },
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

  useEffect(() => {
    fetchProjects();
    api.getExportFormats().then(setFormats).catch(console.error);
  }, [fetchProjects]);

  const project = projects.find((p: any) => p.id === projectId);

  const run = async () => {
    if (!projectId) return;
    setRunning(true);
    setRes(null);
    setJobId(null);
    try {
      // Find design ID for project
      const designs = await api.getProjectDesigns(projectId);
      const dId = designs?.[0]?.id;
      if (!dId) throw new Error("No design found for project");

      const job = await api.runSimulation(dId, tab, solver, params);
      setJobId(job.id);
      if (job.status === "done") {
        setRes(job.result);
      } else {
        // Mock polling for the demo
        setRes(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
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

      <Tabs value={tab} onChange={(v) => setTab(v as Tab)} items={TABS} />

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
              {tab === "capacitance" && <CapacitanceView res={res} />}
              {tab === "coupling" && <CouplingView res={res} />}
              {tab === "hamiltonian" && <HamiltonianView res={res} />}
              {tab === "epr" && <EPRView res={res} />}
              {tab === "scattering" && <ScatteringView res={res} />}
              {tab === "kinetic_inductance" && <KineticLView res={res} />}
              {tab === "sweep" && <SweepView res={res} />}
              {tab === "mesh" && <MeshView res={res} />}

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

function ValidationView({ res }: { res: any }) {
  if (!Array.isArray(res?.checks)) return <NoData />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(res.checks || []).map((c: any) => (
        <Card key={c.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-fg-subtle uppercase">{c.name}</p>
              <StatusDot tone={c.passed ? "success" : "danger"} />
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
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard label="f₀₁" value={res.f01_GHz} unit="GHz" tone="primary" />
      <MetricCard label="Anharmonicity" value={res.anharmonicity_MHz} unit="MHz" tone="violet" />
      <MetricCard label="T₁ time" value={res.T1_us} unit="µs" tone="success" />
      <MetricCard label="T₂ time" value={res.T2_us} unit="µs" tone="success" />
    </div>
  );
}

function EPRView({ res }: { res: any }) {
  if (!Array.isArray(res?.frequencies_GHz) || !Array.isArray(res?.EPR_matrix)) return <NoData />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {res.frequencies_GHz.map((f: number, i: number) => (
          <MetricCard key={i} label={`Mode ${i+1}`} value={num(f).toFixed(3)} unit="GHz" tone="primary" />
        ))}
      </div>
      <Card>
        <div className="px-5 pt-5 text-sm font-semibold">EPR Participation Matrix</div>
        <CardContent className="pt-4 overflow-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {res.EPR_matrix.map((row: any[], i: number) => (
                <tr key={i}>
                  {(row || []).map((v: any, j: number) => <td key={j} className="p-2 border border-line text-center">{num(v).toFixed(3)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
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
