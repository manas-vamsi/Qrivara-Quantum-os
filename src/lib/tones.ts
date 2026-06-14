/* ===========================================================================
   SSOT for semantic tone → Tailwind class maps.
   One place defines how each tone renders as text, a soft chip, or a solid
   fill, so components never re-declare these maps (DRY).
   =========================================================================== */

export type Tone =
  | "primary"
  | "cyan"
  | "violet"
  | "success"
  | "warning"
  | "error"
  | "neutral";

/** Text color only. */
export const toneText: Record<Tone, string> = {
  primary: "text-primary",
  cyan: "text-cyan",
  violet: "text-violet",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-fg-muted",
};

/** Soft tinted chip (background + text) — icon chips, pills. */
export const toneChip: Record<Tone, string> = {
  primary: "bg-primary/12 text-primary",
  cyan: "bg-cyan/12 text-cyan",
  violet: "bg-violet/12 text-violet",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  neutral: "bg-surface-3 text-fg-muted",
};

/** Solid fill — dots, progress/loss bars. */
export const toneBg: Record<Tone, string> = {
  primary: "bg-primary",
  cyan: "bg-cyan",
  violet: "bg-violet",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  neutral: "bg-fg-subtle",
};
