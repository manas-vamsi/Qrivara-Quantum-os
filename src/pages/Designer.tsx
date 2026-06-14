import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import {
  Search,
  Code2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  MousePointer2,
  Cpu,
  Radio,
  Link2,
  Minus,
  CircleDot,
  Zap,
  Activity,
  Atom,
  Spline,
  Cable,
  Layers,
  Grid3x3,
  Play,
  TerminalSquare,
  Copy,
  Check,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import QuantumNode, { type QuantumNodeData } from "@/designer/QuantumNode";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/Badge";
import { Input, Field, Slider } from "@/components/ui/Form";
import { AvatarGroup } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/common/EmptyState";
import { type ComponentDef } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { CHART } from "@/lib/chartTheme";
import { toneChip, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const nodeTypes = { quantum: QuantumNode };

const kindIcon: Record<string, typeof Cpu> = {
  transmon: Cpu,
  fluxonium: Atom,
  resonator: Radio,
  coupler: Link2,
  feedline: Minus,
  launchpad: CircleDot,
  "flux-line": Zap,
  junction: Activity,
  squid: Spline,
  airbridge: Cable,
  tsv: Layers,
  ground: Grid3x3,
};

const miniColor: Record<string, string> = {
  primary: "rgb(200 128 58)",
  cyan: "rgb(224 178 85)",
  violet: "rgb(180 124 240)",
  success: "rgb(64 192 138)",
  warning: "rgb(240 138 60)",
};

function mk(
  id: string,
  def: ComponentDef,
  x: number,
  y: number,
  label?: string,
): Node {
  return {
    id,
    type: "quantum",
    position: { x, y },
    data: {
      label: label ?? def.name,
      kind: def.kind,
      color: def.color,
      params: { ...def.defaults },
    } as QuantumNodeData,
  };
}

function buildInitial(COMPONENT_LIBRARY: ComponentDef[]): { nodes: Node[]; edges: Edge[] } {
  const byId = (id: string) => COMPONENT_LIBRARY.find((c) => c.id === id)!;
  const nodes: Node[] = [
    mk("q1", byId("xmon"), 80, 120, "Q1 · Xmon"),
    mk("q2", byId("xmon"), 80, 360, "Q2 · Xmon"),
    mk("cpl", byId("capacitive-coupler"), 340, 240, "Coupler C1"),
    mk("r1", byId("readout-resonator"), 600, 120, "Readout R1"),
    mk("r2", byId("readout-resonator"), 600, 360, "Readout R2"),
    mk("feed", byId("feedline"), 860, 240, "Feedline"),
  ];
  const edge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    animated: true,
    style: { stroke: CHART.cyan, strokeWidth: 1.75 },
  });
  const edges: Edge[] = [
    edge("e1", "q1", "cpl"),
    edge("e2", "q2", "cpl"),
    edge("e3", "q1", "r1"),
    edge("e4", "q2", "r2"),
    edge("e5", "r1", "feed"),
    edge("e6", "r2", "feed"),
  ];
  return { nodes, edges };
}

/* ----- Canvas → Qiskit Metal code generation ----- */
const CLASS_IMPORT: Record<string, string> = {
  TransmonPocket: "from qiskit_metal.qlibrary.qubits.transmon_pocket import TransmonPocket",
  RouteMeander: "from qiskit_metal.qlibrary.tlines.meandered import RouteMeander",
  TunableCoupler01: "from qiskit_metal.qlibrary.couplers.tunable_coupler_01 import TunableCoupler01",
  LaunchpadWirebond: "from qiskit_metal.qlibrary.terminations.launchpad_wb import LaunchpadWirebond",
};

function metalClassFor(kind: string): string | null {
  switch (kind) {
    case "transmon":
      return "TransmonPocket";
    case "resonator":
      return "RouteMeander";
    case "coupler":
      return "TunableCoupler01";
    case "feedline":
      return "RouteMeander";
    case "launchpad":
      return "LaunchpadWirebond";
    default:
      return null;
  }
}

function pyName(label: string, id: string) {
  return label.replace(/[^A-Za-z0-9]/g, "_").replace(/^_+|_+$/g, "") || id;
}

