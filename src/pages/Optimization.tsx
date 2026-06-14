import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Play, Pause, RotateCcw, Target, Activity, ShieldAlert } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Cell,
  BarChart,
  Bar,
  ReferenceLine,
  Tooltip as RTooltip,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Metric } from "@/components/common/Metric";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Slider, SegmentedControl, Field } from "@/components/ui/Form";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { OPT_OBJECTIVES, OPT_PARAMS, OPT_HISTORY, PARETO, OPT_ERRORS } from "@/data/mockData";
import {
  sweepEjEc,
  ecFromCapacitance,
  ejFromIc,
  f01 as calcF01,
  designForTarget,
} from "@/lib/quantum";
import { cn, seeded } from "@/lib/utils";

const dirTone = { min: "cyan", max: "success", target: "primary" } as const;

/** Closeness of current value to goal, 0..100. */
function closeness(o: (typeof OPT_OBJECTIVES)[number]) {
  if (o.direction === "min") {
    return Math.max(0, Math.min(100, (o.goal / Math.max(o.current, 0.0001)) * 100));
  }
  if (o.direction === "max") {
    return Math.max(0, Math.min(100, (o.current / o.goal) * 100));
  }
  // target: how close current is to goal
  const span = Math.abs(o.goal) || 1;
  const err = Math.abs(o.current - o.goal) / span;
  return Math.max(0, Math.min(100, (1 - err) * 100));
}

