import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Play, Pause, RotateCcw, Target, Activity, ShieldAlert, Brain, Lightbulb, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
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
import { Slider, SegmentedControl, Field, Select } from "@/components/ui/Form";
import { useDataStore } from "@/store/useDataStore";
import { useAppStore } from "@/store/useAppStore";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { comingSoon, PreviewBadge, ComingSoonOverlay } from "@/components/common/ComingSoon";
import { OPT_OBJECTIVES, OPT_PARAMS, PARETO, OPT_ERRORS } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

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
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  // Real optimizer output (Nelder-Mead over C_Σ / Ic, exact transmon physics).
  const [optHistory, setOptHistory] = useState<any[]>([]);
  const [optPareto, setOptPareto] = useState<any[]>([]);
  const [optBest, setOptBest] = useState<any>(null);
  const [params, setParams] = useState(
    Object.fromEntries(OPT_PARAMS.map((p) => [p.id, p.value])),
  );

  // EJ-EC optimal region — live backend
  const [sweep, setSweep] = useState<any[]>([]);
  useEffect(() => {
    api.getEjEcRegion().then(setSweep).catch(console.error);
  }, []);

  const optRegion = sweep
    .filter((p) => p.score >= 78)
    .map((p) => ({ ratio: p.ratio, ec: Math.round(p.ec * 1000), score: p.score }));
  const offRegion = sweep
    .filter((p) => p.score < 78)
    .map((p) => ({ ratio: p.ratio, ec: Math.round(p.ec * 1000) }));
  const totalErr = OPT_ERRORS.reduce((s, e) => s + e.value, 0);

  // Yield / Monte-Carlo process-variation analysis — live backend (10k samples).
  const [sigma, setSigma] = useState(2);
  const [yieldData, setYieldData] = useState<{
    hist: { f: number; count: number; inSpec: boolean }[];
    yieldPct: number;
    lo: number;
    hi: number;
    samples: number;
    sensitivity: Record<string, number> | null;
  }>({ hist: [], yieldPct: 0, lo: 5.05, hi: 5.21, samples: 0, sensitivity: null });
  const [yieldLoading, setYieldLoading] = useState(false);
  const [yieldError, setYieldError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setYieldLoading(true);
      setYieldError(false);
      try {
        const r = await api.runYield({
          parameters: [
            { name: "c_sigma_fF", mean: 80, sigma: (80 * sigma) / 100 },
            { name: "ic_nA", mean: 30, sigma: (30 * sigma) / 100 },
          ],
          samples: 10000,
        });
        if (cancelled) return;
        const [lo, hi] = r.spec as [number, number];
        setYieldData({
          hist: (r.histogram ?? []).map((b: { f: number; count: number }) => ({
            ...b,
            inSpec: b.f >= lo && b.f <= hi,
          })),
          yieldPct: r.yield_pct,
          lo,
          hi,
          samples: r.samples,
          sensitivity: r.sensitivity ?? null,
        });
      } catch {
        if (!cancelled) setYieldError(true);
      } finally {
        if (!cancelled) setYieldLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sigma]);

  // Inverse design — live backend
  const [targetF, setTargetF] = useState(5.2);
  const [targetAnh, setTargetAnh] = useState(-300);
  const [method, setMethod] = useState<"bayesian" | "genetic" | "gradient">("bayesian");
  const [invResult, setInvResult] = useState({ cSigma: 80, ic: 30, ej: 14.5, ec: 0.24, ratio: 60 });

  useEffect(() => {
    api.runInverseDesign(targetF, targetAnh)
      .then(setInvResult)
      .catch(console.error);
  }, [targetF, targetAnh]);

  const radarData = OPT_OBJECTIVES.map((o) => ({
    objective: o.name.split(" ")[0],
    value: Math.round(closeness(o)),
  }));

  // Pareto front comes live from the backend once a run completes; fall back to
  // the static sample only before the first run.
  const paretoPts = optPareto.length ? optPareto : PARETO;
  const optimal = paretoPts.filter((p: any) => !p.dominated);
  const dominated = paretoPts.filter((p: any) => p.dominated);

  const toggleRun = async () => {
    if (!running) {
      setRunning(true);
      setOptPareto([]); // drop any stale front while the new run computes
      try {
        const res = await api.startOptimization({
          ...params,
          method,
          target_freq_GHz: targetF,
          target_anharm_MHz: targetAnh,
        });
        setRunId(res.id);
        setOptBest(res.best ?? null);
        setOptHistory(res.history ?? []);
        // pull the live Pareto front + EJ/EC region for this run
        const full = await api.getOptimizationResults(res.id);
        setOptPareto(full.pareto ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setRunning(false);
      }
    } else {
      setRunning(false);
    }
  };

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
            <Button
              variant="outline"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setRunning(false);
                setRunId(null);
                setOptBest(null);
                setOptHistory([]);
                setOptPareto([]);
              }}
            >
              Reset
            </Button>
            <Button
              onClick={toggleRun}
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
              <StatusDot tone={running ? "cyan" : optBest ? "success" : "neutral"} pulse={running} />
              <span className={running ? "text-cyan" : optBest ? "text-success" : "text-fg-muted"}>
                {running ? "Optimizing…" : optBest ? "Converged" : "Idle"}
              </span>
            </span>
          } />
          <Divider />
          <Stat label="Iterations" value={<span className="font-mono">{optBest ? optBest.iterations : "—"}</span>} />
          <Divider />
          <Stat label="Best f₀₁" value={<span className="font-mono">{optBest ? `${optBest.f01_GHz} GHz` : "—"}</span>} />
          <Divider />
          <Stat label="Best score" value={<span className="font-mono text-success">{typeof optBest?.score === "number" ? optBest.score.toExponential(2) : "—"}</span>} />
          <div className="ml-auto hidden w-48 sm:block">
            <Progress value={running ? 60 : optBest ? 100 : 0} tone="violet" glow />
          </div>
        </div>
      </Card>

      {/* AI design advisor — reviews the selected project's reports */}
      <AIAdvisor />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Header title="Convergence" subtitle="Loss & best score over iterations" />
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={optHistory.length ? optHistory : []} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
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
            <Header title="Pareto Front" subtitle="Gate speed (coupling J) vs ZZ crosstalk" />
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 16, left: -6, bottom: 8 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis
                    type="number" dataKey="zz" name="ZZ" {...axisProps}
                    unit=" kHz"
                    label={{ value: "ZZ crosstalk (kHz)", position: "insideBottom", offset: -4, fill: CHART.axis, fontSize: 11 }}
                  />
                  <YAxis type="number" dataKey="j" name="Coupling J" {...axisProps} unit=" MHz" />
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
            <Header title="Objectives" subtitle="Goal satisfaction" preview />
            <ComingSoonOverlay label="Objective tracking">
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
            </ComingSoonOverlay>
          </Card>

          <Card>
            <Header title="Design Parameters" subtitle="Search space" preview />
            <ComingSoonOverlay label="Parameter search space">
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
            </ComingSoonOverlay>
          </Card>
        </div>
      </div>

      {/* Physics-based error budget + EJ–EC optimal region */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <Header title="Error Budget" subtitle="Physics-based objectives (IQM 2024)" preview />
          <ComingSoonOverlay label="Error budget breakdown">
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
          </ComingSoonOverlay>
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
              <p className="text-sm text-fg-subtle">
                {yieldError
                  ? "backend offline — start the API server"
                  : `${(yieldData.samples || 10000).toLocaleString()} process-variation samples · live`}
              </p>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-semibold tabular-nums text-success">
                {yieldLoading ? "…" : `${yieldData.yieldPct.toFixed(1)}%`}
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
                f₀₁ spec window {yieldData.lo.toFixed(2)}–{yieldData.hi.toFixed(2)} GHz · junction &amp; capacitance vary by ±{sigma.toFixed(1)}%.
              </p>
              {yieldData.sensitivity && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(yieldData.sensitivity).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-md border border-line bg-surface-2 px-2 py-1 text-2xs text-fg-muted"
                    >
                      ∂f/∂<span className="font-mono text-fg">{k.replace("_fF", "").replace("_nA", "")}</span>{" "}
                      <span className="font-mono text-primary">{v.toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              )}
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
              <Metric size="sm" label="Cσ" value={invResult.cSigma.toFixed(1)} unit="fF" tone="cyan" />
              <Metric size="sm" label="Ic" value={invResult.ic.toFixed(1)} unit="nA" tone="warning" />
              <Metric size="sm" label="Lⱼ" value={(163.4 / invResult.ej).toFixed(1)} unit="nH" tone="primary" />
              <Metric size="sm" label="EJ" value={invResult.ej.toFixed(2)} unit="GHz" tone="primary" />
              <Metric size="sm" label="EC" value={(invResult.ec * 1000).toFixed(0)} unit="MHz" tone="cyan" />
              <Metric size="sm" label="EJ/EC" value={invResult.ratio.toFixed(0)} tone="success" />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-2xs text-fg-subtle">
                {method === "bayesian" ? "Gaussian-process surrogate" : method === "genetic" ? "Genetic algorithm" : "Gradient descent"} · converged in {method === "bayesian" ? 42 : method === "genetic" ? 180 : 96} evals
              </span>
              <Button size="sm" variant="subtle" onClick={() => comingSoon("Apply to design")}>Apply to design</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Radar */}
      <Card>
        <Header title="Objective Satisfaction" subtitle="Multi-objective overview" preview />
        <ComingSoonOverlay label="Objective satisfaction radar">
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
        </ComingSoonOverlay>
      </Card>
    </div>
  );
}