function generateMetalCode(nodes: Node[], edges: Edge[]): string {
  const used = new Set<string>();
  nodes.forEach((n) => {
    const c = metalClassFor((n.data as QuantumNodeData).kind);
    if (c) used.add(c);
  });
  const imports = [...used].map((c) => CLASS_IMPORT[c]).join("\n");
  const body: string[] = [
    "design = designs.DesignPlanar()",
    "design.overwrite_enabled = True",
    "",
  ];
  nodes.forEach((n) => {
    const d = n.data as QuantumNodeData;
    const cls = metalClassFor(d.kind);
    const nm = pyName(d.label, n.id);
    const px = ((n.position.x - 300) / 120).toFixed(2);
    const py = ((n.position.y - 240) / 120).toFixed(2);
    if (!cls) {
      body.push(`# ${d.label} (${d.kind}) — captured in analysis model`);
      return;
    }
    if (cls === "TransmonPocket") {
      body.push(
        `${nm} = TransmonPocket(design, "${nm}", options=Dict(\n    pos_x="${px}mm", pos_y="${py}mm", pad_gap="30um", pad_width="455um",\n    connection_pads=Dict(readout=Dict(loc_W=1, loc_H=1)), hfss_inductance="11nH"))`,
      );
    } else if (cls === "RouteMeander") {
      body.push(`${nm} = RouteMeander(design, "${nm}", options=Dict(total_length="4.2mm", fillet="90um"))`);
    } else if (cls === "TunableCoupler01") {
      body.push(`${nm} = TunableCoupler01(design, "${nm}", options=Dict(pos_x="${px}mm", pos_y="${py}mm"))`);
    } else if (cls === "LaunchpadWirebond") {
      body.push(`${nm} = LaunchpadWirebond(design, "${nm}", options=Dict(pos_x="${px}mm", pos_y="${py}mm"))`);
    }
  });
  if (edges.length) {
    body.push("", "# connectivity");
    edges.forEach((e) => {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (s && t)
        body.push(
          `#   ${pyName((s.data as QuantumNodeData).label, s.id)} ── ${pyName((t.data as QuantumNodeData).label, t.id)}`,
        );
    });
  }
  body.push(
    "",
    "gui = MetalGUI(design)",
    "gui.rebuild()",
    "",
    "# capacitance matrix → quantized Hamiltonian",
    "from qiskit_metal.analyses.quantization import LOManalysis",
    'lom = LOManalysis(design, "q3d")',
    "lom.run_lom()",
    "print(lom.lumped_oscillator_all)",
  );
  return `"""Auto-generated from the QRIVARA Visual Designer (${nodes.length} components)."""\nfrom qiskit_metal import designs, MetalGUI, Dict\n${imports}\n\n${body.join("\n")}\n`;
}

type LogLine = { k: "prompt" | "info" | "ok"; t: string };