export default function Optimization() {
  const [running, setRunning] = useState(true);
  const [params, setParams] = useState(
    Object.fromEntries(OPT_PARAMS.map((p) => [p.id, p.value])),
  );

  const sweep = useMemo(() => sweepEjEc({ tunable: true }), []);
  const optRegion = sweep
    .filter((p) => p.score >= 78)
    .map((p) => ({ ratio: p.ratio, ec: Math.round(p.ec * 1000), score: p.score }));
  const offRegion = sweep
    .filter((p) => p.score < 78)
    .map((p) => ({ ratio: p.ratio, ec: Math.round(p.ec * 1000) }));
  const totalErr = OPT_ERRORS.reduce((s, e) => s + e.value, 0);

  // Yield / Monte-Carlo process-variation analysis
  const [sigma, setSigma] = useState(2);
  const yieldData = useMemo(() => {
    const r = seeded(7919);
    const gauss = () => {
      let u = 0, v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const s = sigma / 100;
    const fs: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const c = 80 * (1 + s * gauss());
      const ic = 30 * (1 + s * gauss());
      fs.push(calcF01(ejFromIc(ic), ecFromCapacitance(c)));
    }
    const lo = 5.05, hi = 5.21;
    const inSpec = fs.filter((f) => f >= lo && f <= hi).length;
    const bins = 28, fMin = 4.75, fMax = 5.55, w = (fMax - fMin) / bins;
    const hist = Array.from({ length: bins }, (_, i) => {
      const f = fMin + (i + 0.5) * w;
      return { f: Number(f.toFixed(3)), count: 0, inSpec: f >= lo && f <= hi };
    });
    fs.forEach((f) => {
      const idx = Math.floor((f - fMin) / w);
      if (idx >= 0 && idx < bins) hist[idx].count++;
    });
    return { hist, yieldPct: (inSpec / fs.length) * 100, lo, hi };
  }, [sigma]);

  // Inverse design
  const [targetF, setTargetF] = useState(5.2);
  const [targetAnh, setTargetAnh] = useState(-300);
  const [method, setMethod] = useState<"bayesian" | "genetic" | "gradient">("bayesian");
  const design = designForTarget(targetF, targetAnh);

  const radarData = OPT_OBJECTIVES.map((o) => ({
    objective: o.name.split(" ")[0],
    value: Math.round(closeness(o)),
  }));

  const optimal = PARETO.filter((p) => !p.dominated);
  const dominated = PARETO.filter((p) => p.dominated);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            Optimization Engine
            <Badge tone="violet">AI</Badge>
          </span>
        }
        subtitle="Goal-driven, multi-objective parameter tuning."
        icon={<Sparkles className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />}>
              Reset
            </Button>
            <Button
              onClick={() => setRunning((r) => !r)}
              variant={running ? "secondary" : "primary"}
              icon={running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            >
              {running ? "Pause" : "Start"}
            </Button>
          </>
        }
      />

      {/* Status strip */}
      <Card inset>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <Stat label="Status" value={
            <span className="flex items-center gap-2">
              <StatusDot tone={running ? "cyan" : "neutral"} pulse={running} />
              <span className={running ? "text-cyan" : "text-fg-muted"}>
                {running ? "Optimizing…" : "Paused"}
              </span>
            </span>
          } />
          <Divider />
          <Stat label="Iteration" value={<span className="font-mono">60 / 200</span>} />
          <Divider />
          <Stat label="Elapsed" value={<span className="font-mono">4m 12s</span>} />
          <Divider />
          <Stat label="Best score" value={<span className="font-mono text-success">0.0127</span>} />
          <div className="ml-auto hidden w-48 sm:block">
            <Progress value={30} tone="violet" glow />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Header title="Convergence" subtitle="Loss & best score over iterations" />
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={OPT_HISTORY} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="best-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="iter" {...axisProps} />
                  <YAxis {...axisProps} />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                  <Line type="monotone" name="Loss" dataKey="loss" stroke={CHART.cyan} strokeWidth={1.5} strokeOpacity={0.6} dot={false} />
                  <Area type="monotone" name="Best" dataKey="best" stroke={CHART.primary} strokeWidth={2.5} fill="url(#best-fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <Header title="Pareto Front" subtitle="ZZ crosstalk vs anharmonicity tradeoff" />
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 16, left: -6, bottom: 8 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis
                    type="number" dataKey="zz" name="ZZ" {...axisProps}
                    unit=" kHz"
                    label={{ value: "ZZ crosstalk (kHz)", position: "insideBottom", offset: -4, fill: CHART.axis, fontSize: 11 }}
                  />
                  <YAxis type="number" dataKey="anharm" name="Anharm" {...axisProps} unit=" MHz" />
                  <ZAxis range={[60, 60]} />
                  <RTooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Dominated" data={dominated} fill={CHART.axis} fillOpacity={0.35} />
                  <Scatter name="Optimal" data={optimal} fill={CHART.primary}>
                    {optimal.map((_, i) => (
                      <Cell key={i} fill={CHART.primary} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-6">
          <Card>
            <Header title="Objectives" subtitle="Goal satisfaction" />
            <CardContent className="space-y-4 pt-4">
              {OPT_OBJECTIVES.map((o) => {
                const c = closeness(o);
                return (
                  <div key={o.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 text-fg-subtle" />
                        <span className="text-sm font-medium text-fg">{o.name}</span>
                      </div>
                      <Badge tone={dirTone[o.direction]}>{o.direction}</Badge>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-2xs text-fg-subtle">
                      <span>
                        cur <span className="text-fg">{o.current}{o.unit}</span>
                      </span>
                      <span>
                        goal <span className="text-fg">{o.goal}{o.unit}</span>
                      </span>
                    </div>
                    <div className="mt-2">
                      <Progress
                        value={c}
                        size="sm"
                        tone={c > 85 ? "success" : c > 60 ? "primary" : "warning"}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <Header title="Design Parameters" subtitle="Search space" />
            <CardContent className="space-y-5 pt-4">
              {OPT_PARAMS.map((p) => (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-fg">{p.name}</span>
                    <span className="font-mono text-xs text-primary">
                      {params[p.id]}
                      <span className="text-fg-subtle"> {p.unit}</span>
                    </span>
                  </div>
                  <Slider
                    value={params[p.id]}
                    min={p.min}
                    max={p.max}
                    step={(p.max - p.min) / 100}
                    onChange={(v) =>
                      setParams((s) => ({ ...s, [p.id]: Number(v.toFixed(3)) }))
                    }
                  />
                  <div className="mt-1 flex justify-between font-mono text-2xs text-fg-subtle">
                    <span>{p.min}</span>
                    <span>{p.max}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Physics-based error budget + EJ–EC optimal region */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <Header title="Error Budget" subtitle="Physics-based objectives (IQM 2024)" />
          <CardContent className="space-y-3.5 pt-4">
            {OPT_ERRORS.map((e) => (
              <div key={e.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-fg">{e.name}</span>
                  <span className="font-mono text-xs text-fg-muted">
                    {e.value.toFixed(1)}
                    <span className="text-fg-subtle"> ×10⁻³</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <Progress
                    value={(e.value / 3) * 100}
                    size="sm"
                    tone={e.value > 2 ? "warning" : e.value > 1.2 ? "primary" : "success"}
                  />
                </div>
                <p className="mt-1 text-2xs text-fg-subtle">{e.note}</p>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="font-medium text-fg">Total gate error</span>
              <span className="font-mono text-primary">{totalErr.toFixed(1)} ×10⁻³</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Optimal Region — EJ/EC space
              </h3>
              <p className="text-sm text-fg-subtle">The optimum is a region, not a point</p>
            </div>
            <Badge tone="primary">
              <ShieldAlert className="mr-1 h-3 w-3" /> region
            </Badge>
          </div>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 10, right: 16, left: -4, bottom: 8 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number" dataKey="ratio" name="EJ/EC" {...axisProps} domain={[30, 120]}
                  label={{ value: "EJ / EC", position: "insideBottom", offset: -4, fill: CHART.axis, fontSize: 11 }}
                />
                <YAxis type="number" dataKey="ec" name="EC" unit=" MHz" {...axisProps} />
                <RTooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter name="Sub-optimal" data={offRegion} fill={CHART.axis} fillOpacity={0.22} />
                <Scatter name="Optimal" data={optRegion} fill={CHART.primary} fillOpacity={0.9} />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="mt-2 text-2xs text-fg-subtle">
              Highlighted points jointly minimize all five error terms; EJ/EC ≲ 65 is penalized by parity-switching.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Yield Monte-Carlo + Inverse design */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Yield — Monte-Carlo
              </h3>
              <p className="text-sm text-fg-subtle">3,000 process-variation samples</p>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-semibold tabular-nums text-success">
                {yieldData.yieldPct.toFixed(1)}%
              </div>
              <p className="text-2xs text-fg-subtle">in-spec yield</p>
            </div>
          </div>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yieldData.hist} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="f" {...axisProps} tickFormatter={(v) => v.toFixed(2)} interval={5} />
                <YAxis {...axisProps} />
                <RTooltip content={<ChartTooltip unit="GHz" />} cursor={{ fill: "rgb(var(--surface-3) / 0.4)" }} />
                <ReferenceLine x={yieldData.lo} stroke={CHART.success} strokeDasharray="4 4" />
                <ReferenceLine x={yieldData.hi} stroke={CHART.success} strokeDasharray="4 4" />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {yieldData.hist.map((b, i) => (
                    <Cell key={i} fill={b.inSpec ? CHART.primary : CHART.axis} fillOpacity={b.inSpec ? 0.95 : 0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-fg">Process spread (1σ)</span>
                <span className="font-mono text-xs text-primary">±{sigma.toFixed(1)}%</span>
              </div>
              <Slider value={sigma} min={0.5} max={6} step={0.1} onChange={setSigma} />
              <p className="mt-2 text-2xs text-fg-subtle">
                f₀₁ spec window 5.05–5.21 GHz · junction & capacitance vary by ±{sigma.toFixed(1)}%.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Inverse Design
              </h3>
              <p className="text-sm text-fg-subtle">Target spec → device parameters</p>
            </div>
            <SegmentedControl
              size="sm"
              value={method}
              onChange={setMethod}
              options={[
                { value: "bayesian", label: "Bayesian" },
                { value: "genetic", label: "GA" },
                { value: "gradient", label: "Grad" },
              ]}
            />
          </div>
          <CardContent className="space-y-4 pt-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-fg">Target f₀₁</span>
                <span className="font-mono text-xs text-primary">{targetF.toFixed(2)} GHz</span>
              </div>
              <Slider value={targetF} min={3.5} max={6} step={0.01} onChange={setTargetF} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-fg">Target anharmonicity</span>
                <span className="font-mono text-xs text-violet">{targetAnh.toFixed(0)} MHz</span>
              </div>
              <Slider value={targetAnh} min={-360} max={-150} step={1} onChange={setTargetAnh} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric size="sm" label="Cσ" value={design.cSigma.toFixed(1)} unit="fF" tone="cyan" />
              <Metric size="sm" label="Ic" value={design.ic.toFixed(1)} unit="nA" tone="warning" />
              <Metric size="sm" label="Lⱼ" value={(163.4 / design.ej).toFixed(1)} unit="nH" tone="primary" />
              <Metric size="sm" label="EJ" value={design.ej.toFixed(2)} unit="GHz" tone="primary" />
              <Metric size="sm" label="EC" value={(design.ec * 1000).toFixed(0)} unit="MHz" tone="cyan" />
              <Metric size="sm" label="EJ/EC" value={design.ratio.toFixed(0)} tone="success" />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-2xs text-fg-subtle">
                {method === "bayesian" ? "Gaussian-process surrogate" : method === "genetic" ? "Genetic algorithm" : "Gradient descent"} · converged in {method === "bayesian" ? 42 : method === "genetic" ? 180 : 96} evals
              </span>
              <Button size="sm" variant="subtle">Apply to design</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Radar */}
      <Card>
        <Header title="Objective Satisfaction" subtitle="Multi-objective overview" />
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke={CHART.grid} />
              <PolarAngleAxis dataKey="objective" tick={{ fill: CHART.axis, fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 10 }} axisLine={false} />
              <RTooltip content={<ChartTooltip unit="%" />} />
              <Radar name="Satisfaction" dataKey="value" stroke={CHART.primary} strokeWidth={2} fill={CHART.primary} fillOpacity={0.22} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5">
      <Activity className="hidden h-0 w-0" />
      <div>
        <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
          {title}
        </h3>
        {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-fg">{value}</p>
    </div>
  );
}

function Divider() {
  return <div className="hidden h-8 w-px bg-line sm:block" />;
}