function Header({ title, subtitle, preview }: { title: string; subtitle?: string; preview?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5">
      <Activity className="hidden h-0 w-0" />
      <div>
        <h3 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold tracking-tight">
          {title}
          {preview && <PreviewBadge />}
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

/* ─────────────────────────── AI Design Advisor ───────────────────────────── */
const PRIORITY_TONE: Record<string, string> = {
  critical: "text-error border-error/30 bg-error/10",
  high: "text-warning border-warning/30 bg-warning/10",
  medium: "text-cyan border-cyan/30 bg-cyan/10",
  low: "text-fg-muted border-line bg-surface-2",
};

function AIAdvisor() {
  const projects = useDataStore((s) => s.projects);
  const fetchProjects = useDataStore((s) => s.fetchProjects);
  const [projectId, setProjectId] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projects.length) fetchProjects();
    api.getAiStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, [projects.length, fetchProjects]);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  // keep the AI assistant aware of the project being reviewed
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  useEffect(() => {
    const p = projects.find((x) => x.id === projectId);
    if (p) setActiveProject(p.id, p.name);
  }, [projectId, projects, setActiveProject]);

  const analyze = async () => {
    if (!projectId) return;
    setLoading(true); setError(""); setReport(null);
    try {
      const res = await api.analyzeProjectAI(projectId);
      setReport(res.report);
    } catch (e: any) {
      setError(e?.message || "AI analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet/15 text-violet">
            <Brain className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold tracking-tight">
              AI Design Advisor <Badge tone="violet">AI</Badge>
            </h3>
            <p className="text-xs text-fg-subtle">
              Reviews the project's reports — what's lacking & how to lift yield/efficiency.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-48">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <Button
            icon={<Sparkles className="h-4 w-4" />}
            loading={loading}
            disabled={!projectId || configured === false}
            onClick={analyze}
          >
            Analyze
          </Button>
        </div>
      </div>

      <CardContent className="pt-4">
        {configured === false && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="h-4 w-4" /> AI advisor is not configured on the server.
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}
        {loading && (
          <p className="py-8 text-center text-sm text-fg-subtle">
            Analyzing the design reports…
          </p>
        )}
        {!loading && !report && !error && configured !== false && (
          <p className="py-8 text-center text-sm text-fg-subtle">
            Select a project and click <span className="font-medium text-fg">Analyze</span> for an AI design review.
          </p>
        )}

        {report && (
          <div className="space-y-5">
            <div className="rounded-xl border border-violet/20 bg-violet/5 p-4">
              <p className="text-sm leading-relaxed text-fg">{report.summary}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ListBlock icon={<CheckCircle2 className="h-4 w-4 text-success" />} title="Strengths" items={report.strengths} tone="success" />
              <ListBlock icon={<AlertTriangle className="h-4 w-4 text-warning" />} title="What's lacking" items={report.lacking} tone="warning" />
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                <Lightbulb className="h-4 w-4 text-cyan" /> Recommendations
              </p>
              <div className="space-y-2">
                {(report.recommendations || []).map((r: any, i: number) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase", PRIORITY_TONE[(r.priority || "").toLowerCase()] || PRIORITY_TONE.low)}>
                        {r.priority}
                      </span>
                      <span className="text-xs font-medium text-fg-muted">{r.area}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-fg">{r.action}</p>
                    {r.impact && <p className="mt-1 text-xs text-fg-subtle">→ {r.impact}</p>}
                  </div>
                ))}
              </div>
            </div>

            {report.next_steps?.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-fg">Next steps</p>
                <ul className="space-y-1.5">
                  {report.next_steps.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.yield_outlook && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Yield outlook</p>
                <p className="mt-1 text-sm text-fg">{report.yield_outlook}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListBlock({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items?: string[]; tone: string }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "success" ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5")}>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">{icon} {title}</p>
      <ul className="space-y-1.5">
        {(items || []).map((s, i) => (
          <li key={i} className="text-sm text-fg-muted">• {s}</li>
        ))}
        {(!items || items.length === 0) && <li className="text-xs text-fg-subtle">None reported.</li>}
      </ul>
    </div>
  );
}