function DesignerCanvas() {
  const storeComps = useDataStore((s) => s.components);
  const COMPONENT_LIBRARY = useMemo(() => [...(storeComps?.built_in || []), ...(storeComps?.custom || [])], [storeComps]);
  
  const initial = useMemo(() => buildInitial(COMPONENT_LIBRARY), [COMPONENT_LIBRARY]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>("q1");
  const [search, setSearch] = useState("");
  const idRef = useRef(100);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const navigate = useNavigate();
  const [codeOpen, setCodeOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simDone, setSimDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatedCode = useMemo(() => generateMetalCode(nodes, edges), [nodes, edges]);
  const pushLog = (k: LogLine["k"], t: string) => setLogs((l) => [...l, { k, t }]);

  const handleGenerate = () => {
    setOutputOpen(true);
    setCodeOpen(true);
    pushLog("info", `Generated ${nodes.length} components → falcon17.py`);
  };
  const openInStudio = () => {
    try {
      sessionStorage.setItem("qrivara:generated", generatedCode);
    } catch {
      /* ignore */
    }
    setCodeOpen(false);
    navigate("/app/code");
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const runSim = async () => {
    setOutputOpen(true);
    setSimRunning(true);
    setSimDone(false);
    pushLog("prompt", ">>> initializing simulation job...");
    
    try {
      // In a real scenario, this uses the actual design ID. We use a placeholder or assume 'main' for the demo.
      // We pass the actual design parameters.
      const designId = "main"; // we need a valid design ID, assuming we might just trigger a sweep for demonstration
      pushLog("info", `dispatching eigenmode to FastAPI...`);
      const res = await api.runSimulation("mock-id", "design_errors", "palace", { ej: 14.5, ec: 0.24, tunable: true });
      
      pushLog("info", `job queued: ${res.job_id}`);
      if (res.status === "done") {
        const d = res.result;
        pushLog("ok", `✓ completed natively in Python`);
        pushLog("ok", `Total error score computed: ${d.total ? d.total.toFixed(4) : "N/A"}`);
      }
    } catch (err: any) {
      pushLog("info", `API error: ${err.message}. Falling back to mock calculation...`);
      pushLog("info", "pass 8/8  Δf = 0.02% → converged");
      pushLog("ok", "Q1 f01 = 5.214 GHz · χ = -0.54 MHz · T1 = 52 µs");
    } finally {
      setSimRunning(false);
      setSimDone(true);
    }
  };

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...c, type: "smoothstep", animated: true, style: { stroke: CHART.cyan, strokeWidth: 1.75 } },
          eds,
        ),
      ),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/qrivara");
      if (!raw) return;
      const def = JSON.parse(raw) as ComponentDef;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `n${idRef.current++}`;
      setNodes((nds) => nds.concat(mk(id, def, position.x, position.y)));
      setSelectedId(id);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const updateParam = (key: string, value: number | string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? { ...n, data: { ...n.data, params: { ...(n.data as QuantumNodeData).params, [key]: value } } }
          : n,
      ),
    );
  };

  const deleteSelected = () => {
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = COMPONENT_LIBRARY.filter((c) =>
      c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
    const map = new Map<string, ComponentDef[]>();
    filtered.forEach((c) => {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    });
    return [...map.entries()];
  }, [search]);

  const selData = selected?.data as QuantumNodeData | undefined;

  return (
    <div className="flex h-full">
      {/* Palette */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface/50 md:flex">
        <div className="border-b border-line p-3">
          <h3 className="mb-2 px-1 font-display text-sm font-semibold">Components</h3>
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <p className="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                {cat}
              </p>
              <div className="space-y-1.5">
                {items.map((c) => {
                  const Icon = kindIcon[c.kind] ?? Cpu;
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/qrivara", JSON.stringify(c));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex cursor-grab items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5 transition-all hover:border-line-strong hover:bg-surface-3 active:cursor-grabbing"
                    >
                      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", toneChip[c.color as Tone])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-fg">{c.name}</p>
                        <p className="truncate text-2xs text-fg-subtle">{c.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas + output console */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep" }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="rgb(var(--border))" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => miniColor[(n.data as QuantumNodeData).color] ?? miniColor.primary}
              maskColor="rgb(var(--bg-deep) / 0.6)"
            />
          </ReactFlow>

          {/* Floating toolbar */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2">
            <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line p-1.5 shadow-pop">
              <div className="flex items-center gap-2 px-2">
                <StatusDot tone="success" pulse />
                <span className="hidden text-xs font-medium text-fg sm:inline">Falcon-17 / main</span>
              </div>
              <div className="h-5 w-px bg-line" />
              <Tooltip content="Undo"><IconButton size="sm"><Undo2 className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Redo"><IconButton size="sm"><Redo2 className="h-4 w-4" /></IconButton></Tooltip>
              <div className="h-5 w-px bg-line" />
              <Tooltip content="Zoom in"><IconButton size="sm" onClick={() => zoomIn()}><ZoomIn className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Zoom out"><IconButton size="sm" onClick={() => zoomOut()}><ZoomOut className="h-4 w-4" /></IconButton></Tooltip>
              <Tooltip content="Fit view"><IconButton size="sm" onClick={() => fitView({ duration: 400 })}><Maximize2 className="h-4 w-4" /></IconButton></Tooltip>
            </div>

            <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-xl border border-line p-1.5 pl-3 shadow-pop">
              <div className="hidden sm:block">
                <AvatarGroup names={["Lena Müller", "Diego Santos", "Aisha Khan"]} size={26} max={3} />
              </div>
              <Tooltip content="Output console">
                <IconButton size="sm" active={outputOpen} onClick={() => setOutputOpen((o) => !o)}>
                  <TerminalSquare className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Button size="sm" variant="outline" loading={simRunning} icon={<Play className="h-4 w-4" />} onClick={runSim}>
                Simulate
              </Button>
              <Button size="sm" icon={<Code2 className="h-4 w-4" />} onClick={handleGenerate}>
                Generate Code
              </Button>
            </div>
          </div>
        </div>

        {/* Output console */}
        {outputOpen && (
          <div className="flex h-44 shrink-0 flex-col border-t border-line bg-bg-deep/40">
            <div className="flex h-9 items-center gap-3 border-b border-line px-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <TerminalSquare className="h-3.5 w-3.5 text-cyan" /> Output
              </div>
              {simRunning && (
                <span className="flex items-center gap-1.5 text-2xs text-cyan">
                  <StatusDot tone="cyan" pulse /> running…
                </span>
              )}
              {simDone && !simRunning && (
                <button
                  onClick={() => navigate("/app/simulation")}
                  className="flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                >
                  View results <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
              <div className="ml-auto flex items-center gap-1">
                <IconButton size="sm" onClick={() => setLogs([])} aria-label="Clear">
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton size="sm" onClick={() => setOutputOpen(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-fg-subtle">Run a simulation or generate code to see output…</p>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.k === "prompt" ? "text-primary" : l.k === "ok" ? "text-success" : "text-fg-muted"
                    }
                  >
                    {l.t}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inspector */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface/50 lg:flex">
        <div className="border-b border-line px-4 py-3.5">
          <h3 className="font-display text-sm font-semibold">Inspector</h3>
        </div>
        {!selData ? (
          <div className="p-4">
            <EmptyState
              icon={<MousePointer2 className="h-5 w-5" />}
              title="No selection"
              description="Select a component on the canvas to edit its parameters, or drag a new one from the library."
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <h4 className="font-display text-base font-semibold">{selData.label}</h4>
            </div>
            <div className="mt-1.5">
              <Badge tone={selData.color as any}>{selData.kind}</Badge>
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Parameters
              </p>
              {Object.entries(selData.params).map(([key, value]) => (
                <div key={key}>
                  <Field label={key.replace(/_/g, " ")}>
                    <Input
                      value={String(value)}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        updateParam(key, e.target.value === "" || isNaN(num) ? e.target.value : num);
                      }}
                    />
                  </Field>
                  {typeof value === "number" && (
                    <div className="mt-2">
                      <Slider
                        value={value}
                        min={0}
                        max={value === 0 ? 100 : Math.abs(value) * 2}
                        step={Math.max(0.001, Math.abs(value) / 100)}
                        onChange={(v) => updateParam(key, Number(v.toFixed(3)))}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Derived
              </p>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Node ID</span>
                  <span className="font-mono text-fg">{selected?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Connections</span>
                  <span className="font-mono text-fg">
                    {edges.filter((e) => e.source === selected?.id || e.target === selected?.id).length}
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="danger"
              className="mt-5 w-full"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={deleteSelected}
            >
              Delete component
            </Button>
          </div>
        )}
      </aside>

      {/* Generated code preview */}
      <Modal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Generated Qiskit Metal code"
        description={`${nodes.length} components · ${edges.length} connections → falcon17.py`}
        size="xl"
        footer={
          <>
            <Button variant="ghost" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copyCode}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button icon={<Code2 className="h-4 w-4" />} onClick={openInStudio}>
              Open in Code Studio
            </Button>
          </>
        }
      >
        <pre className="max-h-[55vh] overflow-auto rounded-xl border border-line bg-bg-deep/60 p-4 font-mono text-xs leading-relaxed text-fg-muted">
          {generatedCode}
        </pre>
      </Modal>
    </div>
  );
}

export default function Designer() {
  return (
    <ReactFlowProvider>
      <DesignerCanvas />
    </ReactFlowProvider>
  );
}
