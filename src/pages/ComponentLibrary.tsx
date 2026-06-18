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
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { type ComponentKind, type ComponentDef } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
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
  const fetchProjects = useDataStore((s) => s.fetchProjects);
  const navigate = useNavigate();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const validated: any[] = (storeComps as any)?.validated_designs || [];
  const COMPONENT_LIBRARY = useMemo(() => {
    // combine built-in and custom if desired, or just use built_in
    return [...(storeComps?.built_in || []), ...(storeComps?.custom || [])];
  }, [storeComps]);

  // One-click "load a fab-ready design": create a project, seed its canvas with a
  // qubit carrying the validated parameters, and open it in the Designer.
  const useValidated = async (vd: any) => {
    setLoadingId(vd.id);
    try {
      const proj = await api.createProject({
        name: vd.name, description: vd.source || "Validated reference design",
        domain: "superconducting", qubits: 1, tags: ["validated"],
      });
      await fetchProjects();
      const designs = await api.getProjectDesigns(proj.id);
      const d0 = designs?.[0];
      if (d0) {
        const node = {
          id: "q1", position: { x: 400, y: 280 },
          data: {
            kind: vd.qubit, label: vd.name,
            color: vd.qubit === "fluxonium" ? "violet" : "primary",
            params: vd.params || {},
          },
        };
        await api.saveDesign(d0.id, d0.version ?? 0, { nodes: [node], edges: [] });
      }
      navigate("/app/designer");
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingId(null);
    }
  };

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

      {validated.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-base font-semibold tracking-tight text-fg">
            Validated Designs
            <span className="ml-2 text-sm font-normal text-fg-subtle">{validated.length}</span>
          </h2>
          <p className="mb-3 text-sm text-fg-subtle">
            Fab-ready reference designs with measured-vs-simulated values — one click to start a new project from one.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {validated.map((vd) => {
              const Icon = vd.qubit === "fluxonium" ? Atom : Cpu;
              const v = vd.validated || {};
              return (
                <Card key={vd.id} hover>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneChip[(vd.qubit === "fluxonium" ? "violet" : "primary") as Tone])}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-sm font-semibold text-fg">{vd.name}</h3>
                          <p className="text-xs text-fg-subtle">{vd.source}</p>
                        </div>
                      </div>
                      <Badge tone="success" dot>validated</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <Spec label="Target f₀₁" value={`${vd.target_freq_GHz} GHz`} />
                      <Spec label="Anharmonicity" value={`${vd.anharmonicity_MHz} MHz`} />
                      {v.measured_f01_GHz != null && <Spec label="Measured f₀₁" value={`${v.measured_f01_GHz} GHz`} />}
                      {v.measured_T1_us != null && <Spec label="Measured T₁" value={`${v.measured_T1_us} µs`} />}
                      {v.yield_pct != null && <Spec label="Yield" value={`${v.yield_pct}%`} />}
                    </div>
                    <Button
                      className="mt-4 w-full"
                      loading={loadingId === vd.id}
                      onClick={() => useValidated(vd)}
                    >
                      Use this design
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/40 py-0.5 last:border-0">
      <span className="text-fg-muted">{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}
