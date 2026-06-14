import { FlaskConical, Zap, Layers } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CONDUCTORS, SUBSTRATES } from "@/data/mockData";

export default function MaterialLibrary() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Library"
        subtitle="Conductors and substrates with their electromagnetic properties."
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {/* Conductors */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
              <Zap className="h-[1.1rem] w-[1.1rem]" />
            </div>
            <div>
              <h2 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Conductors
              </h2>
              <p className="text-sm text-fg-subtle">Superconducting & normal metals</p>
            </div>
          </div>
          <Badge tone="primary">{CONDUCTORS.length}</Badge>
        </div>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Conductivity (S/m)</th>
                  <th className="px-3 py-2 text-right font-medium">Tc (K)</th>
                  <th className="px-3 py-2 text-right font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {CONDUCTORS.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-3 font-medium text-fg">{m.name}</td>
                    <td className="px-3 py-3 text-right font-mono text-fg-muted">{m.conductivity_Sm.toExponential(1)}</td>
                    <td className="px-3 py-3 text-right font-mono text-fg-muted">{m.tcK > 0 ? m.tcK.toFixed(1) : "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <Badge tone={m.tcK > 0 ? "cyan" : "neutral"}>
                        {m.tcK > 0 ? "superconductor" : "normal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-fg-subtle">{m.note}</td>
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
              <h2 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Substrates
              </h2>
              <p className="text-sm text-fg-subtle">Dielectric wafers</p>
            </div>
          </div>
          <Badge tone="cyan">{SUBSTRATES.length}</Badge>
        </div>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2 font-medium">Substrate</th>
                  <th className="px-3 py-2 text-right font-medium">εr</th>
                  <th className="px-3 py-2 text-right font-medium">Loss tangent</th>
                  <th className="px-3 py-2 text-right font-medium">Thickness (µm)</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {SUBSTRATES.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-3 font-medium text-fg">{s.name}</td>
                    <td className="px-3 py-3 text-right font-mono text-fg-muted">{s.eps.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right font-mono text-fg-muted">{s.tanD.toExponential(0)}</td>
                    <td className="px-3 py-3 text-right font-mono text-fg-muted">{s.thickness_um}</td>
                    <td className="px-3 py-3 text-fg-subtle">{s.note}</td>
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
