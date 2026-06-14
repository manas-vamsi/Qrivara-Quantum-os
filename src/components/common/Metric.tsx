import { cn } from "@/lib/utils";
import { toneText, type Tone } from "@/lib/tones";

const sizeMap = {
  xs: "text-xs leading-tight",
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

/**
 * A single labelled metric value (label + value + unit), tinted by tone.
 * SSOT replacing the per-page "MetricTile" / "Out" / "Tile" duplicates.
 */
export function Metric({
  label,
  value,
  unit,
  tone = "primary",
  size = "md",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  tone?: Tone;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface-2 p-3.5", className)}>
      <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={cn(
            "font-display font-semibold tabular-nums",
            sizeMap[size],
            toneText[tone],
          )}
        >
          {value}
        </span>
        {unit && <span className="text-2xs text-fg-subtle">{unit}</span>}
      </div>
    </div>
  );
}
