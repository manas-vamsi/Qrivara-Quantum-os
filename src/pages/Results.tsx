import { useMemo, useState } from "react";
import {
  LineChart as LineChartIcon,
  Radio,
  Gauge,
  Link2,
  Activity,
  Zap,
  Download,
  FolderOpen,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Form";
import { AvatarGroup } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { PROJECTS, PROJECT_STATUS_TONE, type Project } from "@/data/mockData";
import { seeded, timeAgo } from "@/lib/utils";

function hashId(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 99991;
  return h + 1;
}

/** Deterministic per-project results (stable for a given project id). */
function projectResults(p: Project) {
  const r = seeded(hashId(p.id));
  const freq = 4.8 + r() * 0.9;
  const q = 8 + r() * 9;
  const coupling = 30 + r() * 80;
  const cap = 60 + r() * 40;
  const ind = 9 + r() * 6;
  const anh = -(260 + r() * 130);

  const versions = ["v1.5", "v2.0", "v2.1", "v2.2", "v2.3", "v2.4"];
  const evolution = versions.map((v, i) => ({
    version: v,
    freq: Number((freq + (5 - i) * 0.016 + (r() - 0.5) * 0.012).toFixed(3)),
    fidelity: Number((98.4 + i * 0.22 + (r() - 0.5) * 0.05).toFixed(2)),
  }));

  const optHistory = Array.from({ length: 40 }, (_, i) => ({
    iter: i + 1,
    best: Number((0.9 * Math.exp(-i / 11) + 0.012 + (r() - 0.5) * 0.004).toFixed(4)),
  }));

  const couplingSweep = Array.from({ length: 41 }, (_, i) => {
    const flux = -0.5 + i / 40;
    return {
      flux: Number(flux.toFixed(3)),
      g: Number((4 + coupling * Math.cos(Math.PI * flux) ** 2).toFixed(2)),
    };
  });

  const coherence = Array.from({ length: p.qubits }, (_, i) => ({
    qubit: `Q${i + 1}`,
    t1: Math.round(70 + r() * 95),
    t2: Math.round(50 + r() * 85),
  }));

  const metrics = [
    { label: "Frequency", value: freq.toFixed(3), unit: "GHz", tone: "primary" as const, icon: <Radio className="h-[1.1rem] w-[1.1rem]" /> },
    { label: "Q Factor", value: q.toFixed(1), unit: "k", tone: "cyan" as const, icon: <Gauge className="h-[1.1rem] w-[1.1rem]" /> },
    { label: "Coupling", value: coupling.toFixed(0), unit: "MHz", tone: "violet" as const, icon: <Link2 className="h-[1.1rem] w-[1.1rem]" /> },
    { label: "Capacitance", value: cap.toFixed(1), unit: "fF", tone: "success" as const, icon: <Activity className="h-[1.1rem] w-[1.1rem]" /> },
    { label: "Inductance", value: ind.toFixed(1), unit: "nH", tone: "warning" as const, icon: <Zap className="h-[1.1rem] w-[1.1rem]" /> },
    { label: "Anharmonicity", value: anh.toFixed(0), unit: "MHz", tone: "violet" as const, icon: <Activity className="h-[1.1rem] w-[1.1rem]" /> },
  ];

  return { metrics, evolution, optHistory, couplingSweep, coherence };
}

export default function Results() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const project = PROJECTS.find((p) => p.id === selectedId) ?? null;
  const results = useMemo(
    () => (project ? projectResults(project) : null),
    [project],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results Dashboard"
        subtitle="Extracted metrics and analysis graphs for a selected design."
        icon={<LineChartIcon className="h-5 w-5" />}
        actions={
          <>
            <Select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="w-52"
            >
              <option value="">Select a project…</option>
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!project}>
              Export
            </Button>
          </>
        }
      />

      {!project || !results ? (
        /* No project selected — prompt selection */
        <div className="space-y-6">
          <EmptyState
            icon={<FolderOpen className="h-5 w-5" />}
            title="No project selected"
            description="Choose a design below (or from the dropdown) to view its extracted metrics and analysis graphs."
          />
          <div>
            <p className="mb-3 text-sm font-medium text-fg-muted">Your projects</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROJECTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                    {p.qubits}Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-fg">{p.name}</h4>
                      <Badge tone={PROJECT_STATUS_TONE[p.status]} dot={p.status === "active" || p.status === "simulating"}>
                        {p.status}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-fg-subtle">{p.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Project context banner */}
          <Card inset>
            <div className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-surface font-mono text-sm font-semibold text-primary">
                {project.qubits}Q
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold tracking-tight">{project.name}</h2>
                  <Badge tone={PROJECT_STATUS_TONE[project.status]} dot={project.status === "active" || project.status === "simulating"}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-sm text-fg-subtle">{project.description}</p>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <AvatarGroup names={project.collaborators} size={28} max={3} />
                <div className="hidden items-center gap-2 text-xs text-fg-subtle sm:flex">
                  <StatusDot tone="success" pulse /> updated {timeAgo(project.updatedAt)}
                </div>
              </div>
            </div>
          </Card>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {results.metrics.map((m) => (
              <StatCard key={m.label} {...m} />
            ))}
          </div>

          {/* Graphs */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Frequency vs version" subtitle="Design evolution">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={results.evolution} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="version" {...axisProps} />
                  <YAxis {...axisProps} domain={["auto", "auto"]} unit=" GHz" />
                  <RTooltip content={<ChartTooltip unit="GHz" />} cursor={{ stroke: CHART.grid }} />
                  <Line type="monotone" name="Freq" dataKey="freq" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 3, fill: CHART.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Optimization convergence" subtitle="Best score per iteration">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={results.optHistory} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="res-opt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.cyan} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={CHART.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="iter" {...axisProps} />
                  <YAxis {...axisProps} />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                  <Area type="monotone" name="Best" dataKey="best" stroke={CHART.cyan} strokeWidth={2.5} fill="url(#res-opt)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Parameter sweep" subtitle="Coupling g vs flux Φ/Φ₀">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={results.couplingSweep} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="flux" {...axisProps} tickFormatter={(v) => v.toFixed(2)} />
                  <YAxis {...axisProps} unit=" MHz" />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                  <Line type="monotone" name="g" dataKey="g" stroke={CHART.violet} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <div className="px-5 pt-5">
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Per-qubit results</h3>
                <p className="text-sm text-fg-subtle">{project.qubits} qubits · coherence</p>
              </div>
              <CardContent className="pt-4">
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                        <th className="px-3 py-2 font-medium">Qubit</th>
                        <th className="px-3 py-2 text-right font-medium">T₁ (µs)</th>
                        <th className="px-3 py-2 text-right font-medium">T₂ (µs)</th>
                        <th className="px-3 py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.coherence.map((c) => (
                        <tr key={c.qubit} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2 font-mono font-medium text-fg">{c.qubit}</td>
                          <td className="px-3 py-2 text-right font-mono text-fg-muted">{c.t1}</td>
                          <td className="px-3 py-2 text-right font-mono text-fg-muted">{c.t2}</td>
                          <td className="px-3 py-2 text-right">
                            <Badge tone={c.t1 > 120 ? "success" : c.t1 > 95 ? "primary" : "warning"}>
                              {c.t1 > 120 ? "excellent" : c.t1 > 95 ? "good" : "fair"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
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
