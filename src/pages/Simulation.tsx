import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Play,
  Radio,
  Grid3x3,
  Link2,
  SlidersHorizontal,
  Cpu,
  Atom,
  Timer,
  Thermometer,
  AlertTriangle,
  ShieldCheck,
  Check,
  X,
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
import { StatCard } from "@/components/common/StatCard";
import { Metric } from "@/components/common/Metric";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Select, Field, Input, Slider, SegmentedControl } from "@/components/ui/Form";
import { Tabs } from "@/components/ui/Tabs";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import {
  ecFromCapacitance,
  ejFromIc,
  f01 as calcF01,
  anharmonicity as calcAnharm,
  couplingG,
  dispersiveShift,
  purcellT1,
  t1FromQ,
  combineT1,
  t2 as calcT2,
  chargeDispersion,
  thermalPopulation,
  fluxoniumLevels,
} from "@/lib/quantum";
import {
  S21_CURVE,
  CONVERGENCE,
  CAP_MATRIX,
  COUPLING_SWEEP,
  COHERENCE,
  SIM_RUNS,
} from "@/data/mockData";
import { cn, timeAgo, fmtUs } from "@/lib/utils";

type Tab = "validation" | "frequency" | "hamiltonian" | "capacitance" | "coupling" | "sweeps";

const motionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

