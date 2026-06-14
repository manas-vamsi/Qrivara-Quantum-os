import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuantumNodeData {
  label: string;
  kind: string;
  color: "primary" | "cyan" | "violet" | "success" | "warning";
  params: Record<string, number | string>;
  [key: string]: unknown;
}

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

const colorMap: Record<string, { chip: string; ring: string; dot: string }> = {
  primary: { chip: "bg-primary/15 text-primary", ring: "ring-primary", dot: "!bg-primary" },
  cyan: { chip: "bg-cyan/15 text-cyan", ring: "ring-cyan", dot: "!bg-cyan" },
  violet: { chip: "bg-violet/15 text-violet", ring: "ring-violet", dot: "!bg-violet" },
  success: { chip: "bg-success/15 text-success", ring: "ring-success", dot: "!bg-success" },
  warning: { chip: "bg-warning/15 text-warning", ring: "ring-warning", dot: "!bg-warning" },
};

const handleClass =
  "!h-2.5 !w-2.5 !border-2 !border-surface !bg-fg-subtle transition-colors";

function QuantumNode({ data, selected }: NodeProps) {
  const d = data as QuantumNodeData;
  const Icon = kindIcon[d.kind] ?? Cpu;
  const c = colorMap[d.color] ?? colorMap.primary;
  const firstParam = Object.entries(d.params ?? {})[0];

  return (
    <div
      className={cn(
        "min-w-[156px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card transition-all duration-200",
        selected
          ? cn("ring-2 ring-offset-2 ring-offset-bg shadow-pop", c.ring)
          : "hover:border-line-strong",
      )}
    >
      <Handle type="target" position={Position.Left} className={cn(handleClass, c.dot)} />
      <Handle type="target" position={Position.Top} className={cn(handleClass, c.dot)} />

      <div className="flex items-center gap-2.5">
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", c.chip)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-fg">
            {d.label}
          </p>
          <p className="text-2xs capitalize text-fg-subtle">{d.kind}</p>
        </div>
      </div>

      {firstParam && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1 font-mono text-2xs">
          <span className="text-fg-subtle">{firstParam[0]}</span>
          <span className="text-fg">{String(firstParam[1])}</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className={cn(handleClass, c.dot)} />
      <Handle type="source" position={Position.Bottom} className={cn(handleClass, c.dot)} />
    </div>
  );
}

export default memo(QuantumNode);
