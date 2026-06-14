import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Select, Field } from "@/components/ui/Form";
import { CHART, axisProps, ChartTooltip } from "@/lib/chartTheme";
import { VERSIONS, EVOLUTION } from "@/data/mockData";
import { cn, timeAgo } from "@/lib/utils";

const tagTone: Record<string, "violet" | "cyan" | "primary"> = {
  milestone: "violet",
  candidate: "cyan",
};

function zzFor(label: string) {
  const e = EVOLUTION.find((x) => x.version === label);
  return e ? e.zz : 0;
}

export default function Experiments() {
  const [selected, setSelected] = useState(VERSIONS.find((v) => v.current)!.id);
  const [base, setBase] = useState("v2.0");
  const [compare, setCompare] = useState("v2.4");

  const baseV = VERSIONS.find((v) => v.label === base)!;
  const compareV = VERSIONS.find((v) => v.label === compare)!;
  const sel = VERSIONS.find((v) => v.id === selected)!;

  const metrics = [
    { name: "Frequency", unit: "GHz", base: baseV.freq, comp: compareV.freq, better: "target", goal: 5.2 },
    { name: "Fidelity", unit: "%", base: baseV.fidelity, comp: compareV.fidelity, better: "up" },
    { name: "ZZ crosstalk", unit: "kHz", base: zzFor(base), comp: zzFor(compare), better: "down" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Experiment Intelligence"
        subtitle="Version history, design evolution and run comparisons."
        icon={<GitBranch className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" icon={<Download className="h-4 w-4" />}>
              Export
            </Button>
            <Button icon={<Camera className="h-4 w-4" />}>New Snapshot</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Versions" value="24" tone="primary" icon={<GitBranch className="h-[1.1rem] w-[1.1rem]" />} />
        <StatCard label="Best Fidelity" value="99.62" unit="%" tone="success" delta={{ value: "+0.22%", positive: true }} />
        <StatCard label="Total Sims" value="148" tone="cyan" delta={{ value: "+18", positive: true }} />
        <StatCard label="Active Branch" value="main" tone="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Version History
              </h3>
              <p className="text-sm text-fg-subtle">
                Select a commit to inspect · {VERSIONS.length} shown
              </p>
            </div>
            <CardContent className="pt-3">
              <div className="relative pl-2">
                <div className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-line" />
                {VERSIONS.map((v, i) => {
                  const prev = VERSIONS[i + 1];
                  const fidUp = prev ? v.fidelity - prev.fidelity : 0;
                  const dotTone = v.current
                    ? "bg-primary shadow-glow"
                    : v.tag === "milestone"
                      ? "bg-violet"
                      : v.tag === "candidate"
                        ? "bg-cyan"
                        : "bg-surface-3 border-2 border-line-strong";
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
                          dotTone,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-fg">
                            {v.label}
                          </span>
                          {v.current && <Badge tone="primary" dot>current</Badge>}
                          {v.tag && <Badge tone={tagTone[v.tag] ?? "neutral"}>{v.tag}</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-fg-muted">
                          {v.message}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-2xs text-fg-subtle">
                          <Avatar name={v.author} size={16} />
                          <span>{v.author}</span>
                          <span>·</span>
                          <span>{timeAgo(v.at)}</span>
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="font-mono text-sm text-fg">{v.freq.toFixed(3)} <span className="text-2xs text-fg-subtle">GHz</span></p>
                        <p className="mt-0.5 flex items-center justify-end gap-1 font-mono text-xs">
                          <span className="text-fg-muted">{v.fidelity.toFixed(2)}%</span>
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
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Design Evolution
              </h3>
              <p className="text-sm text-fg-subtle">Gate fidelity across versions</p>
            </div>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={EVOLUTION} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="version" {...axisProps} />
                  <YAxis yAxisId="l" {...axisProps} domain={[98, 100]} unit="%" />
                  <YAxis yAxisId="r" orientation="right" {...axisProps} />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: CHART.grid }} />
                  <Line yAxisId="l" type="monotone" name="Fidelity %" dataKey="fidelity" stroke={CHART.primary} strokeWidth={2.5} dot={{ r: 3, fill: CHART.primary }} />
                  <Line yAxisId="r" type="monotone" name="ZZ (kHz)" dataKey="zz" stroke={CHART.violet} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-6">
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Compare Runs
              </h3>
            </div>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base">
                  <Select value={base} onChange={(e) => setBase(e.target.value)}>
                    {VERSIONS.map((v) => (
                      <option key={v.id} value={v.label}>{v.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Compare">
                  <Select value={compare} onChange={(e) => setCompare(e.target.value)}>
                    {VERSIONS.map((v) => (
                      <option key={v.id} value={v.label}>{v.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-left text-2xs uppercase tracking-wider text-fg-subtle">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 text-right font-medium">{base}</th>
                      <th className="px-3 py-2 text-right font-medium">{compare}</th>
                      <th className="px-3 py-2 text-right font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => {
                      const delta = m.comp - m.base;
                      let improved: boolean | null = null;
                      if (m.better === "up") improved = delta > 0;
                      else if (m.better === "down") improved = delta < 0;
                      else improved =
                        Math.abs(m.comp - (m as any).goal) <
                        Math.abs(m.base - (m as any).goal);
                      return (
                        <tr key={m.name} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2.5 text-fg-muted">{m.name}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-fg">{m.base.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-fg">{m.comp.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 font-mono text-xs",
                                delta === 0 ? "text-fg-subtle" : improved ? "text-success" : "text-error",
                              )}
                            >
                              {delta === 0 ? <Minus className="h-3 w-3" /> : delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {Math.abs(delta).toFixed(2)}
                            </span>
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
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Run Metadata
              </h3>
              <p className="text-sm text-fg-subtle font-mono">{sel.label}</p>
            </div>
            <CardContent className="pt-3">
              <dl className="space-y-2.5 text-sm">
                {[
                  ["Solver", "Ansys HFSS"],
                  ["Mesh", "182k tets"],
                  ["Author", sel.author],
                  ["Date", new Date(sel.at).toLocaleDateString()],
                  ["Branch", "main"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-line/60 pb-2.5 last:border-0">
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd className="font-medium text-fg">{v}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <dt className="text-fg-subtle">Status</dt>
                  <dd><Badge tone="success" dot>verified</Badge></dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
