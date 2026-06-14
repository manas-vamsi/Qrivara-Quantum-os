import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { GlowCard } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { toneChip } from "@/lib/tones";

type Tone = "primary" | "cyan" | "violet" | "success" | "warning";

export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = "primary",
  delta,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: { value: string; positive?: boolean };
  spark?: React.ReactNode;
}) {
  return (
    <GlowCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-semibold tracking-tight text-fg tabular-nums">
              {value}
            </span>
            {unit && (
              <span className="text-sm font-medium text-fg-subtle">{unit}</span>
            )}
          </div>
        </div>
        {icon && (
          <div
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl",
              toneChip[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              delta.positive ? "text-success" : "text-error",
            )}
          >
            {delta.positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {delta.value}
          </span>
        ) : (
          <span />
        )}
        {spark && <div className="h-8 w-24 opacity-90">{spark}</div>}
      </div>
    </GlowCard>
  );
}
