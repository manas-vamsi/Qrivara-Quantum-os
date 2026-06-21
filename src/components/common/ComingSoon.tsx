import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Toast singleton ─────────────────────────────
 * Lightweight "coming soon" toast. Pages call `comingSoon("Feature name")` and
 * a transient notification appears bottom-right. The host self-mounts on first
 * import, so no provider wiring is needed in App.tsx.
 * ------------------------------------------------------------------------- */

type Toast = { id: number; feature: string };
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();

function emit() {
  for (const l of listeners) l(toasts);
}

/** Show a transient "<feature> — coming soon" toast. */
export function comingSoon(feature = "This feature") {
  const id = nextId++;
  toasts = [...toasts, { id, feature }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3200);
}

function ToastHost() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet/15 text-violet">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{t.feature}</p>
              <p className="text-2xs text-fg-subtle">Coming soon — in active development.</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Self-mount the host once, on the client.
if (typeof document !== "undefined") {
  const id = "coming-soon-host";
  if (!document.getElementById(id)) {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
    createRoot(el).render(<ToastHost />);
  }
}

/* ──────────────────────────────── Badge ──────────────────────────────────── */

/** Small "Preview" pill marking a card/page as sample data (live version pending). */
export function PreviewBadge({ className }: { className?: string }) {
  return (
    <span
      title="Sample data — the live version of this feature is coming soon"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-violet/25 bg-violet/12 px-2 py-0.5 text-2xs font-medium tracking-wide text-violet",
        className,
      )}
    >
      <Clock className="h-3 w-3" /> Preview
    </span>
  );
}

/* ─────────────────────────────── Overlay ─────────────────────────────────── */

/**
 * Wraps sample/mock content: dims it, blocks interaction, and shows a centered
 * "Coming soon" chip. Clicking anywhere fires the `comingSoon` toast.
 */
export function ComingSoonOverlay({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <div className="pointer-events-none select-none opacity-50 blur-[1px] saturate-50">
        {children}
      </div>
      <button
        type="button"
        onClick={() => comingSoon(label)}
        aria-label={`${label} — coming soon`}
        className="absolute inset-0 grid place-items-center rounded-xl bg-surface/10 transition-colors hover:bg-surface/20"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet/25 bg-surface/90 px-3 py-1.5 text-xs font-semibold text-violet shadow-pop backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Coming soon
        </span>
      </button>
    </div>
  );
}
