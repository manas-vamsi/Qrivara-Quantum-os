import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import {
  Boxes,
  Eye,
  Layers,
  Grid3x3,
  MousePointer2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { useDesignStore } from "@/store/useDesignStore";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUBSTRATE = "#1a1613";
const GROUND = "#b87333";
const toneHex: Record<string, string> = {
  primary: "#c8803a",
  cyan: "#2dd4e9",
  violet: "#b47cf0",
  success: "#40c08a",
  warning: "#f0a93c",
};

const T = 0.06;
const Y = 0.19;

interface Part {
  id: string;
  kind: string;
  color: string;
  label: string;
  params: Record<string, unknown>;
  x: number;
  z: number;
}

const SIZE: Record<string, [number, number]> = {
  transmon: [1.4, 1.4],
  fluxonium: [1.0, 1.0],
  resonator: [2.0, 0.18],
  coupler: [0.7, 0.9],
  feedline: [0.18, 3.0],
  launchpad: [0.5, 0.5],
  junction: [0.3, 0.3],
  "flux-line": [0.16, 1.2],
  ground: [1.0, 1.0],
  airbridge: [0.5, 0.5],
};

const SAMPLE_EDGES = [
  { source: "q1", target: "cpl" },
  { source: "q2", target: "cpl" },
  { source: "q1", target: "r1" },
  { source: "r1", target: "feed" },
];

/* Sample shown when nothing has been designed yet. */
const SAMPLE = [
  { id: "q1", data: { label: "Q1 · Xmon", kind: "transmon", color: "primary", params: { target_freq_GHz: 5.2 } }, position: { x: 80, y: 120 } },
  { id: "q2", data: { label: "Q2 · Xmon", kind: "transmon", color: "primary", params: { target_freq_GHz: 5.0 } }, position: { x: 80, y: 360 } },
  { id: "cpl", data: { label: "Coupler C1", kind: "coupler", color: "violet", params: {} }, position: { x: 340, y: 240 } },
  { id: "r1", data: { label: "Readout R1", kind: "resonator", color: "cyan", params: { frequency_GHz: 7.1 } }, position: { x: 600, y: 120 } },
  { id: "feed", data: { label: "Feedline", kind: "feedline", color: "success", params: {} }, position: { x: 860, y: 240 } },
];

function mapNodes(nodes: any[]): Part[] {
  if (!nodes.length) return [];
  const xs = nodes.map((n) => n.position?.x ?? 0);
  const ys = nodes.map((n) => n.position?.y ?? 0);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return nodes
    .filter((n) => (n.data?.kind ?? "") !== "ground")
    .map((n) => ({
      id: n.id,
      kind: n.data?.kind ?? "transmon",
      color: n.data?.color ?? "primary",
      label: n.data?.label ?? n.id,
      params: n.data?.params ?? {},
      x: Math.max(-4.5, Math.min(4.5, ((n.position?.x ?? 0) - cx) / 130)),
      z: Math.max(-3.3, Math.min(3.3, ((n.position?.y ?? 0) - cy) / 130)),
    }));
}

function PartMesh({
  part,
  selected,
  wire,
  onSelect,
}: {
  part: Part;
  selected: boolean;
  wire: boolean;
  onSelect: () => void;
}) {
  const color = toneHex[part.color] ?? toneHex.primary;
  const [w, d] = SIZE[part.kind] ?? [0.8, 0.8];
  const y = part.kind === "airbridge" ? 0.4 : Y;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };
  const mat = (
    <meshStandardMaterial color={color} metalness={0.85} roughness={0.35} wireframe={wire} emissive={color} emissiveIntensity={selected ? 0.7 : 0.08} />
  );
  return (
    <group position={[part.x, y, part.z]}>
      {selected && (
        <mesh position={[0, -y + 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[Math.max(w, d) * 0.62, Math.max(w, d) * 0.8, 36]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
        </mesh>
      )}
      {part.kind === "transmon" ? (
        <group onClick={onClick}>
          <mesh castShadow>
            <boxGeometry args={[w, T, d * 0.28]} />
            {mat}
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[w * 0.28, T, d]} />
            <meshStandardMaterial color={color} metalness={0.85} roughness={0.35} wireframe={wire} emissive={color} emissiveIntensity={selected ? 0.7 : 0.08} />
          </mesh>
        </group>
      ) : part.kind === "airbridge" ? (
        <mesh rotation={[0, 0, Math.PI / 2]} onClick={onClick}>
          <torusGeometry args={[0.22, 0.04, 8, 24, Math.PI]} />
          {mat}
        </mesh>
      ) : (
        <mesh castShadow onClick={onClick}>
          <boxGeometry args={[w, T, d]} />
          {mat}
        </mesh>
      )}
    </group>
  );
}

function Wires({ parts, edges }: { parts: Part[]; edges: { source: string; target: string }[] }) {
  const pos = new Map(parts.map((p) => [p.id, [p.x, Y, p.z] as [number, number, number]]));
  return (
    <>
      {edges.map((e, i) => {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) return null;
        return <Line key={i} points={[a, b]} color="#2dd4e9" lineWidth={2} transparent opacity={0.7} />;
      })}
    </>
  );
}