export default function Simulation() {
  const [tab, setTab] = useState<Tab>("frequency");
  const [mesh, setMesh] = useState<"coarse" | "medium" | "fine">("medium");
  const [selectedRun, setSelectedRun] = useState("s2");

  const diag = CAP_MATRIX.labels.map((label, i) => ({
    label,
    cap: CAP_MATRIX.values[i][i],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation Workspace"
        subtitle="Frequency, capacitance and coupling analysis with industry solvers."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <Select defaultValue="hfss" className="w-40">
              <option value="hfss">Ansys HFSS</option>
              <option value="q3d">Ansys Q3D</option>
              <option value="palace">AWS Palace</option>
            </Select>
            <Button icon={<Play className="h-4 w-4" />}>Run Analysis</Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: "validation", label: "Validation", icon: <ShieldCheck className="h-4 w-4" /> },
            { value: "frequency", label: "Frequency", icon: <Radio className="h-4 w-4" /> },
            { value: "hamiltonian", label: "Hamiltonian", icon: <Atom className="h-4 w-4" /> },
            { value: "capacitance", label: "Capacitance", icon: <Grid3x3 className="h-4 w-4" /> },
            { value: "coupling", label: "Coupling", icon: <Link2 className="h-4 w-4" /> },
            { value: "sweeps", label: "Sweeps", icon: <SlidersHorizontal className="h-4 w-4" /> },
          ]}
          className="border-b-0"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-subtle">Mesh</span>
          <SegmentedControl
            size="sm"
            value={mesh}
            onChange={setMesh}
            options={[
              { value: "coarse", label: "Coarse" },
              { value: "medium", label: "Medium" },
              { value: "fine", label: "Fine" },
            ]}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === "validation" && (
          <motion.div key="validation" {...motionProps}>
            <ValidationTab />
          </motion.div>
        )}

        {tab === "frequency" && (
          <motion.div key="frequency" {...motionProps} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Resonance" value="7.100" unit="GHz" tone="cyan" icon={<Radio className="h-[1.1rem] w-[1.1rem]" />} />
              <StatCard label="Coupling Q (Qc)" value="12.0" unit="k" tone="primary" icon={<Activity className="h-[1.1rem] w-[1.1rem]" />} />
              <StatCard label="Linewidth κ" value="1.18" unit="MHz" tone="violet" icon={<Radio className="h-[1.1rem] w-[1.1rem]" />} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="S21 Transmission" subtitle="Readout resonance dip">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={S21_CURVE} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="freq" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
                    <YAxis {...axisProps} unit=" dB" />
                    <RTooltip content={<ChartTooltip unit="dB" />} cursor={{ stroke: CHART.grid }} />
                    <ReferenceLine x={7.1} stroke={CHART.cyan} strokeDasharray="4 4" />
                    <Line type="monotone" name="S21" dataKey="s21" stroke={CHART.cyan} strokeWidth={2.25} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Eigenmode Convergence" subtitle="Frequency & error vs mesh pass">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={CONVERGENCE} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
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
          </motion.div>
        )}

        {tab === "hamiltonian" && (
          <motion.div key="hamiltonian" {...motionProps}>
            <HamiltonianTab />
          </motion.div>
        )}

        {tab === "capacitance" && (
          <motion.div key="capacitance" {...motionProps} className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Maxwell Capacitance Matrix" subtitle="Cross-coupling (fF)">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `auto repeat(${CAP_MATRIX.labels.length}, 1fr)` }}
              >
                <div />
                {CAP_MATRIX.labels.map((l) => (
                  <div key={l} className="pb-1 text-center text-2xs font-semibold text-fg-subtle">
                    {l}
                  </div>
                ))}
                {CAP_MATRIX.values.map((row, i) => (
                  <Row key={i} label={CAP_MATRIX.labels[i]} row={row} i={i} />
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Self-Capacitance" subtitle="Diagonal terms per island">
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
          </motion.div>
        )}

        {tab === "coupling" && (
          <motion.div key="coupling" {...motionProps} className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <StatCard label="Max coupling g" value="92" unit="MHz" tone="cyan" icon={<Link2 className="h-[1.1rem] w-[1.1rem]" />} />
              <StatCard label="Min ZZ" value="0.02" unit="MHz" tone="success" icon={<Activity className="h-[1.1rem] w-[1.1rem]" />} />
            </div>
            <ChartCard title="Coupling vs Flux" subtitle="Tunable coupler g and residual ZZ across Φ/Φ₀">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={COUPLING_SWEEP} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
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
          </motion.div>
        )}

        {tab === "sweeps" && (
          <motion.div key="sweeps" {...motionProps} className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Coherence Distribution" subtitle="T₁ / T₂ across the array (µs)">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={COHERENCE} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="qubit" {...axisProps} interval={0} tick={{ fill: CHART.axis, fontSize: 9 }} />
                    <YAxis {...axisProps} unit=" µs" />
                    <RTooltip content={<ChartTooltip unit="µs" />} cursor={{ fill: "rgb(var(--surface-3) / 0.4)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="t1" name="T₁" fill={CHART.primary} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="t2" name="T₂" fill={CHART.cyan} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <Card>
              <div className="px-5 pt-5">
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                  Parameter Sweep
                </h3>
                <p className="text-sm text-fg-subtle">Queue a multi-point sweep</p>
              </div>
              <CardContent className="space-y-4 pt-4">
                <Field label="Parameter">
                  <Select defaultValue="coupler_w">
                    <option value="coupler_w">Coupler width</option>
                    <option value="pad_gap">Pad gap</option>
                    <option value="junction">Junction area</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Start"><Input defaultValue="4" suffix="µm" /></Field>
                  <Field label="Stop"><Input defaultValue="30" suffix="µm" /></Field>
                  <Field label="Steps"><Input defaultValue="14" /></Field>
                </div>
                <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-fg-subtle">
                  <div className="flex items-center justify-between">
                    <span>Estimated runtime</span>
                    <span className="font-mono text-fg">~ 38 min</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span>Solver points</span>
                    <span className="font-mono text-fg">14 × HFSS</span>
                  </div>
                </div>
                <Button className="w-full" icon={<Cpu className="h-4 w-4" />}>
                  Queue Sweep
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Solver runs */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
            Solver Runs
          </h3>
          <Badge tone="cyan" dot>
            {SIM_RUNS.filter((s) => s.status === "running").length} running
          </Badge>
        </div>
        <CardContent className="pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Solver</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Mesh</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {SIM_RUNS.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedRun(s.id)}
                    className={cn(
                      "cursor-pointer border-b border-line/60 transition-colors hover:bg-surface-2",
                      selectedRun === s.id && "bg-primary/[0.06]",
                    )}
                  >
                    <td className="px-3 py-3 font-medium text-fg">{s.name}</td>
                    <td className="px-3 py-3">
                      <Badge tone="neutral">{s.type}</Badge>
                    </td>
                    <td className="px-3 py-3 text-fg-muted">{s.solver}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot
                          tone={
                            s.status === "running" ? "cyan"
                              : s.status === "completed" ? "success"
                              : s.status === "failed" ? "error" : "neutral"
                          }
                          pulse={s.status === "running"}
                        />
                        {s.status === "running" ? (
                          <div className="w-20">
                            <Progress value={s.progress} size="sm" tone="cyan" />
                          </div>
                        ) : (
                          <span className="text-xs capitalize text-fg-muted">{s.status}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-2xs text-fg-subtle">{s.mesh}</td>
                    <td className="px-3 py-3 font-mono text-fg">{s.result ?? "—"}</td>
                    <td className="px-3 py-3 text-right text-2xs text-fg-subtle">{timeAgo(s.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------- Layout validation ---------------------------- */
const VALIDATION_CHECKS = [
  { id: "overlaps", name: "Overlaps", desc: "No components physically overlap", status: "pass" as const, count: 0 },
  { id: "disconnected", name: "Disconnected components", desc: "Every component has a connection", status: "warn" as const, count: 1 },
  { id: "spacing", name: "Spacing violations", desc: "Min gap / qubit spacing respected", status: "pass" as const, count: 0 },
  { id: "geometry", name: "Geometry errors", desc: "Valid, manufacturable geometry", status: "pass" as const, count: 0 },
];

function ValidationTab() {
  const failing = VALIDATION_CHECKS.filter((c) => c.status !== "pass");
  return (
    <div className="space-y-6">
      <Card inset>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div
            className={cn(
              "grid h-12 w-12 place-items-center rounded-2xl",
              failing.length === 0 ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
            )}
          >
            {failing.length === 0 ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              {failing.length === 0 ? "Layout is valid" : `${failing.length} issue${failing.length > 1 ? "s" : ""} to review`}
            </h3>
            <p className="text-sm text-fg-subtle">
              {VALIDATION_CHECKS.length - failing.length}/{VALIDATION_CHECKS.length} checks passed · Falcon-17 / main
            </p>
          </div>
          <div className="ml-auto">
            <Badge tone={failing.length === 0 ? "success" : "warning"} dot>
              {failing.length === 0 ? "Ready to simulate" : "Needs attention"}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {VALIDATION_CHECKS.map((c) => {
          const ok = c.status === "pass";
          return (
            <Card key={c.id}>
              <CardContent className="flex items-start gap-3 pt-5">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    ok ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
                  )}
                >
                  {ok ? <Check className="h-4.5 w-4.5 h-[1.1rem] w-[1.1rem]" strokeWidth={2.5} /> : <X className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.5} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-fg">{c.name}</h4>
                    <Badge tone={ok ? "success" : "warning"}>
                      {ok ? "Pass" : `${c.count} found`}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-subtle">{c.desc}</p>
                  {!ok && (
                    <p className="mt-2 rounded-lg border border-warning/20 bg-warning/[0.07] px-2.5 py-1.5 text-2xs text-warning">
                      Flux Bias Line has no target qubit — connect it before running.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------- Hamiltonian analysis -------------------------- */
function ParamRow({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="font-mono text-xs text-primary">
          {value}
          <span className="text-fg-subtle"> {unit}</span>
        </span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function HamiltonianTab() {
  const [qtype, setQtype] = useState<"transmon" | "fluxonium">("transmon");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-subtle">
          Quantize the circuit Hamiltonian and estimate coherence.
        </p>
        <SegmentedControl
          value={qtype}
          onChange={setQtype}
          size="sm"
          options={[
            { value: "transmon", label: "Transmon" },
            { value: "fluxonium", label: "Fluxonium" },
          ]}
        />
      </div>
      {qtype === "transmon" ? <TransmonPanel /> : <FluxoniumPanel />}
    </div>
  );
}

function FluxoniumPanel() {
  const [ej, setEj] = useState(4.0);
  const [ec, setEc] = useState(1.0);
  const [el, setEl] = useState(0.9);
  const [flux, setFlux] = useState(0.5);

  const levels = useMemo(() => fluxoniumLevels(ej, ec, el, flux, 40), [ej, ec, el, flux]);
  const f01g = levels[1] - levels[0];
  const f12 = levels[2] - levels[1];
  const anh = (f12 - f01g) * 1000; // MHz
  const wp = Math.sqrt(8 * ec * el);
  const eMax = levels[levels.length - 1] || 1;

  const sweep = useMemo(() => {
    const pts: { flux: number; f01: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const fr = i / 24;
      const L = fluxoniumLevels(ej, ec, el, fr, 30);
      pts.push({ flux: Number(fr.toFixed(3)), f01: Number((L[1] - L[0]).toFixed(3)) });
    }
    return pts;
  }, [ej, ec, el]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <div className="px-5 pt-5">
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
            Fluxonium Inputs
          </h3>
          <p className="text-sm text-fg-subtle">Numerical diagonalization</p>
        </div>
        <CardContent className="space-y-4 pt-4">
          <ParamRow label="EJ" value={ej} unit="GHz" min={1} max={15} step={0.1} onChange={setEj} />
          <ParamRow label="EC" value={ec} unit="GHz" min={0.5} max={3} step={0.05} onChange={setEc} />
          <ParamRow label="EL" value={el} unit="GHz" min={0.3} max={2} step={0.05} onChange={setEl} />
          <ParamRow label="Flux Φ/Φ₀" value={flux} unit="" min={0} max={1} step={0.01} onChange={setFlux} />
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
            H = 4·EC·n² + ½·EL·φ² − EJ·cos(φ − 2πΦ/Φ₀), diagonalized in a 40-level
            harmonic basis (scqubits-class model).
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6 lg:col-span-2">
        <Card>
          <div className="px-5 pt-5">
            <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
              Extracted Spectrum
            </h3>
            <p className="text-sm text-fg-subtle">Eigenenergies at Φ/Φ₀ = {flux.toFixed(2)}</p>
          </div>
          <CardContent className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
            <Metric label="f₀₁" value={f01g.toFixed(3)} unit="GHz" tone="primary" />
            <Metric label="Anharmonicity" value={anh.toFixed(0)} unit="MHz" tone="violet" />
            <Metric label="Plasma ω_p" value={wp.toFixed(2)} unit="GHz" tone="cyan" />
            <Metric label="EJ / EC" value={(ej / ec).toFixed(1)} tone="success" />
          </CardContent>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Energy Levels
              </h3>
              <p className="text-sm text-fg-subtle">Lowest 6 eigenstates</p>
            </div>
            <CardContent className="pt-3">
              <svg viewBox="0 0 220 180" className="h-44 w-full">
                {levels.map((e, n) => {
                  const y = 165 - (e / eMax) * 150;
                  return (
                    <g key={n}>
                      <line x1={44} x2={150} y1={y} y2={y} stroke="rgb(var(--violet))" strokeWidth={2} opacity={0.9 - n * 0.1} />
                      <text x={28} y={y + 4} fill="rgb(var(--fg-muted))" fontSize={11} fontFamily="monospace">|{n}⟩</text>
                      <text x={158} y={y + 4} fill="rgb(var(--fg-subtle))" fontSize={9} fontFamily="monospace">{e.toFixed(2)}</text>
                    </g>
                  );
                })}
              </svg>
            </CardContent>
          </Card>

          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                f₀₁ vs Flux
              </h3>
              <p className="text-sm text-fg-subtle">Flux dispersion</p>
            </div>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={sweep} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="flux" {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
                  <YAxis {...axisProps} />
                  <RTooltip content={<ChartTooltip unit="GHz" />} cursor={{ stroke: CHART.grid }} />
                  <ReferenceLine x={0.5} stroke={CHART.violet} strokeDasharray="4 4" />
                  <Line type="monotone" name="f₀₁" dataKey="f01" stroke={CHART.violet} strokeWidth={2.25} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-1 text-center text-2xs text-fg-subtle">
                Sweet spot at Φ/Φ₀ = ½ (first-order flux-noise insensitive)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TransmonPanel() {
  const [cSigma, setCSigma] = useState(80); // fF
  const [cg, setCg] = useState(5.5); // fF
  const [ic, setIc] = useState(30); // nA
  const [fr, setFr] = useState(7.1); // GHz
  const [kappa, setKappa] = useState(1.2); // MHz
  const [tempMk, setTempMk] = useState(20); // mK
  const [qM, setQM] = useState(2); // Q ×1e6

  const CR = 350; // fF — representative resonator capacitance

  const ec = ecFromCapacitance(cSigma);
  const ej = ejFromIc(ic);
  const ratio = ej / ec;
  const f = calcF01(ej, ec);
  const anh = calcAnharm(ec);
  const g = couplingG(cg, cSigma, CR, f, fr);
  const chi = dispersiveShift(g, f, fr, anh);
  const tPurcell = purcellT1(g, f, fr, kappa);
  const tTls = t1FromQ(qM * 1e6, f);
  const t1 = combineT1(tPurcell, tTls);
  const tPhi = 120;
  const t2v = calcT2(t1, tPhi);
  const eps1 = chargeDispersion(1, ej, ec);
  const eps2 = chargeDispersion(2, ej, ec);
  const dispRatio = eps1 > 0 ? eps2 / eps1 : 0;
  const thermal = thermalPopulation(f, tempMk / 1000) * 100;
  const parityRisk = ratio < 65;

  const alphaG = anh / 1000;
  const levels = [0, 1, 2, 3].map((n) => n * f + ((n * (n - 1)) / 2) * alphaG);
  const eMax = levels[3] || 1;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Inputs */}
      <Card>
        <div className="px-5 pt-5">
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
            Design Inputs
          </h3>
          <p className="text-sm text-fg-subtle">Geometry & junction</p>
        </div>
        <CardContent className="space-y-4 pt-4">
          <ParamRow label="Total capacitance Cσ" value={cSigma} unit="fF" min={40} max={160} step={1} onChange={setCSigma} />
          <ParamRow label="Coupling cap Cg" value={cg} unit="fF" min={1} max={15} step={0.1} onChange={setCg} />
          <ParamRow label="Junction Ic" value={ic} unit="nA" min={10} max={60} step={0.5} onChange={setIc} />
          <ParamRow label="Resonator fr" value={fr} unit="GHz" min={5} max={9} step={0.05} onChange={setFr} />
          <ParamRow label="Resonator κ" value={kappa} unit="MHz" min={0.2} max={4} step={0.05} onChange={setKappa} />
          <ParamRow label="Temperature" value={tempMk} unit="mK" min={10} max={120} step={1} onChange={setTempMk} />
          <ParamRow label="Quality factor Q" value={qM} unit="×10⁶" min={0.5} max={6} step={0.1} onChange={setQM} />
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
            Solver: EPR / Lumped-Oscillator Model · linearized eigenmode →
            quantized Hamiltonian.
          </div>
        </CardContent>
      </Card>

      {/* Outputs */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <div className="px-5 pt-5">
            <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
              Extracted Hamiltonian
            </h3>
            <p className="text-sm text-fg-subtle">
              Quantized circuit parameters (EPR / LOM)
            </p>
          </div>
          <CardContent className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
            <Metric label="EC" value={(ec * 1000).toFixed(0)} unit="MHz" tone="cyan" />
            <Metric label="EJ" value={ej.toFixed(2)} unit="GHz" tone="primary" />
            <Metric label="EJ / EC" value={ratio.toFixed(0)} tone={parityRisk ? "warning" : "success"} />
            <Metric label="f₀₁" value={f.toFixed(3)} unit="GHz" tone="primary" />
            <Metric label="Anharmonicity" value={anh.toFixed(0)} unit="MHz" tone="violet" />
            <Metric label="Coupling g" value={g.toFixed(1)} unit="MHz" tone="cyan" />
            <Metric label="Disp. shift χ" value={Math.abs(chi).toFixed(2)} unit="MHz" tone="violet" />
            <Metric label="Thermal n̄" value={thermal.toFixed(2)} unit="%" tone="warning" />
          </CardContent>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Energy ladder */}
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Energy Levels
              </h3>
              <p className="text-sm text-fg-subtle">Transmon spectrum</p>
            </div>
            <CardContent className="pt-3">
              <svg viewBox="0 0 220 180" className="h-44 w-full">
                {levels.map((e, n) => {
                  const y = 165 - (e / eMax) * 150;
                  return (
                    <g key={n}>
                      <line x1={44} x2={150} y1={y} y2={y} stroke="rgb(var(--primary))" strokeWidth={2} opacity={0.9 - n * 0.12} />
                      <text x={28} y={y + 4} fill="rgb(var(--fg-muted))" fontSize={11} fontFamily="monospace">|{n}⟩</text>
                      <text x={158} y={y + 4} fill="rgb(var(--fg-subtle))" fontSize={9} fontFamily="monospace">{e.toFixed(2)}</text>
                    </g>
                  );
                })}
                {/* transition arrows */}
                <g>
                  <line x1={97} x2={97} y1={165} y2={165 - (levels[1] / eMax) * 150} stroke="rgb(var(--cyan))" strokeWidth={1.4} markerEnd="url(#ar)" />
                  <text x={101} y={165 - ((levels[1] / eMax) * 150) / 2} fill="rgb(var(--cyan))" fontSize={9}>f₀₁</text>
                </g>
                <defs>
                  <marker id="ar" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgb(var(--cyan))" />
                  </marker>
                </defs>
              </svg>
              <p className="mt-1 text-center text-2xs text-fg-subtle">
                1→2 spacing = f₀₁ + α ({(f + alphaG).toFixed(3)} GHz)
              </p>
            </CardContent>
          </Card>

          {/* Coherence */}
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Coherence
              </h3>
              <p className="text-sm text-fg-subtle">Estimated lifetimes</p>
            </div>
            <CardContent className="grid grid-cols-2 gap-3 pt-4">
              <Metric label="T₁ (total)" value={fmtUs(t1)} unit="µs" tone="success" />
              <Metric label="T₂" value={fmtUs(t2v)} unit="µs" tone="cyan" />
              <Metric label="Purcell T₁" value={fmtUs(tPurcell)} unit="µs" tone="violet" />
              <Metric label="TLS T₁" value={fmtUs(tTls)} unit="µs" tone="warning" />
              <div className="col-span-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
                <Timer className="h-3.5 w-3.5 shrink-0 text-success" />
                Rates add: 1/T₁ = 1/T₁ᴾᵘʳᶜᵉˡˡ + 1/T₁ᵀᴸˢ
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charge dispersion / parity-switching */}
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Charge Dispersion & Parity-Switching
              </h3>
              <p className="text-sm text-fg-subtle">|2⟩-level error driver for CZ gates</p>
            </div>
            {parityRisk ? (
              <Badge tone="warning"><AlertTriangle className="mr-1 h-3 w-3" /> EJ/EC &lt; 65</Badge>
            ) : (
              <Badge tone="success" dot>parity-safe</Badge>
            )}
          </div>
          <CardContent className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
            <Metric label="ε₁ (|1⟩)" value={eps1 < 1 ? eps1.toFixed(3) : eps1.toFixed(1)} unit="MHz" tone="cyan" />
            <Metric label="ε₂ (|2⟩)" value={eps2 < 1 ? eps2.toFixed(3) : eps2.toFixed(1)} unit="MHz" tone="violet" />
            <Metric label="ε₂ / ε₁" value={`${dispRatio.toFixed(0)}×`} tone={dispRatio > 30 ? "warning" : "success"} />
            <Metric label="Temperature" value={`${tempMk}`} unit="mK" tone="warning" />
            <div className="col-span-2 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle sm:col-span-4">
              <Thermometer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              The |2⟩ charge dispersion is ~{dispRatio.toFixed(0)}× larger than |1⟩. Because CZ gates traverse the |02⟩ level, parity switches become the dominant charge-dispersion error of the two-qubit gate for EJ/EC ≲ 65 (IQM 2024).
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="px-5 pt-5">
        <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
          {title}
        </h3>
        {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Row({ label, row, i }: { label: string; row: number[]; i: number }) {
  const max = 320;
  return (
    <>
      <div className="flex items-center pr-1 text-2xs font-semibold text-fg-subtle">
        {label}
      </div>
      {row.map((v, j) => {
        const alpha = Math.min(0.85, 0.06 + (v / max) * 1.1);
        const isDiag = i === j;
        return (
          <div
            key={j}
            className={cn(
              "grid aspect-square place-items-center rounded-md font-mono text-2xs tabular-nums",
              isDiag ? "text-fg ring-1 ring-primary/40" : "text-fg-muted",
            )}
            style={{
              backgroundColor: isDiag
                ? `rgb(var(--primary) / ${alpha})`
                : `rgb(var(--cyan) / ${alpha})`,
            }}
            title={`${label}–C${j}: ${v} fF`}
          >
            {v.toFixed(v < 10 ? 1 : 0)}
          </div>
        );
      })}
    </>
  );
}
