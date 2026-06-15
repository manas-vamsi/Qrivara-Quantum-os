import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Play,
  RotateCw,
  Radio,
  Atom,
  Grid3x3,
  Link2,
  SlidersHorizontal,
  ShieldCheck,
  Boxes,
  Check,
  X,
  FolderOpen,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Legend,
  Tooltip as RTooltip,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Metric } from "@/components/common/Metric";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Select, Field, Input } from "@/components/ui/Form";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { cn, fmtUs } from "@/lib/utils";

type Tab =
  | "validation"
  | "frequency"
  | "capacitance"
  | "coupling"
  | "hamiltonian"
  | "sweep"
  | "mesh";

const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: "validation", label: "Validation", icon: <ShieldCheck className="h-4 w-4" /> },
  { value: "frequency", label: "Frequency", icon: <Radio className="h-4 w-4" /> },
  { value: "hamiltonian", label: "Hamiltonian", icon: <Atom className="h-4 w-4" /> },
  { value: "capacitance", label: "Capacitance", icon: <Grid3x3 className="h-4 w-4" /> },
  { value: "coupling", label: "Coupling", icon: <Link2 className="h-4 w-4" /> },
  { value: "sweep", label: "Sweep", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { value: "mesh", label: "Mesh", icon: <Boxes className="h-4 w-4" /> },
];

const motionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

function defaultParams(tab: Tab): Record<string, any> {
  switch (tab) {
    case "frequency":
      return { resonator_freq_GHz: 7.1, kappa_MHz: 1.18 };
    case "coupling":
      return { g_MHz: 92 };
    case "hamiltonian":
      return { qubit: "transmon", c_sigma_fF: 80, ic_nA: 30, resonator_freq_GHz: 7.1, kappa_MHz: 1.2, q_factor: 2e6 };
    case "sweep":
      return { parameter: "c_sigma_fF", start: 60, stop: 100, steps: 14, metric: "f01_GHz" };
    case "mesh":
      return { quality: "medium" };
    default:
      return {};
  }
}

