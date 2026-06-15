import { useEffect, useState } from "react";
import {
  Layers,
  ShieldCheck,
  Check,
  X,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Slider, SegmentedControl, Select, Field } from "@/components/ui/Form";
import { lossBudget } from "@/lib/quantum";
import {
  METALS,
  SUBSTRATES,
  LOSS_INTERFACES,
  DRC_RULES,
} from "@/data/mockData";
import { cn, fmtUs } from "@/lib/utils";
import { Metric } from "@/components/common/Metric";
import { toneBg, type Tone } from "@/lib/tones";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";

const lossTone: Tone[] = ["primary", "cyan", "violet", "warning"];

type FabResult = {
  steps: { name: string; tolerance_nm: number; status: string }[];
  frequency_drift_MHz: number;
  coupling_drift_MHz: number;
  yield_pct: number;
  spec_window_MHz: number;
};

export default function Fabrication() {
  const [metal, setMetal] = useState("ta");
  const [substrate, setSubstrate] = useState("sapphire");
  const [parts, setParts] = useState(LOSS_INTERFACES.map((i) => i.p));
  const fRef = 5.0; // reference qubit frequency for the loss → T1 calc

  // Live process / yield analysis (backend) — project-aware.
  const projects = useDataStore((s) => s.projects);
  const [projectId, setProjectId] = useState("");
  const [fab, setFab] = useState<FabResult | null>(null);
  const [fabLoading, setFabLoading] = useState(false);
  const [fabError, setFabError] = useState(false);

  // default to the first project once they load
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const runFab = async (pid: string) => {
    if (!pid) return;
    setFabLoading(true);
    setFabError(false);
    try {
      const designs = await api.getProjectDesigns(pid);
      const designId = designs?.[0]?.id;
      if (!designId) throw new Error("no design");
      const job = await api.runSimulation(designId, "fabrication", "analytic", {});
      setFab((job?.result ?? job) as FabResult);
    } catch {
      setFabError(true);
      setFab(null);
    } finally {
      setFabLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) runFab(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const sub = SUBSTRATES.find((s) => s.id === substrate)!;
  const metalDef = METALS.find((m) => m.id === metal)!;

  const interfaces = LOSS_INTERFACES.map((i, idx) => ({ ...i, p: parts[idx] }));
  const { Q, t1Us, contributions } = lossBudget(interfaces, fRef);
  const maxContrib = Math.max(...contributions, 1e-12);

  const drc = DRC_RULES.map((r) => ({
    ...r,
    ok: r.value >= r.min && (r.max === undefined || r.value <= r.max),
  }));
  const passed = drc.filter((r) => r.ok).length;
  const allPass = passed === drc.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fabrication & Materials"
        subtitle="Material stack, surface-participation loss budget, process tolerances and design-rule checks."
        icon={<Layers className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.length === 0 && <option value="">No projects</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <Button
              icon={<ShieldCheck className="h-4 w-4" />}
              loading={fabLoading}
              onClick={() => runFab(projectId)}
            >
              Run Analysis
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: materials + loss */}
        <div className="space-y-6 lg:col-span-2">
          {/* Material stack */}
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Material Stack
              </h3>
              <p className="text-sm text-fg-subtle">Superconductor & substrate</p>
            </div>
            <CardContent className="space-y-4 pt-4">
              <Field label="Superconducting metal">
                <SegmentedControl
                  value={metal}
                  onChange={setMetal}
                  size="sm"
                  options={METALS.map((m) => ({ value: m.id, label: m.id.toUpperCase() }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Metal" value={metalDef.name.split(" ")[0]} tone="primary" />
                <Metric label="Tc" value={metalDef.tcK.toFixed(1)} unit="K" tone="cyan" />
                <div className="col-span-2">
                  <Field label="Substrate">
                    <Select value={substrate} onChange={(e) => setSubstrate(e.target.value)}>
                      {SUBSTRATES.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="εᵣ" value={sub.eps.toFixed(1)} tone="violet" />
                <Metric label="Bulk tanδ" value={sub.tanD.toExponential(0)} tone="success" />
                <Metric label="Note" value={metalDef.note} tone="primary" size="xs" />
              </div>
            </CardContent>
          </Card>

          {/* TLS / surface participation */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <div>
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                  Surface Participation & TLS Loss
                </h3>
                <p className="text-sm text-fg-subtle">1/Q = Σ pᵢ·tanδᵢ → T₁</p>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-semibold tabular-nums text-success">
                  {fmtUs(t1Us)} <span className="text-sm text-fg-subtle">µs</span>
                </div>
                <p className="text-2xs text-fg-subtle">TLS-limited T₁ · Q = {(Q / 1e6).toFixed(2)}M</p>
              </div>
            </div>
            <CardContent className="space-y-4 pt-4">
              {interfaces.map((it, idx) => {
                const contribPct = (contributions[idx] / maxContrib) * 100;
                const tone = lossTone[idx % lossTone.length];
                return (
                  <div key={it.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-fg">{it.name}</span>
                      <span className="font-mono text-xs text-fg-muted">
                        p = {it.p.toExponential(1)} · tanδ {it.tanD.toExponential(1)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", toneBg[tone])}
                          style={{ width: `${contribPct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-2xs text-fg-subtle">
                        {((contributions[idx] / contributions.reduce((s, c) => s + c, 0)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    {it.id !== "bulk" && (
                      <div className="mt-2">
                        <Slider
                          value={it.p * 1e5}
                          min={0}
                          max={20}
                          step={0.1}
                          onChange={(v) =>
                            setParts((p) => p.map((x, i) => (i === idx ? (v as number) / 1e5 : x)))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
                Adjust interface participation ratios (drag) to see the T₁ budget update. Tantalum on sapphire minimises metal–air and substrate–air loss — the path to record coherence.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: DRC + process */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Design-Rule Check
              </h3>
              <Badge tone={allPass ? "success" : "warning"} dot>
                {passed}/{drc.length} passed
              </Badge>
            </div>
            <CardContent className="space-y-1 pt-3">
              {drc.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full",
                      r.ok ? "bg-success/15 text-success" : "bg-error/15 text-error",
                    )}
                  >
                    {r.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{r.name}</p>
                    <p className="font-mono text-2xs text-fg-subtle">
                      {r.value} {r.unit} · limit ≥ {r.min}
                      {r.max !== undefined ? ` ≤ ${r.max}` : ""} {r.unit}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Live process tolerances + yield (backend) */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <div>
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                  Process & Yield
                </h3>
                <p className="text-sm text-fg-subtle">
                  {fabError
                    ? "backend offline — start the API server"
                    : "Tolerance stack-up → frequency drift"}
                </p>
              </div>
              {fab && !fabError && (
                <Badge tone={fab.yield_pct >= 50 ? "success" : fab.yield_pct >= 20 ? "warning" : "error"} dot>
                  {fab.yield_pct.toFixed(0)}% yield
                </Badge>
              )}
            </div>
            <CardContent className="space-y-3 pt-3 text-sm">
              {fabLoading && !fab && (
                <p className="px-1 py-6 text-center text-sm text-fg-subtle">Running process analysis…</p>
              )}
              {fabError && !fab && (
                <p className="rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
                  Could not reach the analysis backend. Start it with{" "}
                  <span className="font-mono text-fg">uvicorn app.main:app</span> and click Run Analysis.
                </p>
              )}
              {fab && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="f drift" value={fab.frequency_drift_MHz.toFixed(0)} unit="MHz" tone="primary" size="sm" />
                    <Metric label="g drift" value={fab.coupling_drift_MHz.toFixed(1)} unit="MHz" tone="cyan" size="sm" />
                    <Metric label="spec" value={`±${(fab.spec_window_MHz / 2).toFixed(0)}`} unit="MHz" tone="violet" size="sm" />
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {fab.steps.map((s) => {
                      const ok = s.status === "pass";
                      return (
                        <div
                          key={s.name}
                          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                        >
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-full",
                              ok ? "bg-success/15 text-success" : "bg-error/15 text-error",
                            )}
                          >
                            {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-fg">{s.name}</p>
                            <p className="font-mono text-2xs text-fg-subtle">tolerance ±{s.tolerance_nm} nm</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
                    <Activity className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-xs text-fg-muted">
                      {fab.frequency_drift_MHz <= fab.spec_window_MHz
                        ? "Drift within spec window — high-yield process."
                        : "Drift exceeds spec window — tighten junction tolerance to raise yield."}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
