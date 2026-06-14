import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MousePointer2,
  Code2,
  Activity,
  CheckCircle2,
  Sparkles,
  Cpu,
  Radio,
  ArrowUpRight,
} from "lucide-react";
import { CHART } from "@/lib/chartTheme";
import { S21_CURVE, OPT_HISTORY } from "@/data/mockData";
import { toneText, toneChip, toneBg } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** Build an SVG path (and optional area fill path) from numeric values. */
function buildPath(values: number[], w: number, h: number, pad = 6) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return { line, area };
}

function Spark({
  values,
  color,
  fill,
  w = 480,
  h = 150,
}: {
  values: number[];
  color: string;
  fill?: boolean;
  w?: number;
  h?: number;
}) {
  const { line, area } = buildPath(values, w, h);
  const gid = `spark-${color.replace(/[^a-z]/gi, "")}-${fill ? "f" : "l"}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

type Color = "primary" | "cyan" | "violet" | "success";

const STAGES: {
  key: string;
  label: string;
  icon: typeof Code2;
  color: Color;
  render: () => React.ReactNode;
}[] = [
  { key: "design", label: "Drag Transmon", icon: MousePointer2, color: "primary", render: DesignStage },
  { key: "generate", label: "Generate Python", icon: Code2, color: "cyan", render: GenerateStage },
  { key: "simulate", label: "Run Simulation", icon: Activity, color: "violet", render: SimulateStage },
  { key: "results", label: "See Results", icon: CheckCircle2, color: "success", render: ResultsStage },
  { key: "optimize", label: "Optimize", icon: Sparkles, color: "violet", render: OptimizeStage },
];

export function FlowShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 3000);
    return () => clearInterval(t);
  }, [paused, active]);

  const stage = STAGES[active];

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Window frame */}
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop ring-hairline">
        {/* Chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-error/70" />
            <span className="h-3 w-3 rounded-full bg-warning/70" />
            <span className="h-3 w-3 rounded-full bg-success/70" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 text-2xs text-fg-subtle">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            qrivara.app / falcon-17
          </div>
        </div>

        {/* Stage stepper */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-3 no-scrollbar sm:gap-2 sm:px-4">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === active;
            const isDone = i < active;
            return (
              <div key={s.key} className="flex shrink-0 items-center">
                <button
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all duration-300",
                    isActive
                      ? toneChip[s.color]
                      : "text-fg-subtle hover:text-fg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-md transition-colors",
                      isActive || isDone
                        ? cn(toneBg[s.color], "text-white")
                        : "bg-surface-3 text-fg-subtle",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="hidden whitespace-nowrap sm:block">{s.label}</span>
                </button>
                {i < STAGES.length - 1 && (
                  <div className="mx-0.5 h-px w-3 bg-line sm:w-5">
                    <div
                      className={cn(
                        "h-px origin-left bg-primary transition-transform duration-500",
                        i < active ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Display */}
        <div className="relative h-[280px] overflow-hidden bg-bg-deep/40 sm:h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 p-5 sm:p-6"
            >
              {stage.render()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Caption */}
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-fg-subtle">
        <span className={cn("h-2 w-2 rounded-full", toneBg[stage.color])} />
        <span>
          <span className={cn("font-medium", toneText[stage.color])}>
            {stage.label}
          </span>{" "}
          — concept to experiment, in one flow
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- Stages ----------------------------------- */

function NodeCard({
  icon: Icon,
  title,
  sub,
  color,
  className,
}: {
  icon: typeof Cpu;
  title: string;
  sub: string;
  color: Color;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card",
        className,
      )}
    >
      <div className={cn("grid h-8 w-8 place-items-center rounded-lg", toneChip[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="text-2xs text-fg-subtle">{sub}</p>
      </div>
    </div>
  );
}

function DesignStage() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-dots">
      {/* connecting edge — normalized space so it tracks the node positions */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <motion.path
          d="M 24 26 C 48 26, 52 74, 76 74"
          fill="none"
          stroke={CHART.cyan}
          strokeWidth={2}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        />
      </svg>

      <motion.div
        initial={{ x: -50, y: -20, opacity: 0, scale: 0.9 }}
        animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20, delay: 0.1 }}
        className="absolute left-[4%] top-[14%]"
      >
        <NodeCard icon={Cpu} title="Q1 · Xmon" sub="transmon · 5.21 GHz" color="primary" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-[14%] right-[4%]"
      >
        <NodeCard icon={Radio} title="Readout R1" sub="resonator · 7.10 GHz" color="cyan" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <MousePointer2 className="h-5 w-5 text-fg" />
      </motion.div>
    </div>
  );
}

function GenerateStage() {
  const lines = [
    { t: "from qiskit_metal import designs, Dict", c: "text-fg-muted" },
    { t: "design = designs.DesignPlanar()", c: "text-fg" },
    { t: "q1 = TransmonPocket(design, 'Q1',", c: "text-fg" },
    { t: "    options=Dict(pad_gap='30um',", c: "text-cyan" },
    { t: "        f01='5.21GHz'))", c: "text-cyan" },
    { t: "r1 = ReadoutResonator(design, 'R1')", c: "text-fg" },
    { t: "# auto-synced from canvas ✓", c: "text-success" },
  ];
  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-line bg-[#0E1422] p-4 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.18 }}
          className={cn("whitespace-pre", l.c)}
        >
          <span className="mr-3 select-none text-fg-subtle/50">{i + 1}</span>
          {l.t}
        </motion.div>
      ))}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ repeat: Infinity, duration: 1 }}
        className="ml-8 inline-block h-3.5 w-1.5 bg-primary align-middle"
      />
    </div>
  );
}

function SimulateStage() {
  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg">S21 — eigenmode solver</span>
        <span className="flex items-center gap-1.5 text-2xs text-violet">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet" />
          solving · pass 8/8
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Spark values={S21_CURVE.map((d) => d.s21)} color={CHART.violet} />
      </div>
    </div>
  );
}

function ResultsStage() {
  const metrics = [
    { label: "Qubit freq", value: "5.214", unit: "GHz", color: "primary" as Color },
    { label: "Anharmonicity", value: "-298", unit: "MHz", color: "cyan" as Color },
    { label: "Gate fidelity", value: "99.62", unit: "%", color: "success" as Color },
    { label: "Coupling g", value: "92", unit: "MHz", color: "violet" as Color },
  ];
  return (
    <div className="grid h-full w-full grid-cols-2 gap-3">
      {metrics.map((m, i) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.12, type: "spring", stiffness: 200, damping: 18 }}
          className="flex flex-col justify-center rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
            {m.label}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={cn("font-display text-2xl font-semibold tabular-nums", toneText[m.color])}>
              {m.value}
            </span>
            <span className="text-xs text-fg-subtle">{m.unit}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function OptimizeStage() {
  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg">Convergence</span>
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9 }}
          className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/12 px-2 py-0.5 text-2xs font-semibold text-success"
        >
          <ArrowUpRight className="h-3 w-3" /> +18% optimized
        </motion.span>
      </div>
      <div className="min-h-0 flex-1">
        <Spark values={OPT_HISTORY.map((d) => d.best)} color={CHART.primary} fill />
      </div>
    </div>
  );
}
