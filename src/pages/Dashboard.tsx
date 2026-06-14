import { useState } from "react";
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
import { AvatarGroup, Avatar } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/Form";
import { StatCard } from "@/components/common/StatCard";
import { Sparkline } from "@/components/common/Sparkline";
import { LogoMark } from "@/components/common/Logo";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { ACTIVITY, SIM_RUNS, KPI_TREND, PROJECT_STATUS_TONE } from "@/data/mockData";
import { useAppStore } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";
import { cn, timeAgo } from "@/lib/utils";

const activityIcon: Record<string, { icon: typeof Activity; tone: string }> = {
  sim: { icon: Activity, tone: "text-cyan bg-cyan/12" },
  commit: { icon: GitCommit, tone: "text-primary bg-primary/12" },
  review: { icon: CheckCircle2, tone: "text-warning bg-warning/12" },
  optimize: { icon: Sparkles, tone: "text-violet bg-violet/12" },
  comment: { icon: MessageCircle, tone: "text-fg-muted bg-surface-3" },
  design: { icon: Workflow, tone: "text-primary bg-primary/12" },
};

const fade = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function Dashboard() {
  const [range, setRange] = useState<"14d" | "30d" | "90d">("14d");
  const navigate = useNavigate();
  const setNewDesignOpen = useAppStore((s) => s.setNewDesignOpen);
  const PROJECTS = useDataStore((s) => s.projects);
  const firstName = useAppStore((s) => s.profile.name).split(" ")[0] || "there";
  const sims = KPI_TREND.map((d) => d.sims);
  const designs = KPI_TREND.map((d) => d.designs);

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
            <p className="text-sm font-medium text-fg-subtle">
              Saturday, June 14 2026
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back,{" "}
              <span className="gradient-text">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-fg-muted">
              Your quantum workspace is online. 3 projects active, the eigenmode
              solver is warm, and one optimization is converging.
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Active Qubits",
            value: "36",
            tone: "primary" as const,
            icon: <Cpu className="h-4.5 w-4.5 h-[1.1rem] w-[1.1rem]" />,
            delta: { value: "+4 this week", positive: true },
            spark: sims,
          },
          {
            label: "Simulations Today",
            value: "24",
            tone: "cyan" as const,
            icon: <Activity className="h-[1.1rem] w-[1.1rem]" />,
            delta: { value: "+12%", positive: true },
            spark: designs.map((d) => d + 3),
          },
          {
            label: "Avg Gate Fidelity",
            value: "99.62",
            unit: "%",
            tone: "success" as const,
            icon: <GaugeIcon className="h-[1.1rem] w-[1.1rem]" />,
            delta: { value: "+0.14%", positive: true },
            spark: sims.map((s) => s + 2),
          },
          {
            label: "Optimization Gain",
            value: "18",
            unit: "%",
            tone: "violet" as const,
            icon: <Sparkles className="h-[1.1rem] w-[1.1rem]" />,
            delta: { value: "+5.2%", positive: true },
            spark: designs,
          },
        ].map((c, i) => (
          <motion.div
            key={c.label}
            custom={i}
            variants={fade}
            initial="hidden"
            animate="show"
          >
            <StatCard
              {...c}
              spark={<Sparkline data={c.spark} tone={c.tone} />}
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
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart
                  data={KPI_TREND}
                  margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="d-sims" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={CHART.grid}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    {...axisProps}
                    tickFormatter={(d) => `D${d + 1}`}
                  />
                  <YAxis {...axisProps} />
                  <RTooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: CHART.grid }}
                  />
                  <Area
                    type="monotone"
                    name="Simulations"
                    dataKey="sims"
                    stroke={CHART.primary}
                    strokeWidth={2}
                    fill="url(#d-sims)"
                  />
                  <Line
                    type="monotone"
                    name="Designs"
                    dataKey="designs"
                    stroke={CHART.cyan}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Projects */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Projects
              </h3>
              <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                View all
              </Button>
            </div>
            <CardContent className="space-y-1 pt-3">
              {PROJECTS.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                    {p.qubits}Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-fg">
                        {p.name}
                      </h4>
                      <Badge
                        tone={PROJECT_STATUS_TONE[p.status]}
                        dot={p.status === "active" || p.status === "simulating"}
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-fg-subtle">
                      {p.description}
                    </p>
                  </div>
                  <div className="hidden w-32 shrink-0 sm:block">
                    <div className="mb-1 flex justify-between text-2xs text-fg-subtle">
                      <span>{p.progress}%</span>
                      <span>{timeAgo(p.updatedAt)}</span>
                    </div>
                    <Progress
                      value={p.progress}
                      size="sm"
                      tone={p.status === "review" ? "warning" : "primary"}
                    />
                  </div>
                  <AvatarGroup names={p.collaborators} size={26} max={3} />
                </div>
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
                {ACTIVITY.map((a) => {
                  const { icon: Icon, tone } =
                    activityIcon[a.type] ?? activityIcon.comment;
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
                          <span className="font-semibold text-fg">
                            {a.actor}
                          </span>{" "}
                          {a.action}{" "}
                          <span className="font-medium text-fg">
                            {a.target}
                          </span>
                        </p>
                        <p className="mt-0.5 text-2xs text-fg-subtle">
                          {timeAgo(a.at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Solver queue */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Solver Queue
              </h3>
              <StatusDot tone="success" pulse />
            </div>
            <CardContent className="space-y-3 pt-3">
              {SIM_RUNS.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        tone={
                          s.status === "running"
                            ? "cyan"
                            : s.status === "completed"
                              ? "success"
                              : s.status === "failed"
                                ? "error"
                                : "neutral"
                        }
                        pulse={s.status === "running"}
                      />
                      <span className="text-sm font-medium text-fg">
                        {s.name}
                      </span>
                    </div>
                    <span className="text-2xs text-fg-subtle">{s.solver}</span>
                  </div>
                  {s.status === "running" ? (
                    <div className="mt-2.5">
                      <Progress value={s.progress} size="sm" tone="cyan" />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-2xs text-fg-subtle">
                      {s.status === "completed"
                        ? `Result: ${s.result} · ${s.duration}`
                        : s.status === "queued"
                          ? "Queued"
                          : "Failed"}
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
