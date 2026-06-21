import { useEffect, useMemo, useState } from "react";
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
  Info,
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
import { PreviewBadge, ComingSoonOverlay } from "@/components/common/ComingSoon";
import { useDataStore } from "@/store/useDataStore";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const PROJECT_STATUS_TONE: Record<string, any> = {
  active: "success",
  simulating: "primary",
  failed: "danger",
  archived: "neutral",
};

export default function Results() {
  const { projects, fetchProjects } = useDataStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formats, setFormats] = useState<any>(null);

  useEffect(() => {
    fetchProjects();
    api.getExportFormats().then(setFormats).catch(console.error);
  }, [fetchProjects]);

  const project = useMemo(() => projects.find((p) => p.id === selectedId) ?? null, [projects, selectedId]);

  // Let the AI assistant know which project the user is viewing.
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  useEffect(() => {
    if (project) setActiveProject(project.id, project.name);
  }, [project, setActiveProject]);

  useEffect(() => {
    if (selectedId) {
      setLoading(true);
      api.getProjectResults(selectedId)
        .then((data) => {
          // Format for UI
          const m = data.metrics;
          const formatted = {
            method: data.method,
            jobId: data.last_job_id,
            metrics: [
              { label: "Frequency", value: m.frequency_GHz.toFixed(3), unit: "GHz", tone: "primary" as const, icon: <Radio className="h-[1.1rem] w-[1.1rem]" /> },
              { label: "Q Factor", value: m.q_factor_k >= 1000 ? (m.q_factor_k / 1000).toFixed(2) : m.q_factor_k.toFixed(1), unit: m.q_factor_k >= 1000 ? "M" : "k", tone: "cyan" as const, icon: <Gauge className="h-[1.1rem] w-[1.1rem]" /> },
              { label: "Coupling", value: m.coupling_MHz.toFixed(0), unit: "MHz", tone: "violet" as const, icon: <Link2 className="h-[1.1rem] w-[1.1rem]" /> },
              { label: "Capacitance", value: m.capacitance_fF.toFixed(1), unit: "fF", tone: "success" as const, icon: <Activity className="h-[1.1rem] w-[1.1rem]" /> },
              { label: "Inductance", value: m.inductance_nH.toFixed(1), unit: "nH", tone: "warning" as const, icon: <Zap className="h-[1.1rem] w-[1.1rem]" /> },
              { label: "Anharmonicity", value: m.anharmonicity_MHz.toFixed(0), unit: "MHz", tone: "violet" as const, icon: <Activity className="h-[1.1rem] w-[1.1rem]" /> },
            ],
            evolution: [
              { version: "v1.0", freq: m.frequency_GHz + 0.05, fidelity: 98.5 },
              { version: "v1.1", freq: m.frequency_GHz + 0.02, fidelity: 99.1 },
              { version: "current", freq: m.frequency_GHz, fidelity: 99.4 },
            ],
            optHistory: Array.from({ length: 20 }, (_, i) => ({
              iter: i + 1,
              best: 0.9 * Math.exp(-i / 8) + 0.01,
            })),
            couplingSweep: Array.from({ length: 21 }, (_, i) => {
              const flux = -0.5 + i / 20;
              return { flux, g: m.coupling_MHz * Math.cos(Math.PI * flux) ** 2 };
            }),
            coherence: data.coherence,
          };
          setLiveResults(formatted);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLiveResults(null);
    }
  }, [selectedId]);

  const handleExportDesign = (fmt: string) => {
    if (selectedId) api.downloadDesignExport(selectedId, fmt);
  };

  const handleExportSim = (fmt: string) => {
    if (liveResults?.jobId) api.downloadSimulationExport(liveResults.jobId, fmt);
  };

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
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            {formats?.design && (
              <div className="flex gap-1">
                {Object.keys(formats.design).map(f => (
                  <Button key={f} size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => handleExportDesign(f)} disabled={!project}>
                    {f.toUpperCase()}
                  </Button>
                ))}
              </div>
            )}
          </>
        }
      />

      {!project || !liveResults ? (
        /* No project selected — prompt selection */
        <div className="space-y-6">
          <EmptyState
            icon={<FolderOpen className="h-5 w-5" />}
            title={loading ? "Loading results…" : "No project selected"}
            description={loading ? "Fetching latest simulation data from the backend." : "Choose a design below (or from the dropdown) to view its extracted metrics and analysis graphs."}
          />
          <div>
            <p className="mb-3 text-sm font-medium text-fg-muted">Your projects</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
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
                      <Badge tone={PROJECT_STATUS_TONE[p.status] || "neutral"} dot={p.status === "active" || p.status === "simulating"}>
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
                  <Badge tone={PROJECT_STATUS_TONE[project.status] || "neutral"} dot={project.status === "active" || project.status === "simulating"}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-sm text-fg-subtle">{project.description}</p>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <AvatarGroup names={project.collaborators || []} size={28} max={3} />
                <div className="hidden items-center gap-2 text-xs text-fg-subtle sm:flex">
                  <StatusDot tone="success" pulse /> updated {timeAgo(project.updatedAt || project.updated_at)}
                </div>
              </div>
            </div>
          </Card>

          {/* Metrics */}
          {liveResults.method && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              <Info className="h-3.5 w-3.5" />
              Method: {liveResults.method}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {(liveResults.metrics || []).map((m: any) => (
              <StatCard key={m.label} {...m} />
            ))}
          </div>

          {/* Graphs */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Frequency vs version" subtitle="Design evolution" preview>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={liveResults.evolution} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="version" {...axisProps} />
                  <YAxis {...axisProps} domain={["auto", "auto"]} unit=" GHz" />
                  <RTooltip content={<ChartTooltip unit="GHz" />} cursor={{ stroke: CHART.grid }} />
                  <Line type="monotone" name="Freq" dataKey="freq" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 3, fill: CHART.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Optimization convergence" subtitle="Best score per iteration" preview>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={liveResults.optHistory} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
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

            <ChartCard title="Parameter sweep" subtitle="Coupling g vs flux Φ/Φ₀" preview>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={liveResults.couplingSweep} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
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
                      {(liveResults.coherence || []).map((c: any) => (
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

          {/* Export Result */}
          {liveResults.jobId && formats?.result && (
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-semibold text-fg">Export result data</p>
                  <p className="text-xs text-fg-subtle">Download raw simulation metrics and matrices.</p>
                </div>
                <div className="flex gap-2">
                  {Object.keys(formats.result).map(f => (
                    <Button key={f} size="sm" variant="outline" onClick={() => handleExportSim(f)}>
                      {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children, preview }: { title: string; subtitle?: string; children: React.ReactNode; preview?: boolean }) {
  return (
    <Card>
      <div className="px-5 pt-5">
        <h3 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold tracking-tight">
          {title}
          {preview && <PreviewBadge />}
        </h3>
        {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      {preview ? (
        <ComingSoonOverlay label={title}>
          <CardContent className="pt-4">{children}</CardContent>
        </ComingSoonOverlay>
      ) : (
        <CardContent className="pt-4">{children}</CardContent>
      )}
    </Card>
  );
}
