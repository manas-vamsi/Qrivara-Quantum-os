import { useState } from "react";
import {
  Layers,
  ShieldCheck,
  Check,
  X,
  Thermometer,
  Beaker,
  CircuitBoard,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
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

const lossTone: Tone[] = ["primary", "cyan", "violet", "warning"];

export default function Fabrication() {
  const [metal, setMetal] = useState("ta");
  const [substrate, setSubstrate] = useState("sapphire");
  const [parts, setParts] = useState(LOSS_INTERFACES.map((i) => i.p));
  const fRef = 5.0; // reference qubit frequency for the loss → T1 calc

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
        subtitle="Material stack, surface-participation loss budget and design-rule checks."
        icon={<Layers className="h-5 w-5" />}
        actions={
          <Button icon={<ShieldCheck className="h-4 w-4" />}>Run DRC</Button>
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

          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Process
              </h3>
            </div>
            <CardContent className="space-y-3 pt-3 text-sm">
              <ProcRow icon={<Beaker className="h-4 w-4 text-cyan" />} label="Junction lithography" value="Manhattan" />
              <ProcRow icon={<Layers className="h-4 w-4 text-primary" />} label="Deposition" value="Double-angle e-beam" />
              <ProcRow icon={<CircuitBoard className="h-4 w-4 text-violet" />} label="Integration" value="Flip-chip + TSV" />
              <ProcRow icon={<Thermometer className="h-4 w-4 text-warning" />} label="Operating temp" value="15 mK" />
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
                <StatusDot tone="success" pulse />
                <span className="text-xs text-fg-muted">Process deck validated for {metalDef.name}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProcRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-2.5 last:border-0">
      <span className="flex items-center gap-2 text-fg-muted">
        {icon}
        {label}
      </span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}
