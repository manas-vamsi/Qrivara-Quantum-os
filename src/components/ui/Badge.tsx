import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "primary"
  | "cyan"
  | "violet"
  | "success"
  | "warning"
  | "error";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-line",
  primary: "bg-primary/12 text-primary border-primary/20",
  cyan: "bg-cyan/12 text-cyan border-cyan/25",
  violet: "bg-violet/12 text-violet border-violet/25",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/12 text-warning border-warning/25",
  error: "bg-error/12 text-error border-error/25",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}

/** Tiny status dot with optional pulse (e.g. "running"). */
export function StatusDot({
  tone = "success",
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  const color: Record<Tone, string> = {
    neutral: "bg-fg-subtle",
    primary: "bg-primary",
    cyan: "bg-cyan",
    violet: "bg-violet",
    success: "bg-success",
    warning: "bg-warning",
    error: "bg-error",
  };
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-70 animate-pulse-ring",
            color[tone],
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", color[tone])}
      />
    </span>
  );
}
