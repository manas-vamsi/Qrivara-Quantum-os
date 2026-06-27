import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Zap, Layers, Gauge } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select, Field, Input } from "@/components/ui/Form";
import { api } from "@/lib/api";
import { CONDUCTORS as FALLBACK_CONDUCTORS, SUBSTRATES as FALLBACK_SUBSTRATES } from "@/data/mockData";

const fmtT1 = (v: any) => (typeof v === "number" && isFinite(v) ? v.toLocaleString() : "—");

export default function MaterialLibrary() {
  // Real material catalog from the backend (/materials); falls back to the bundled
  // list only if the API is unreachable.
  const [CONDUCTORS, setConductors] = useState<any[]>(FALLBACK_CONDUCTORS);
  const [SUBSTRATES, setSubstrates] = useState<any[]>(FALLBACK_SUBSTRATES);
  useEffect(() => {
    api.getMaterials()
      .then((m) => {
        if (Array.isArray(m?.conductors) && m.conductors.length) setConductors(m.conductors);
        if (Array.isArray(m?.substrates) && m.substrates.length) setSubstrates(m.substrates);
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Library"
        subtitle="Conductors & substrates with EM, loss and coherence properties — and a material-choice coherence predictor."
        icon={<FlaskConical className="h-5 w-5" />}
      />

      <CoherencePredictor conductors={CONDUCTORS} substrates={SUBSTRATES} />

      {/* Conductors */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
              <Zap className="h-[1.1rem] w-[1.1rem]" />
            </div>
            <div>
              <h2 className="font-display text-[0.95rem] font-semibold tracking-tight">Conductors</h2>
              <p className="text-sm text-fg-subtle">Superconducting & normal metals — compared by Tc, surface loss & coherence</p>
            </div>
          </div>
          <Badge tone="primary">{CONDUCTORS.length}</Badge>
        </div>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Tc (K)</th>
                  <th className="px-3 py-2 text-right font-medium">ρₙ (µΩ·cm)</th>
                  <th className="px-3 py-2 text-right font-medium">Surface tan δ</th>
                  <th className="px-3 py-2 text-right font-medium">Best T₁ (µs)</th>
                  <th className="px-3 py-2 font-medium">Notes / refs</th>
                </tr>
              </thead>
              <tbody>
                {CONDUCTORS.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-3 font-medium text-fg">
                      {m.name}{" "}
                      <Badge tone={m.tcK > 0 ? "cyan" : "neutral"}>{m.tcK > 0 ? "SC" : "normal"}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{m.tcK > 0 ? m.tcK.toFixed(1) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{m.rho_n_uohm_cm ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{m.surface_tanD != null ? m.surface_tanD.toExponential(1) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg">{fmtT1(m.best_t1_us)}</td>
                    <td className="px-3 py-3 text-fg-subtle">
                      {m.note}
                      {Array.isArray(m.refs) && m.refs.length > 0 && (
                        <span className="ml-1 text-2xs text-fg-subtle/80">· {m.refs.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Substrates */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan/12 text-cyan">
              <Layers className="h-[1.1rem] w-[1.1rem]" />
            </div>
            <div>
              <h2 className="font-display text-[0.95rem] font-semibold tracking-tight">Substrates</h2>
              <p className="text-sm text-fg-subtle">Dielectric wafers — compared by εr, bulk loss & thermal conductivity</p>
            </div>
          </div>
          <Badge tone="cyan">{SUBSTRATES.length}</Badge>
        </div>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2 font-medium">Substrate</th>
                  <th className="px-3 py-2 text-right font-medium">εr</th>
                  <th className="px-3 py-2 text-right font-medium">Bulk tan δ</th>
                  <th className="px-3 py-2 text-right font-medium">Thermal (W/m·K)</th>
                  <th className="px-3 py-2 text-right font-medium">Best T₁ (µs)</th>
                  <th className="px-3 py-2 font-medium">Notes / refs</th>
                </tr>
              </thead>
              <tbody>
                {SUBSTRATES.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-3 font-medium text-fg">{s.name}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{s.eps.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{s.tanD.toExponential(0)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{s.thermal_W_mK ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-fg">{fmtT1(s.best_t1_us)}</td>
                    <td className="px-3 py-3 text-fg-subtle">
                      {s.note}
                      {Array.isArray(s.refs) && s.refs.length > 0 && (
                        <span className="ml-1 text-2xs text-fg-subtle/80">· {s.refs.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Material-choice coherence predictor: pick a substrate + film + qubit frequency →
 *  dielectric-limited Q/T1 and which interface dominates the loss (live, from the backend). */
function CoherencePredictor({ conductors, substrates }: { conductors: any[]; substrates: any[] }) {
  const scConductors = useMemo(() => conductors.filter((c) => c.tcK > 0), [conductors]);
  const [conductor, setConductor] = useState("ta");
  const [substrate, setSubstrate] = useState("sapphire");
  const [f01, setF01] = useState(5.0);
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.predictCoherence(substrate, conductor, f01)
      .then((d: any) => { if (live) setRes(d); })
      .catch(() => { if (live) setRes(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [substrate, conductor, f01]);

  return (
    <Card>
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet/12 text-violet">
          <Gauge className="h-[1.1rem] w-[1.1rem]" />
        </div>
        <div>
          <h2 className="font-display text-[0.95rem] font-semibold tracking-tight">Coherence predictor</h2>
          <p className="text-sm text-fg-subtle">Which material stack gives the best T₁? (interface-participation loss budget)</p>
        </div>
      </div>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Film" className="w-44">
            <Select value={conductor} onChange={(e) => setConductor(e.target.value)}>
              {scConductors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Substrate" className="w-44">
            <Select value={substrate} onChange={(e) => setSubstrate(e.target.value)}>
              {substrates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="f₀₁ (GHz)" className="w-28">
            <Input value={f01} onChange={(e) => setF01(Number(e.target.value) || 0)} />
          </Field>
          <div className="ml-auto flex items-center gap-6">
            <div>
              <p className="text-2xs uppercase tracking-wider text-fg-subtle">Dielectric T₁</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-primary">
                {loading ? "…" : fmtT1(res?.T1_dielectric_us)}<span className="ml-1 text-sm font-normal text-fg-subtle">µs</span>
              </p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wider text-fg-subtle">Internal Q</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-cyan">
                {loading ? "…" : res?.Q_internal != null ? (res.Q_internal / 1e6).toFixed(2) : "—"}<span className="ml-1 text-sm font-normal text-fg-subtle">M</span>
              </p>
            </div>
          </div>
        </div>

        {res && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-fg-muted">
              Loss is dominated by <span className="font-semibold text-warning">{res.dominant_channel}</span>.
              {res.film_best_t1_us != null && (
                <> Published best T₁ for {res.conductor}: <span className="font-mono text-fg">{fmtT1(res.film_best_t1_us)} µs</span>.</>
              )}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {(res.channels || []).map((c: any) => (
                <div key={c.name} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <p className="text-2xs text-fg-subtle">{c.name}</p>
                  <p className="font-mono text-sm tabular-nums text-fg">{c.T1_us != null ? `${fmtT1(c.T1_us)} µs` : "∞"}</p>
                  <p className="text-3xs text-fg-subtle">p·tanδ = {c.inv_q?.toExponential?.(1) ?? "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-3xs text-fg-subtle">{res.method}. First-order estimate — run the Surface-Participation analysis on a real layout for the geometry-derived value.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
