import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

const n = (v: any, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const fx = (v: any, p = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(p) : "—");

/** Standalone printable chip "datasheet" — every figure computed from the design.
 *  Lives outside the app shell so "Save as PDF" (browser print) captures only the report. */
export default function Report() {
  const [params] = useSearchParams();
  const designId = params.get("id");
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!designId) { setErr("No design specified."); return; }
    api.getDesignReport(designId).then(setR).catch((e) => setErr(e?.message || "Failed to load report"));
  }, [designId]);

  if (err) return <div className="mx-auto max-w-2xl p-10 text-center text-sm text-fg-subtle">{err}</div>;
  if (!r) return <div className="mx-auto max-w-2xl p-10 text-center text-sm text-fg-subtle">Assembling report…</div>;

  const s = r.summary || {};
  const coh = r.coherence || {};
  const g = r.gates || {};
  const y = r.yield || {};
  const cap = r.capacitance || {};

  return (
    <div className="min-h-dvh bg-white text-slate-900 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur print:hidden">
        <FileText className="h-4 w-4 text-amber-700" />
        <span className="text-sm font-semibold">Chip datasheet</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => window.close()}>Close</Button>
          <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Save as PDF</Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10 print:py-4">
        {/* Header */}
        <header className="border-b-2 border-amber-700 pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber-700">QRIVARA · Chip Datasheet</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{r.project_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Design “{r.design_name}” · generated {new Date(r.generated_at).toLocaleString()}
          </p>
        </header>

        {/* Summary */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: "Qubits", v: s.n_qubits ?? "—" },
            { l: "Components", v: s.n_components ?? "—" },
            { l: "DRC", v: s.drc_passed != null ? `${s.drc_passed}/${s.drc_total}` : "—" },
            { l: "Yield", v: s.yield_pct != null ? `${s.yield_pct}%` : "—" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">{m.l}</p>
              <p className="font-mono text-xl font-semibold">{m.v}</p>
            </div>
          ))}
        </section>

        <Section title="Per-qubit Hamiltonian" note={r.lom_source}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="py-1.5">Qubit</th><th>f₀₁ (GHz)</th><th>α (MHz)</th><th>E_C (MHz)</th><th>E_J (GHz)</th><th>E_J/E_C</th>
            </tr></thead>
            <tbody>
              {(r.qubits || []).map((q: any, i: number) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 font-medium">{q.qubit}</td>
                  <td className="font-mono">{fx(q.f01_GHz, 4)}</td>
                  <td className="font-mono">{fx(q.anharmonicity_MHz, 1)}</td>
                  <td className="font-mono">{fx(q.EC_MHz, 1)}</td>
                  <td className="font-mono">{fx(q.EJ_GHz, 2)}</td>
                  <td className="font-mono">{fx(q.EJ_EC, 1)}</td>
                </tr>
              ))}
              {!(r.qubits || []).length && <tr><td colSpan={6} className="py-2 text-slate-400">No transmons in this design.</td></tr>}
            </tbody>
          </table>
        </Section>

        <Section title="Coherence budget">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <KV k="T₁ (total)" v={`${fx(coh.T1_total_us, 1)} µs`} />
            <KV k="T₁ dielectric" v={`${fx(coh.T1_dielectric_us, 1)} µs`} />
            <KV k="T₁ Purcell" v={coh.T1_purcell_us != null ? `${fx(coh.T1_purcell_us, 1)} µs` : "—"} />
            <KV k="T₂ Ramsey" v={`${fx(coh.T2_ramsey_us, 1)} µs`} />
            <KV k="T₂ echo" v={`${fx(coh.T2_echo_us, 1)} µs`} />
            <KV k="Q dielectric" v={coh.Q_dielectric != null ? n(coh.Q_dielectric).toLocaleString() : "—"} />
          </div>
        </Section>

        <Section title="Gate fidelity">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <KV k="1-qubit" v={`${fx(g.fidelity_1q_pct, 4)} %`} />
            <KV k="2-qubit" v={`${fx(g.fidelity_2q_pct, 4)} %`} />
            <KV k="1Q gate time" v={g.t_gate_1q_ns != null ? `${g.t_gate_1q_ns} ns` : "—"} />
            <KV k="2Q gate time" v={g.t_gate_2q_ns != null ? `${g.t_gate_2q_ns} ns` : "—"} />
          </div>
        </Section>

        <Section title="Fabrication yield" note={y.method}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            <KV k="Yield" v={y.yield_pct != null ? `${y.yield_pct} %` : "—"} />
            <KV k="Frequency drift (1σ)" v={y.frequency_drift_MHz != null ? `${y.frequency_drift_MHz} MHz` : "—"} />
            <KV k="Mean f₀₁" v={y.mean_f01_GHz != null ? `${y.mean_f01_GHz} GHz` : "—"} />
          </div>
        </Section>

        {Array.isArray(cap.matrix) && cap.matrix.length > 0 && (
          <Section title="Maxwell capacitance matrix (fF)" note={cap.method}>
            <div className="overflow-x-auto">
              <table className="text-xs font-mono">
                <thead><tr><th></th>{(cap.labels || []).map((l: string) => <th key={l} className="px-2 py-1 text-slate-400">{l}</th>)}</tr></thead>
                <tbody>
                  {cap.matrix.map((row: number[], i: number) => (
                    <tr key={i}>
                      <td className="px-2 py-1 font-semibold">{(cap.labels || [])[i]}</td>
                      {(row || []).map((v: number, j: number) => (
                        <td key={j} className={`border border-slate-200 px-2 py-1 text-center ${i === j ? "bg-amber-50 font-semibold" : ""}`}>{fx(v, 1)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="Design-rule check">
          <div className="flex flex-wrap gap-2">
            {((r.drc || {}).checks || []).map((c: any) => (
              <span key={c.id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {c.name}: {c.passed ? "pass" : `${c.count} issue${c.count === 1 ? "" : "s"}`}
              </span>
            ))}
          </div>
          {((r.drc || {}).drc_warnings || []).length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
              {(r.drc.drc_warnings || []).map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </Section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Generated by QRIVARA — superconducting quantum-hardware EDA. Every value is computed from the design (FEM capacitance → Hamiltonian → coherence → gates → yield), not measured hardware. Validate against a fabricated device before tape-out.
        </footer>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {note && <span className="truncate text-right text-2xs text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex items-baseline justify-between gap-2"><span className="text-slate-500">{k}</span><span className="font-mono font-medium">{v}</span></div>;
}
