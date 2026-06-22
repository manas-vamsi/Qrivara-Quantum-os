import { useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  Download,
  Camera,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Select, Field, Input, Textarea } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { comingSoon } from "@/components/common/ComingSoon";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

type Version = {
  id: string;
  label: string;
  message: string;
  author: string;
  freq: number | null;
  fidelity: number | null;
  created_at: string;
};

/** Format a possibly-null metric. */
const fmt = (x: number | null | undefined, d = 2) =>
  x == null || !isFinite(x) ? "—" : x.toFixed(d);

export default function Experiments() {
  const { projects, fetchProjects } = useDataStore();
  const [projectId, setProjectId] = useState("");
  const [designId, setDesignId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [base, setBase] = useState<string>("");
  const [compare, setCompare] = useState<string>("");
  // snapshot dialog
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapLabel, setSnapLabel] = useState("");
  const [snapMsg, setSnapMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const loadVersions = async (pid: string) => {
    setLoading(true);
    setVersions([]);
    setDesignId(null);
    try {
      const designs = await api.getProjectDesigns(pid);
      const dId = designs?.[0]?.id ?? null;
      setDesignId(dId);
      if (dId) {
        const v = await api.getDesignVersions(dId);
        const list: Version[] = Array.isArray(v) ? v : [];
        setVersions(list);
        setSelected(list[0]?.id ?? null);
        setBase(list[list.length - 1]?.id ?? "");
        setCompare(list[0]?.id ?? "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) loadVersions(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const createSnap = async () => {
    if (!designId || !snapLabel.trim()) return;
    setSaving(true);
    try {
      await api.createSnapshot(designId, snapLabel.trim(), snapMsg.trim());
      setSnapOpen(false);
      setSnapLabel("");
      setSnapMsg("");
      await loadVersions(projectId);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // oldest → newest, for the evolution chart
  const evolution = useMemo(
    () =>
      [...versions]
        .reverse()
        .map((v) => ({ version: v.label, fidelity: v.fidelity, freq: v.freq })),
    [versions],
  );
  const baseV = versions.find((v) => v.id === base);
  const compareV = versions.find((v) => v.id === compare);
  const sel = versions.find((v) => v.id === selected);
  const bestFid = versions.reduce(
    (m, v) => (v.fidelity != null && v.fidelity > m ? v.fidelity : m),
    0,
  );
  const latestFreq = versions[0]?.freq ?? null;

  const compareMetrics =
    baseV && compareV
      ? ([
          { name: "Frequency", unit: "GHz", base: baseV.freq, comp: compareV.freq, better: "none" },
          { name: "2Q fidelity", unit: "%", base: baseV.fidelity, comp: compareV.fidelity, better: "up" },
        ] as const)
      : [];

  const hasProject = !!projectId;
  const hasVersions = versions.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Experiment Intelligence"
        subtitle="Real version history, design evolution and run comparisons."
        icon={<GitBranch className="h-5 w-5" />}
        actions={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48">
              <option value="">Select project…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              onClick={() => comingSoon("Experiment history export")}
              disabled={!hasVersions}
            >
              Export
            </Button>
            <Button
              icon={<Camera className="h-4 w-4" />}
              onClick={() => setSnapOpen(true)}
              disabled={!designId}
            >
              New Snapshot
            </Button>
          </>
        }
      />

      {!hasProject ? (
        <EmptyState
          icon={<GitBranch className="h-5 w-5" />}
          title="Select a project"
          description="Pick a project to see its design version history and evolution."
        />
      ) : loading ? (
        <EmptyState
          icon={<GitBranch className="h-5 w-5" />}
          title="Loading version history…"
          description="Fetching snapshots for this design."
        />
      ) : !hasVersions ? (
        <EmptyState
          icon={<Camera className="h-5 w-5" />}
          title="No snapshots yet"
          description="Capture a snapshot to start tracking this design's evolution. Each snapshot records the layout plus its frequency and a coherence-limited gate fidelity."
          action={
            <Button icon={<Camera className="h-4 w-4" />} onClick={() => setSnapOpen(true)} disabled={!designId}>
              Create first snapshot
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Versions" value={String(versions.length)} tone="primary" icon={<GitBranch className="h-[1.1rem] w-[1.1rem]" />} />
            <StatCard label="Best 2Q Fidelity" value={fmt(bestFid)} unit="%" tone="success" />
            <StatCard label="Latest Frequency" value={fmt(latestFreq, 3)} unit="GHz" tone="cyan" />
            <StatCard label="Latest Author" value={versions[0]?.author || "—"} tone="violet" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left */}
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <div className="px-5 pt-5">
                  <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Version History</h3>
                  <p className="text-sm text-fg-subtle">Select a snapshot to inspect · {versions.length} shown</p>
                </div>
                <CardContent className="pt-3">
                  <div className="relative pl-2">
                    <div className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-line" />
                    {versions.map((v, i) => {
                      const prev = versions[i + 1]; // older
                      const fidUp =
                        v.fidelity != null && prev?.fidelity != null ? v.fidelity - prev.fidelity : 0;
                      const isLatest = i === 0;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setSelected(v.id)}
                          className={cn(
                            "relative flex w-full items-start gap-4 rounded-xl px-3 py-3 text-left transition-colors",
                            selected === v.id ? "bg-primary/[0.07]" : "hover:bg-surface-2",
                          )}
                        >
                          <span
                            className={cn(
                              "z-10 mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-4 ring-surface",
                              isLatest ? "bg-primary shadow-glow" : "bg-surface-3 border-2 border-line-strong",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-fg">{v.label}</span>
                              {isLatest && <Badge tone="primary" dot>latest</Badge>}
                            </div>
                            <p className="mt-0.5 truncate text-sm text-fg-muted">{v.message || "—"}</p>
                            <div className="mt-1.5 flex items-center gap-2 text-2xs text-fg-subtle">
                              <Avatar name={v.author || "?"} size={16} />
                              <span>{v.author || "unknown"}</span>
                              <span>·</span>
                              <span>{timeAgo(v.created_at)}</span>
                            </div>
                          </div>
                          <div className="hidden shrink-0 text-right sm:block">
                            <p className="font-mono text-sm text-fg">
                              {fmt(v.freq, 3)} <span className="text-2xs text-fg-subtle">GHz</span>
                            </p>
                            <p className="mt-0.5 flex items-center justify-end gap-1 font-mono text-xs">
                              <span className="text-fg-muted">{fmt(v.fidelity)}%</span>
                              {fidUp !== 0 && (
                                <span className={fidUp > 0 ? "text-success" : "text-error"}>
                                  {fidUp > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                </span>
                              )}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <div className="px-5 pt-5">
                  <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Design Evolution</h3>
                  <p className="text-sm text-fg-subtle">Gate fidelity and frequency across snapshots</p>
                </div>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={evolution} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="version" {...axisProps} />
                      <YAxis yAxisId="l" {...axisProps} domain={["auto", "auto"]} unit="%" />
                      <YAxis yAxisId="r" orientation="right" {...axisProps} domain={["auto", "auto"]} unit=" GHz" />
                      <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                      <Line yAxisId="l" type="monotone" name="2Q fidelity %" dataKey="fidelity" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 3, fill: CHART.primary }} connectNulls />
                      <Line yAxisId="r" type="monotone" name="Frequency (GHz)" dataKey="freq" stroke={CHART.violet} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Right */}
            <div className="space-y-6">
              <Card>
                <div className="px-5 pt-5">
                  <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Compare Snapshots</h3>
                </div>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Base">
                      <Select value={base} onChange={(e) => setBase(e.target.value)}>
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Compare">
                      <Select value={compare} onChange={(e) => setCompare(e.target.value)}>
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line bg-surface-2 text-left text-2xs uppercase tracking-wider text-fg-subtle">
                          <th className="px-3 py-2 font-medium">Metric</th>
                          <th className="px-3 py-2 text-right font-medium">{baseV?.label ?? "base"}</th>
                          <th className="px-3 py-2 text-right font-medium">{compareV?.label ?? "compare"}</th>
                          <th className="px-3 py-2 text-right font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareMetrics.map((m) => {
                          const hasBoth = m.base != null && m.comp != null;
                          const delta = hasBoth ? (m.comp as number) - (m.base as number) : 0;
                          let improved: boolean | null = null;
                          if (hasBoth && m.better === "up") improved = delta > 0;
                          return (
                            <tr key={m.name} className="border-b border-line/60 last:border-0">
                              <td className="px-3 py-2.5 text-fg-muted">{m.name}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-fg">{fmt(m.base, m.name === "Frequency" ? 3 : 2)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-fg">{fmt(m.comp, m.name === "Frequency" ? 3 : 2)}</td>
                              <td className="px-3 py-2.5 text-right">
                                {hasBoth ? (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5 font-mono text-xs",
                                      delta === 0 ? "text-fg-subtle" : improved == null ? "text-fg-muted" : improved ? "text-success" : "text-error",
                                    )}
                                  >
                                    {delta === 0 ? <Minus className="h-3 w-3" /> : delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                    {Math.abs(delta).toFixed(m.name === "Frequency" ? 3 : 2)}
                                  </span>
                                ) : (
                                  <span className="text-fg-subtle">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <div className="px-5 pt-5">
                  <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Snapshot Metadata</h3>
                  <p className="text-sm text-fg-subtle font-mono">{sel?.label ?? "—"}</p>
                </div>
                <CardContent className="pt-3">
                  <dl className="space-y-2.5 text-sm">
                    {[
                      ["Message", sel?.message || "—"],
                      ["Author", sel?.author || "—"],
                      ["Date", sel ? new Date(sel.created_at).toLocaleString() : "—"],
                      ["Frequency", sel?.freq != null ? `${fmt(sel.freq, 3)} GHz` : "—"],
                      ["2Q fidelity", sel?.fidelity != null ? `${fmt(sel.fidelity)} %` : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-4 border-b border-line/60 pb-2.5 last:border-0">
                        <dt className="shrink-0 text-fg-subtle">{k}</dt>
                        <dd className="truncate text-right font-medium text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* New-snapshot dialog */}
      <Modal
        open={snapOpen}
        onClose={() => setSnapOpen(false)}
        title="Capture a snapshot"
        description="Records the current design plus its frequency and a coherence-limited gate fidelity."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSnapOpen(false)}>Cancel</Button>
            <Button icon={<Camera className="h-4 w-4" />} onClick={createSnap} loading={saving} disabled={!snapLabel.trim()}>
              Create snapshot
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label" hint="A short version tag, e.g. v1.0 or “tuned couplers”.">
            <Input value={snapLabel} onChange={(e) => setSnapLabel(e.target.value)} placeholder="v1.0" autoFocus />
          </Field>
          <Field label="Message (optional)">
            <Textarea rows={3} value={snapMsg} onChange={(e) => setSnapMsg(e.target.value)} placeholder="What changed in this snapshot?" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