export default function Simulation() {
  const projects = useDataStore((s) => s.projects);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [designId, setDesignId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("validation");
  const [solver, setSolver] = useState("palace");
  const [params, setParams] = useState<Record<string, any>>(defaultParams("validation"));
  const [results, setResults] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  // default to the first project
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  // load the project's design id
  useEffect(() => {
    if (!projectId) return;
    setResults({});
    setDesignId(null);
    api
      .getProjectDesigns(projectId)
      .then((ds: any[]) => setDesignId(ds?.[0]?.id ?? null))
      .catch(() => setDesignId(null));
  }, [projectId]);

  // reset param defaults when switching tab
  useEffect(() => setParams(defaultParams(tab)), [tab]);

  const run = async (override?: Record<string, any>) => {
    if (!designId) return;
    const p = override ?? params;
    setRunning(true);
    try {
      const job: any = await api.runSimulation(designId, tab, solver, p);
      const result = job?.result ?? job ?? {};
      setResults((r) => ({ ...r, [tab]: result }));
      setJobs((j) =>
        [{ id: job?.id ?? "?", type: tab, status: job?.status ?? "done" }, ...j].slice(0, 8),
      );
    } catch {
      /* offline */
    }
    setRunning(false);
  };

  // auto-run when a design + tab become ready (and not cached) — use fresh defaults
  useEffect(() => {
    if (designId && !results[tab]) run(defaultParams(tab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, tab]);

  const project = projects.find((p: any) => p.id === projectId) ?? null;
  const res = results[tab];

  if (!projectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Simulation Workspace" subtitle="Run analyses against a project's design." icon={<Activity className="h-5 w-5" />} />
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="No project selected"
          description="Pick a project to simulate — create one with New Design if you have none yet."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation Workspace"
        subtitle="Validation, frequency, capacitance, coupling, Hamiltonian, sweeps & mesh — live."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48">
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
            <Button icon={<RotateCw className="h-4 w-4" />} loading={running} onClick={run} disabled={!designId}>
              Run
            </Button>
          </>
        }
      />

      <Tabs value={tab} onChange={(v) => setTab(v as Tab)} items={TABS} />

      {/* Per-tab parameter controls */}
      <ParamBar tab={tab} params={params} setParams={setParams} onRun={run} running={running} />

      <AnimatePresence mode="wait">
        <motion.div key={tab} {...motionProps}>
          {!res ? (
            <EmptyState
              icon={<Play className="h-5 w-5" />}
              title={running ? "Running…" : "No result yet"}
              description={running ? "The solver is computing." : "Adjust parameters and run this analysis."}
            />
          ) : tab === "validation" ? (
            <ValidationView res={res} />
          ) : tab === "frequency" ? (
            <FrequencyView res={res} />
          ) : tab === "capacitance" ? (
            <CapacitanceView res={res} />
          ) : tab === "coupling" ? (
            <CouplingView res={res} />
          ) : tab === "hamiltonian" ? (
            <HamiltonianView res={res} qubit={params.qubit} />
          ) : tab === "sweep" ? (
            <SweepView res={res} />
          ) : (
            <MeshView res={res} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Job history */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Solver Runs · {project?.name}</h3>
          <Badge tone="cyan" dot>{jobs.length} this session</Badge>
        </div>
        <CardContent className="pt-3">
          {jobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-subtle">No runs yet — results appear here.</p>
          ) : (
            <div className="space-y-1">
              {jobs.map((j, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                  <StatusDot tone={j.status === "done" ? "success" : j.status === "failed" ? "error" : "cyan"} />
                  <span className="font-medium text-fg">{TABS.find((t) => t.value === j.type)?.label ?? j.type}</span>
                  <span className="text-2xs text-fg-subtle">{solver}</span>
                  <span className="ml-auto font-mono text-2xs text-fg-subtle">{j.id}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- Controls ------------------------------- */
function ParamBar({ tab, params, setParams, onRun, running }: { tab: Tab; params: any; setParams: (p: any) => void; onRun: () => void; running: boolean }) {
  const set = (k: string, v: any) => setParams({ ...params, [k]: v });
  if (tab === "validation" || tab === "capacitance") return null;
  return (
    <Card inset>
      <CardContent className="flex flex-wrap items-end gap-4 pt-4">
        {tab === "frequency" && (
          <>
            <Mini label="Resonator f (GHz)"><Input value={params.resonator_freq_GHz} onChange={(e) => set("resonator_freq_GHz", Number(e.target.value))} /></Mini>
            <Mini label="κ (MHz)"><Input value={params.kappa_MHz} onChange={(e) => set("kappa_MHz", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "coupling" && <Mini label="Max g (MHz)"><Input value={params.g_MHz} onChange={(e) => set("g_MHz", Number(e.target.value))} /></Mini>}
        {tab === "hamiltonian" && (
          <>
            <Mini label="Qubit">
              <Select value={params.qubit} onChange={(e) => set("qubit", e.target.value)}>
                <option value="transmon">Transmon</option>
                <option value="fluxonium">Fluxonium</option>
              </Select>
            </Mini>
            {params.qubit === "fluxonium" ? (
              <>
                <Mini label="EJ (GHz)"><Input value={params.EJ_GHz ?? 4} onChange={(e) => set("EJ_GHz", Number(e.target.value))} /></Mini>
                <Mini label="EC (GHz)"><Input value={params.EC_GHz ?? 1} onChange={(e) => set("EC_GHz", Number(e.target.value))} /></Mini>
                <Mini label="EL (GHz)"><Input value={params.EL_GHz ?? 0.9} onChange={(e) => set("EL_GHz", Number(e.target.value))} /></Mini>
                <Mini label="Φ/Φ₀"><Input value={params.flux ?? 0.5} onChange={(e) => set("flux", Number(e.target.value))} /></Mini>
              </>
            ) : (
              <>
                <Mini label="Cσ (fF)"><Input value={params.c_sigma_fF} onChange={(e) => set("c_sigma_fF", Number(e.target.value))} /></Mini>
                <Mini label="Ic (nA)"><Input value={params.ic_nA} onChange={(e) => set("ic_nA", Number(e.target.value))} /></Mini>
              </>
            )}
          </>
        )}
        {tab === "sweep" && (
          <>
            <Mini label="Parameter">
              <Select value={params.parameter} onChange={(e) => set("parameter", e.target.value)}>
                <option value="c_sigma_fF">Cσ (fF)</option>
                <option value="ic_nA">Ic (nA)</option>
              </Select>
            </Mini>
            <Mini label="Start"><Input value={params.start} onChange={(e) => set("start", Number(e.target.value))} /></Mini>
            <Mini label="Stop"><Input value={params.stop} onChange={(e) => set("stop", Number(e.target.value))} /></Mini>
            <Mini label="Steps"><Input value={params.steps} onChange={(e) => set("steps", Number(e.target.value))} /></Mini>
          </>
        )}
        {tab === "mesh" && (
          <Mini label="Mesh quality">
            <Select value={params.quality} onChange={(e) => set("quality", e.target.value)}>
              <option value="coarse">Coarse</option>
              <option value="medium">Medium</option>
              <option value="fine">Fine</option>
            </Select>
          </Mini>
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
function ValidationView({ res }: { res: any }) {
  const checks = res.checks ?? [];
  const allPass = (res.passed ?? 0) === (res.total ?? 0);
  return (
    <div className="space-y-6">
      <Card inset>
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", allPass ? "bg-success/12 text-success" : "bg-warning/12 text-warning")}>
            {allPass ? <ShieldCheck className="h-6 w-6" /> : <X className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">{allPass ? "Layout is valid" : "Issues found"}</h3>
            <p className="text-sm text-fg-subtle">{res.passed}/{res.total} checks passed</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {checks.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="flex items-start gap-3 pt-5">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", c.passed ? "bg-success/12 text-success" : "bg-warning/12 text-warning")}>
                {c.passed ? <Check className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.5} /> : <X className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.5} />}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-fg">{c.name}</h4>
                  <Badge tone={c.passed ? "success" : "warning"}>{c.passed ? "Pass" : `${c.count} found`}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FrequencyView({ res }: { res: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Resonance" value={Number(res.resonance_GHz).toFixed(3)} unit="GHz" tone="cyan" />
        <Metric label="Coupling Q" value={(Number(res.Qc) / 1000).toFixed(1)} unit="k" tone="primary" />
        <Metric label="Linewidth κ" value={Number(res.kappa_MHz).toFixed(2)} unit="MHz" tone="violet" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="S21 Transmission">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={res.s21_curve} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="freq" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
              <YAxis {...axisProps} unit=" dB" />
              <RTooltip content={<ChartTooltip unit="dB" />} cursor={{ stroke: CHART.grid }} />
              <ReferenceLine x={res.resonance_GHz} stroke={CHART.cyan} strokeDasharray="4 4" />
              <Line type="monotone" name="S21" dataKey="s21" stroke={CHART.cyan} strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Eigenmode Convergence">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={res.convergence} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="pass" {...axisProps} />
              <YAxis yAxisId="l" {...axisProps} domain={["auto", "auto"]} />
              <YAxis yAxisId="r" orientation="right" {...axisProps} />
              <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
              <Bar yAxisId="r" name="Error %" dataKey="error" fill={CHART.warning} fillOpacity={0.3} radius={[4, 4, 0, 0]} />
              <Line yAxisId="l" type="monotone" name="Freq (GHz)" dataKey="freq" stroke={CHART.primary} strokeWidth={2.25} dot={{ r: 2.5, fill: CHART.primary }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function CapacitanceView({ res }: { res: any }) {
  const labels: string[] = res.labels ?? [];
  const matrix: number[][] = res.maxwell_matrix_fF ?? [];
  const diag = labels.map((l, i) => ({ label: l, cap: matrix[i]?.[i] ?? 0 }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard title="Maxwell Capacitance Matrix" subtitle="fF">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `auto repeat(${labels.length}, 1fr)` }}>
          <div />
          {labels.map((l) => <div key={l} className="pb-1 text-center text-2xs font-semibold text-fg-subtle">{l}</div>)}
          {matrix.map((row, i) => (
            <Row key={i} label={labels[i]} row={row} i={i} />
          ))}
        </div>
      </ChartCard>
      <ChartCard title="Self-Capacitance">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={diag} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} unit=" fF" />
            <RTooltip content={<ChartTooltip unit="fF" />} cursor={{ fill: "rgb(var(--surface-3) / 0.4)" }} />
            <Bar dataKey="cap" name="C self" fill={CHART.primary} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function Row({ label, row, i }: { label: string; row: number[]; i: number }) {
  const max = 320;
  return (
    <>
      <div className="flex items-center pr-1 text-2xs font-semibold text-fg-subtle">{label}</div>
      {row.map((v, j) => {
        const alpha = Math.min(0.85, 0.06 + (v / max) * 1.1);
        const isDiag = i === j;
        return (
          <div key={j} className={cn("grid aspect-square place-items-center rounded-md font-mono text-2xs tabular-nums", isDiag ? "text-fg ring-1 ring-primary/40" : "text-fg-muted")}
            style={{ backgroundColor: isDiag ? `rgb(var(--primary) / ${alpha})` : `rgb(var(--cyan) / ${alpha})` }}>
            {v.toFixed(v < 10 ? 1 : 0)}
          </div>
        );
      })}
    </>
  );
}

function CouplingView({ res }: { res: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Metric label="Max coupling g" value={Number(res.g_MHz).toFixed(0)} unit="MHz" tone="cyan" />
        <Metric label="Min ZZ" value={Number(res.zz_min_MHz).toFixed(2)} unit="MHz" tone="success" />
      </div>
      <ChartCard title="Coupling vs Flux" subtitle="g and residual ZZ across Φ/Φ₀">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={res.g_vs_flux} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="g-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.cyan} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART.cyan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="flux" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
            <YAxis yAxisId="l" {...axisProps} unit=" MHz" />
            <YAxis yAxisId="r" orientation="right" {...axisProps} />
            <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
            <ReferenceLine yAxisId="l" x={0} stroke={CHART.grid} />
            <Area yAxisId="l" type="monotone" name="g (MHz)" dataKey="g" stroke={CHART.cyan} strokeWidth={2.25} fill="url(#g-fill)" />
            <Line yAxisId="r" type="monotone" name="ZZ (MHz)" dataKey="zz" stroke={CHART.violet} strokeWidth={2.25} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function HamiltonianView({ res, qubit }: { res: any; qubit: string }) {
  if (qubit === "fluxonium") {
    const levels: number[] = res.levels_GHz ?? [];
    const eMax = levels[levels.length - 1] || 1;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="f₀₁" value={Number(res.f01_GHz).toFixed(3)} unit="GHz" tone="primary" />
          <Metric label="Anharmonicity" value={Number(res.anharmonicity_MHz).toFixed(0)} unit="MHz" tone="violet" />
          <Metric label="Plasma ω_p" value={Number(res.plasma_GHz).toFixed(2)} unit="GHz" tone="cyan" />
          <Metric label="Levels" value={String(levels.length)} tone="success" />
        </div>
        <ChartCard title="Fluxonium Spectrum">
          <svg viewBox="0 0 240 180" className="h-48 w-full">
            {levels.map((e, n) => {
              const y = 165 - (e / eMax) * 150;
              return (
                <g key={n}>
                  <line x1={44} x2={170} y1={y} y2={y} stroke="rgb(var(--violet))" strokeWidth={2} opacity={0.9 - n * 0.1} />
                  <text x={28} y={y + 4} fill="rgb(var(--fg-muted))" fontSize={11} fontFamily="monospace">|{n}⟩</text>
                  <text x={178} y={y + 4} fill="rgb(var(--fg-subtle))" fontSize={9} fontFamily="monospace">{e.toFixed(2)}</text>
                </g>
              );
            })}
          </svg>
        </ChartCard>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Metric label="EC" value={Number(res.EC_MHz).toFixed(0)} unit="MHz" tone="cyan" />
      <Metric label="EJ" value={Number(res.EJ_GHz).toFixed(2)} unit="GHz" tone="primary" />
      <Metric label="EJ / EC" value={Number(res.EJ_EC).toFixed(0)} tone={res.parity_risk ? "warning" : "success"} />
      <Metric label="f₀₁" value={Number(res.f01_GHz).toFixed(3)} unit="GHz" tone="primary" />
      <Metric label="Anharmonicity" value={Number(res.anharmonicity_MHz).toFixed(0)} unit="MHz" tone="violet" />
      <Metric label="Coupling g" value={Number(res.g_MHz).toFixed(1)} unit="MHz" tone="cyan" />
      <Metric label="Disp. shift χ" value={Math.abs(Number(res.chi_MHz)).toFixed(3)} unit="MHz" tone="violet" />
      <Metric label="T₁ / T₂" value={`${fmtUs(res.T1_us)}/${fmtUs(res.T2_us)}`} unit="µs" tone="success" />
    </div>
  );
}

function SweepView({ res }: { res: any }) {
  return (
    <ChartCard title="Parameter Sweep" subtitle={`${res.metric} vs ${res.parameter}`}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={res.sweep_curve} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" {...axisProps} />
          <YAxis {...axisProps} domain={["auto", "auto"]} />
          <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
          <Line type="monotone" name={res.metric} dataKey="y" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 2.5, fill: CHART.primary }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function MeshView({ res }: { res: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Elements" value={Number(res.elements).toLocaleString()} tone="primary" />
        <Metric label="Nodes" value={Number(res.nodes).toLocaleString()} tone="cyan" />
        <Metric label="Quality" value={Number(res.quality).toFixed(3)} tone="success" />
        <Metric label="Regions" value={String(res.regions)} tone="violet" />
      </div>
      <ChartCard title="Element Quality Distribution">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={res.quality_histogram} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bin" {...axisProps} />
            <YAxis {...axisProps} />
            <RTooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-3) / 0.4)" }} />
            <Bar dataKey="count" name="Elements" fill={CHART.success} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 pt-5">
        <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
