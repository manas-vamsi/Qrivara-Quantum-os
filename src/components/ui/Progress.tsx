import { cn } from "@/lib/utils";
import { clamp } from "@/lib/utils";

type Tone = "primary" | "cyan" | "violet" | "success" | "warning" | "error";

const fills: Record<Tone, string> = {
  primary: "bg-primary",
  cyan: "bg-cyan",
  violet: "bg-violet",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

export function Progress({
  value,
  tone = "primary",
  className,
  size = "md",
  glow,
}: {
  value: number; // 0..100
  tone?: Tone;
  className?: string;
  size?: "sm" | "md";
  glow?: boolean;
}) {
  const v = clamp(value, 0, 100);
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-3",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-spring",
          fills[tone],
          glow && "shadow-[0_0_12px_-2px_currentColor]",
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/** Circular gauge — used for scores / utilization. */
export function Gauge({
  value,
  size = 72,
  stroke = 7,
  tone = "primary",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: React.ReactNode;
}) {
  const v = clamp(value, 0, 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const colorVar: Record<Tone, string> = {
    primary: "rgb(var(--primary))",
    cyan: "rgb(var(--cyan))",
    violet: "rgb(var(--violet))",
    success: "rgb(var(--success))",
    warning: "rgb(var(--warning))",
    error: "rgb(var(--error))",
  };
  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--surface-3))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorVar[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-spring"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {label ?? (
          <span className="font-display text-sm font-semibold text-fg">
            {Math.round(v)}
          </span>
        )}
      </div>
    </div>
  );
}
