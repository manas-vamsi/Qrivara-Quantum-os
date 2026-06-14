/** Shared Recharts theming so every chart looks consistent. */

// CSS-variable strings work as SVG stroke/fill and adapt to light/dark.
export const CHART = {
  primary: "rgb(var(--primary))",
  cyan: "rgb(var(--cyan))",
  violet: "rgb(var(--violet))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  error: "rgb(var(--error))",
  grid: "rgb(var(--border) / 0.7)",
  axis: "rgb(var(--fg-subtle))",
};

export const CHART_SERIES = [
  CHART.primary,
  CHART.cyan,
  CHART.violet,
  CHART.success,
  CHART.warning,
  CHART.error,
];

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Custom tooltip matching the QRIVARA surface styling. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  labelFormatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  unit?: string;
  labelFormatter?: (v: any) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-surface-3/95 px-3 py-2 shadow-pop backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color ?? entry.stroke }}
            />
            <span className="text-fg-muted">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-fg">
              {typeof entry.value === "number"
                ? entry.value.toLocaleString("en-US", {
                    maximumFractionDigits: 3,
                  })
                : entry.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
