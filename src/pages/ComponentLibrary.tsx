import { useMemo, useState } from "react";
import {
  Boxes,
  Search,
  Cpu,
  Atom,
  Radio,
  Link2,
  Minus,
  CircleDot,
  Zap,
  Activity,
  Grid3x3,
  Cable,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { type ComponentKind, type ComponentDef } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { toneChip, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const kindIcon: Record<string, typeof Cpu> = {
  transmon: Cpu,
  fluxonium: Atom,
  resonator: Radio,
  coupler: Link2,
  feedline: Minus,
  launchpad: CircleDot,
  "flux-line": Zap,
  junction: Activity,
  squid: Activity,
  airbridge: Cable,
  tsv: Grid3x3,
  ground: Grid3x3,
};

const CATEGORY_ORDER = [
  "Qubits",
  "Resonators",
  "Couplers",
  "Control",
  "Readout",
  "Chip",
];

/** Format a default key into a human label (pad_width_um → "Pad width (um)"). */
function labelFor(key: string) {
  const unitMatch = key.match(/_(um|nm|mm|fF|pH|nH|GHz|MHz|dBm|mA|ohm|um2)$/i);
  let unit = unitMatch ? unitMatch[1] : "";
  let base = unit ? key.slice(0, -(unit.length + 1)) : key;
  base = base.replace(/_/g, " ");
  const unitMap: Record<string, string> = {
    um: "µm", um2: "µm²", ohm: "Ω", nm: "nm", mm: "mm", GHz: "GHz",
    MHz: "MHz", fF: "fF", pH: "pH", nH: "nH", dBm: "dBm", mA: "mA",
  };
  return { label: base.charAt(0).toUpperCase() + base.slice(1), unit: unitMap[unit] ?? unit };
}

export default function ComponentLibrary() {
  const [q, setQ] = useState("");
  const storeComps = useDataStore((s) => s.components);
  const COMPONENT_LIBRARY = useMemo(() => {
    // combine built-in and custom if desired, or just use built_in
    return [...(storeComps?.built_in || []), ...(storeComps?.custom || [])];
  }, [storeComps]);

  const grouped = useMemo(() => {
    const s = q.toLowerCase();
    const filtered = COMPONENT_LIBRARY.filter(
      (c) =>
        !s ||
        c.name.toLowerCase().includes(s) ||
        c.description.toLowerCase().includes(s) ||
        c.category.toLowerCase().includes(s),
    );
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((c) => c.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Component Library"
        subtitle="Every superconducting-circuit component and the parameters it exposes."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <Badge tone="primary">{COMPONENT_LIBRARY.length} components</Badge>
        }
      />

      <div className="max-w-xs">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Search components…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon={<Boxes className="h-5 w-5" />} title="No components match" description="Try another search." />
      ) : (
        grouped.map((group) => (
          <section key={group.cat}>
            <h2 className="mb-3 font-display text-base font-semibold tracking-tight text-fg">
              {group.cat}
              <span className="ml-2 text-sm font-normal text-fg-subtle">
                {group.items.length}
              </span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((c) => {
                const Icon = kindIcon[c.kind] ?? Cpu;
                return (
                  <Card key={c.id} hover>
                    <CardContent className="pt-5">
                      <div className="flex items-start gap-3">
                        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneChip[c.color as Tone])}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-sm font-semibold text-fg">{c.name}</h3>
                          <p className="text-xs text-fg-subtle">{c.description}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                          Parameters
                        </p>
                        {Object.entries(c.defaults).map(([k, v]) => {
                          const { label, unit } = labelFor(k);
                          return (
                            <div
                              key={k}
                              className="flex items-center justify-between border-b border-line/50 py-1 text-xs last:border-0"
                            >
                              <span className="text-fg-muted">{label}</span>
                              <span className="font-mono text-fg">
                                {String(v)}
                                {unit ? <span className="text-fg-subtle"> {unit}</span> : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