function Scene({
  parts,
  edges,
  selectedId,
  wire,
  showGround,
  showGrid,
  onSelect,
}: {
  parts: Part[];
  edges: { source: string; target: string }[];
  selectedId: string | null;
  wire: boolean;
  showGround: boolean;
  showGrid: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 6]} intensity={1.4} castShadow />
      <directionalLight position={[-8, 6, -4]} intensity={0.4} color="#b47cf0" />

      <mesh position={[0, 0, 0]} receiveShadow onClick={() => onSelect(null)}>
        <boxGeometry args={[10, 0.3, 8]} />
        <meshStandardMaterial color={SUBSTRATE} metalness={0.1} roughness={0.9} wireframe={wire} />
      </mesh>

      {showGround && (
        <mesh position={[0, 0.16, 0]} raycast={() => null}>
          <boxGeometry args={[9.6, 0.02, 7.6]} />
          <meshStandardMaterial color={GROUND} metalness={0.9} roughness={0.4} transparent opacity={wire ? 1 : 0.3} wireframe={wire} />
        </mesh>
      )}

      <Wires parts={parts} edges={edges} />

      {parts.map((p) => (
        <PartMesh key={p.id} part={p} selected={p.id === selectedId} wire={wire} onSelect={() => onSelect(p.id)} />
      ))}

      {showGrid && (
        <Grid args={[20, 20]} position={[0, 0.011, 0]} cellColor="#3a3430" sectionColor="#5a4f45" fadeDistance={28} infiniteGrid />
      )}

      <OrbitControls enablePan makeDefault minDistance={4} maxDistance={30} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export default function View3D() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projects = useDataStore((s) => s.projects);
  const liveNodes = useDesignStore((s) => s.nodes);
  const liveEdges = useDesignStore((s) => s.edges);

  // null = nothing chosen yet (show the picker); "live" = current canvas; else a project id.
  const [source, setSource] = useState<string | null>(searchParams.get("source"));
  const [loaded, setLoaded] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wire, setWire] = useState(false);
  const [showGround, setShowGround] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [designId, setDesignId] = useState<string | null>(null);
  const [mesh, setMesh] = useState<any>(null);
  const [meshLoading, setMeshLoading] = useState(false);

  // Load the selected project's saved design from the backend.
  useEffect(() => {
    setSelectedId(null);
    setMesh(null);
    if (!source || source === "live") {
      setLoaded(null);
      setDesignId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getProjectDesigns(source)
      .then((designs: any[]) => {
        if (cancelled) return;
        const doc = designs?.[0]?.doc ?? { nodes: [], edges: [] };
        setDesignId(designs?.[0]?.id ?? null);
        setLoaded({ nodes: doc.nodes || [], edges: doc.edges || [] });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ nodes: [], edges: [] });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const rawNodes = source === "live" ? liveNodes : loaded?.nodes ?? [];
  const rawEdges = source === "live" ? liveEdges : loaded?.edges ?? [];
  const isSample = source === "live" && rawNodes.length === 0;
  const parts = useMemo(() => mapNodes(isSample ? SAMPLE : rawNodes), [rawNodes, isSample]);
  const edges = isSample ? SAMPLE_EDGES : rawEdges;
  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const sourceName =
    source === "live" ? "Current canvas" : projects.find((p: any) => p.id === source)?.name ?? "Project";

  // Generate a mesh for the selected project's design via the live backend.
  const runMesh = async () => {
    if (!designId) return;
    setMeshLoading(true);
    try {
      const job: any = await api.runSimulation(designId, "mesh", "palace", { quality: "medium" });
      setMesh(job?.result ?? job ?? null);
      setWire(true); // show the mesh (wireframe) once generated
    } catch {
      /* offline */
    }
    setMeshLoading(false);
  };

  // ── Selection gate: choose what to open before rendering the 3D scene ──
  if (!source) {
    return (
      <div className="h-full overflow-y-auto bg-bg-deep">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-12">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
              <Boxes className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Open a design in 3D</h2>
            <p className="mt-1 text-sm text-fg-subtle">Choose a project to visualize — or your current 2D canvas.</p>
          </div>

          <button
            onClick={() => setSource("live")}
            className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-fg">Current canvas (live)</p>
              <p className="text-xs text-fg-subtle">Whatever you're editing in the Visual Designer right now</p>
            </div>
          </button>

          <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Projects</p>
          {projects.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-5 w-5" />}
              title="No projects yet"
              description="Create one with “New Design,” then open it here in 3D."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => setSource(p.id)}
                  className="flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                      {p.qubits}Q
                    </span>
                    <Badge tone={(p.status === "active" ? "primary" : "neutral") as any}>{p.status ?? "design"}</Badge>
                  </div>
                  <h4 className="mt-3 truncate text-sm font-semibold text-fg">{p.name}</h4>
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{p.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 3D canvas */}
      <div className="relative flex-1 bg-bg-deep">
        <Canvas shadows camera={{ position: [9, 8, 10], fov: 42 }} dpr={[1, 2]}>
          <color attach="background" args={["#0d0b09"]} />
          <Scene
            parts={parts}
            edges={edges}
            selectedId={selectedId}
            wire={wire}
            showGround={showGround}
            showGrid={showGrid}
            onSelect={setSelectedId}
          />
        </Canvas>

        {/* Title */}
        <div className="pointer-events-none absolute left-4 top-4">
          <div className="glass flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 shadow-pop">
            <Boxes className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-fg">3D Device View</p>
              <p className="text-2xs text-fg-subtle">
                {loading
                  ? "Loading design…"
                  : isSample
                    ? "Sample · select a project →"
                    : `${sourceName} · ${parts.length} components`}
              </p>
            </div>
          </div>
        </div>

        {/* Project selector + mesh generation */}
        <div className="absolute right-4 top-4 w-60 space-y-2">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="live">Current canvas (live)</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          {source !== "live" && designId && (
            <div className="glass space-y-2 rounded-xl border border-line p-3 shadow-pop">
              <Button size="sm" className="w-full" loading={meshLoading} icon={<Grid3x3 className="h-4 w-4" />} onClick={runMesh}>
                Generate Mesh
              </Button>
              {mesh && (
                <div className="grid grid-cols-2 gap-2">
                  <MeshStat label="Elements" value={Number(mesh.elements ?? 0).toLocaleString()} />
                  <MeshStat label="Nodes" value={Number(mesh.nodes ?? 0).toLocaleString()} />
                  <MeshStat label="Quality" value={String(mesh.quality ?? "—")} />
                  <MeshStat label="Regions" value={String(mesh.regions ?? "—")} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* View toggles */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="glass flex items-center gap-4 rounded-full border border-line px-4 py-2 shadow-pop">
            <Toggle icon={<Eye className="h-3.5 w-3.5" />} label="Mesh" v={wire} set={setWire} />
            <Toggle icon={<Layers className="h-3.5 w-3.5" />} label="Ground" v={showGround} set={setShowGround} />
            <Toggle icon={<Grid3x3 className="h-3.5 w-3.5" />} label="Grid" v={showGrid} set={setShowGrid} />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4">
          <div className="glass rounded-full border border-line px-3 py-1.5 text-2xs text-fg-subtle shadow-pop">
            Drag to orbit · scroll to zoom · click a part to inspect
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface/50 lg:flex">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <h3 className="font-display text-sm font-semibold">Inspector</h3>
          <Button variant="ghost" size="sm" icon={<Workflow className="h-3.5 w-3.5" />} onClick={() => navigate("/app/designer")}>
            Designer
          </Button>
        </div>
        {!selected ? (
          <div className="p-4">
            <EmptyState
              icon={<MousePointer2 className="h-5 w-5" />}
              title="Click a component"
              description="Select a part in the 3D scene to see its parameters. To add or move components, design in the 2D Visual Designer — this view stays in sync."
            />
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <h4 className="font-display text-base font-semibold">{selected.label}</h4>
              <div className="mt-1.5">
                <Badge tone={(selected.color as any) || "neutral"}>{selected.kind}</Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Parameters</p>
              {Object.keys(selected.params).length === 0 ? (
                <p className="text-xs text-fg-subtle">No parameters set.</p>
              ) : (
                Object.entries(selected.params).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-line/50 py-1 text-xs last:border-0">
                    <span className="text-fg-muted">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono text-fg">{String(v)}</span>
                  </div>
                ))
              )}
            </div>
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-2xs text-fg-subtle">
              Positions, wiring and parameters are edited in the <span className="font-medium text-fg">Visual Designer</span>; this 3D view mirrors them live.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function MeshStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2 py-1.5">
      <p className="text-[0.6rem] uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="font-mono text-xs font-semibold text-fg">{value}</p>
    </div>
  );
}

function Toggle({ icon, label, v, set }: { icon: React.ReactNode; label: string; v: boolean; set: (b: boolean) => void }) {
  return (
    <button
      onClick={() => set(!v)}
      className={cn("flex items-center gap-1.5 text-xs font-medium transition-colors", v ? "text-primary" : "text-fg-subtle hover:text-fg")}
    >
      {icon}
      {label}
    </button>
  );
}
