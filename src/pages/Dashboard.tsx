import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  Play,
  Cpu,
  Activity,
  Gauge as GaugeIcon,
  Sparkles,
  GitCommit,
  CheckCircle2,
  MessageCircle,
  Workflow,
  ArrowRight,
  Download,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Card, CardContent, GlowCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { AvatarGroup } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/Form";
import { StatCard } from "@/components/common/StatCard";
import { Sparkline } from "@/components/common/Sparkline";
import { LogoMark } from "@/components/common/Logo";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { PROJECT_STATUS_TONE } from "@/data/mockData";
import { useAppStore } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const activityIcon: Record<string, { icon: typeof Activity; tone: string }> = {
  sim: { icon: Activity, tone: "text-cyan bg-cyan/12" },
  commit: { icon: GitCommit, tone: "text-primary bg-primary/12" },
  review: { icon: CheckCircle2, tone: "text-warning bg-warning/12" },
  optimize: { icon: Sparkles, tone: "text-violet bg-violet/12" },
  comment: { icon: MessageCircle, tone: "text-fg-muted bg-surface-3" },
  design: { icon: Workflow, tone: "text-primary bg-primary/12" },
};

// Solver-queue status → visual tone.
const QUEUE_TONE: Record<string, "cyan" | "success" | "error" | "neutral"> = {
  running: "cyan", done: "success", failed: "error", canceled: "neutral", queued: "neutral",
};

const fade = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  }),
};

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
});

/* Guided getting-started panel — a dismissible, always-helpful "what to do next"
   strip so users (esp. first-timers) are never lost. Step 1 auto-completes once a
   design exists; the rest link straight into the workflow. */
