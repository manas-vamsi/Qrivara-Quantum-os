import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { CHART } from "@/lib/chartTheme";

const toneColor: Record<string, string> = {
  primary: CHART.primary,
  cyan: CHART.cyan,
  violet: CHART.violet,
  success: CHART.success,
  warning: CHART.warning,
};

/** Tiny inline area chart for stat cards. `data` is an array of numbers. */
export function Sparkline({
  data,
  tone = "primary",
}: {
  data: number[];
  tone?: keyof typeof toneColor;
}) {
  const color = toneColor[tone] ?? CHART.primary;
  const points = data.map((v, i) => ({ i, v }));
  const id = `spark-${tone}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