function GettingStarted({ hasDesign, onNewDesign, navigate }: {
  hasDesign: boolean;
  onNewDesign: () => void;
  navigate: (to: string) => void;
}) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("qrivara:gs-dismissed") === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const dismiss = () => {
    try { localStorage.setItem("qrivara:gs-dismissed", "1"); } catch { /* ignore */ }
    setDismissed(true);
  };
  const steps = [
    { icon: Workflow, label: "Design your chip", hint: "Drag components or generate with AI", action: onNewDesign, cta: "New Design", done: hasDesign },
    { icon: Activity, label: "Simulate", hint: "Capacitance, T1/T2, gates, yield — real physics", action: () => navigate("/app/simulation"), cta: "Open" },
    { icon: Sparkles, label: "Optimize", hint: "Hit your target frequency & fidelity", action: () => navigate("/app/optimization"), cta: "Open" },
    { icon: Download, label: "Export", hint: "GDS-II, SPICE, or a Qiskit digital twin", action: () => navigate("/app/results"), cta: "Open" },
  ];
  return (
    <Card inset>
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/12 text-primary">
            <Workflow className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-fg">Getting started</h3>
            <p className="text-2xs text-fg-subtle">Four steps from idea to fab-ready — follow them in order.</p>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex flex-col rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-2xs font-bold",
                  s.done ? "bg-success/15 text-success" : "bg-surface-3 text-fg-subtle")}>
                  {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <Icon className="h-4 w-4 text-fg-muted" />
                <span className="text-sm font-semibold text-fg">{s.label}</span>
              </div>
              <p className="mt-1.5 flex-1 text-2xs text-fg-subtle">{s.hint}</p>
              <button onClick={s.action} className="mt-2.5 inline-flex items-center gap-1 self-start text-xs font-semibold text-primary transition-colors hover:text-primary/80">
                {s.done ? "Add another" : s.cta} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function welcomeLine(s: any): string {
  if (!s || s.total_projects === 0) {
    return "Your quantum workspace is ready. Create a design to get started.";
  }
  const parts = [`${s.active_projects} project${s.active_projects === 1 ? "" : "s"} active`];
  if (s.running) parts.push(`${s.running} simulation${s.running === 1 ? "" : "s"} running`);
  else if (s.queued) parts.push(`${s.queued} queued`);
  if (s.optimizations) parts.push(`${s.optimizations} optimization${s.optimizations === 1 ? "" : "s"}`);
  return `Your quantum workspace is online — ${parts.join(", ")}.`;
}

export default function Dashboard() {
  const [range, setRange] = useState<"14d" | "30d" | "90d">("14d");
  const navigate = useNavigate();
  const setNewDesignOpen = useAppStore((s) => s.setNewDesignOpen);
  const PROJECTS = useDataStore((s) => s.projects);
  const fetchProjects = useDataStore((s) => s.fetchProjects);
  const firstName = (useAppStore((s) => s.profile.name) || "").split(" ")[0] || "there";
  const userTick = useAuthStore((s) => s.userTick);

  // Load real projects from the backend (don't rely on another page having done it).
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, userTick]);

  const [data, setData] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Refetch on range change / user switch; `alive` guards against an earlier
  // request finishing after a later one (rapid range toggles).
  useEffect(() => {
    let alive = true;
    setLoadingDash(true);
    api.getDashboard(parseInt(range, 10))
      .then((d) => alive && setData(d))
      .catch(() => {})
      .finally(() => alive && setLoadingDash(false));
    return () => { alive = false; };
  }, [range, userTick]);

  useEffect(() => {
    let alive = true;
    setLoadingActivities(true);
    api.getActivity()
      .then((d) => alive && setActivities(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => alive && setLoadingActivities(false));
    return () => { alive = false; };
  }, [userTick]);

  const k = data?.kpis;
  const num = (v: any) => (typeof v === "number" ? v : v == null ? "—" : v);
  const kpiCards = [
    {
      label: "Active Qubits", tone: "primary" as const, icon: <Cpu className="h-[1.1rem] w-[1.1rem]" />,
      value: num(k?.active_qubits?.value), delta: k?.active_qubits?.delta ?? undefined,
      spark: k?.active_qubits?.spark ?? [],
    },
    {
      label: "Simulations Today", tone: "cyan" as const, icon: <Activity className="h-[1.1rem] w-[1.1rem]" />,
      value: num(k?.simulations_today?.value), delta: k?.simulations_today?.delta ?? undefined,
      spark: k?.simulations_today?.spark ?? [],
    },
    {
      label: "Avg Gate Fidelity", tone: "success" as const, icon: <GaugeIcon className="h-[1.1rem] w-[1.1rem]" />,
      value: num(k?.avg_gate_fidelity?.value), unit: k?.avg_gate_fidelity?.value != null ? "%" : undefined,
      subtitle: k?.avg_gate_fidelity?.subtitle, spark: k?.avg_gate_fidelity?.spark ?? [],
    },
    {
      label: "Optimization Gain", tone: "violet" as const, icon: <Sparkles className="h-[1.1rem] w-[1.1rem]" />,
      value: num(k?.optimization_gain?.value), unit: k?.optimization_gain?.value != null ? "%" : undefined,
      subtitle: k?.optimization_gain?.subtitle, spark: k?.optimization_gain?.spark ?? [],
    },
  ];

  const queue = data?.solver_queue ?? [];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <GlowCard className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-0 bg-radial-fade opacity-100" />
          <div className="absolute -right-10 -top-10 hidden opacity-[0.07] sm:block">
            <LogoMark size={220} className="animate-spin-slow" />
          </div>
          <div className="relative">
            <p className="text-sm font-medium text-fg-subtle">{today}</p>
            <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back, <span className="gradient-text">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-fg-muted">
              {welcomeLine(data?.summary)}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button
                icon={<Plus className="h-4 w-4" strokeWidth={2.5} />}
                onClick={() => setNewDesignOpen(true)}
              >
                New Design
              </Button>
              <Button
                variant="outline"
                icon={<Play className="h-4 w-4" />}
                onClick={() => navigate("/app/simulation")}
              >
                Run Simulation
              </Button>
            </div>
          </div>
        </GlowCard>
      </motion.div>

      {/* Guided getting-started — tells the user exactly the next step */}
      <GettingStarted
        hasDesign={PROJECTS.length > 0}
        onNewDesign={() => setNewDesignOpen(true)}
        navigate={navigate}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((c, i) => (
          <motion.div key={c.label} custom={i} variants={fade} initial="hidden" animate="show">
            <StatCard
              label={c.label}
              value={c.value}
              unit={(c as any).unit}
              tone={c.tone}
              icon={c.icon}
              delta={c.delta}
              subtitle={(c as any).subtitle}
              spark={c.spark.length >= 2 ? <Sparkline data={c.spark} tone={c.tone} /> : undefined}
            />
          </motion.div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Throughput chart */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <div>
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                  Throughput
                </h3>
                <p className="text-sm text-fg-subtle">
                  Simulations & designs, last {range}
                </p>
              </div>
              <SegmentedControl
                size="sm"
                value={range}
                onChange={setRange}
                options={[
                  { value: "14d", label: "14d" },
                  { value: "30d", label: "30d" },
                  { value: "90d", label: "90d" },
                ]}
              />
            </div>
            <CardContent className="pt-4">
              {!loadingDash && (data?.throughput?.every((t: any) => !t.sims && !t.designs) ?? true) ? (
                <div className="grid h-[250px] place-items-center text-sm text-fg-subtle">
                  No simulations or designs in this window yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart
                    data={data?.throughput ?? []}
                    margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="d-sims" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" {...axisProps} tickFormatter={(d) => `D${d + 1}`} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                    <Area
                      type="monotone" name="Simulations" dataKey="sims"
                      stroke={CHART.primary} strokeWidth={2} fill="url(#d-sims)"
                    />
                    <Line
                      type="monotone" name="Designs" dataKey="designs"
                      stroke={CHART.cyan} strokeWidth={2} dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Projects
              </h3>
              <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate("/app/projects")}>
                View all
              </Button>
            </div>
            <CardContent className="space-y-1 pt-3">
              {PROJECTS.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-subtle">No projects yet.</p>
              ) : PROJECTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/app/designer?projectId=${p.id}`)}
                  className="group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                    {p.qubits}Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-fg">{p.name}</h4>
                      <Badge
                        tone={PROJECT_STATUS_TONE[p.status]}
                        dot={p.status === "active" || p.status === "simulating"}
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-fg-subtle">{p.description}</p>
                  </div>
                  <div className="hidden w-32 shrink-0 sm:block">
                    <div className="mb-1 flex justify-between text-2xs text-fg-subtle">
                      <span>{p.progress}%</span>
                      <span>{timeAgo(p.updatedAt || p.updated_at)}</span>
                    </div>
                    <Progress
                      value={p.progress}
                      size="sm"
                      tone={p.status === "review" ? "warning" : "primary"}
                    />
                  </div>
                  <AvatarGroup names={p.collaborators ?? []} size={26} max={3} />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Activity */}
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Activity
              </h3>
            </div>
            <CardContent className="pt-3">
              <div className="relative space-y-4 pl-2">
                <div className="absolute bottom-2 left-[1.1rem] top-2 w-px bg-line" />
                {loadingActivities ? (
                  <p className="py-4 text-xs text-fg-subtle">Loading activity…</p>
                ) : activities.length === 0 ? (
                  <p className="py-4 text-xs text-fg-subtle">No recent activity.</p>
                ) : (
                  activities.map((a) => {
                    const { icon: Icon, tone } = activityIcon[a.type] ?? activityIcon.comment;
                    return (
                      <div key={a.id} className="relative flex gap-3">
                        <div
                          className={cn(
                            "z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-surface",
                            tone,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 pt-0.5 text-sm">
                          <p className="leading-snug text-fg-muted">
                            <span className="font-semibold text-fg">{a.actor}</span>{" "}
                            {a.action}{" "}
                            <span className="font-medium text-fg">{a.target}</span>
                          </p>
                          <p className="mt-0.5 text-2xs text-fg-subtle">
                            {timeAgo(a.created_at || a.at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Solver queue — real recent simulation jobs */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Solver Queue
              </h3>
              <StatusDot tone={queue.some((s: any) => s.status === "running") ? "cyan" : "success"} pulse={queue.some((s: any) => s.status === "running")} />
            </div>
            <CardContent className="space-y-3 pt-3">
              {queue.length === 0 ? (
                <p className="py-4 text-sm text-fg-subtle">
                  No simulations yet — run one from the Simulation page.
                </p>
              ) : queue.map((s: any) => (
                <div key={s.id} className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot tone={QUEUE_TONE[s.status] ?? "neutral"} pulse={s.status === "running"} />
                      <span className="truncate text-sm font-medium text-fg">{s.label}</span>
                    </div>
                    <span className="shrink-0 text-2xs uppercase text-fg-subtle">{s.solver}</span>
                  </div>
                  {s.project && (
                    <p className="mt-0.5 truncate text-2xs text-fg-subtle">{s.project}</p>
                  )}
                  {s.status === "running" ? (
                    <div className="mt-2.5">
                      <Progress value={s.progress} size="sm" tone="cyan" />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-2xs text-fg-subtle">
                      {s.status === "done"
                        ? [s.result && `Result: ${s.result}`, s.duration].filter(Boolean).join(" · ") || "Completed"
                        : s.status === "queued" ? "Queued"
                        : s.status === "failed" ? "Failed"
                        : s.status === "canceled" ? "Canceled"
                        : s.status}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
