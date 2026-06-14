import { useState } from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

const sides: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

/** Lightweight CSS tooltip (no portal) — fine for in-flow controls. */
export function Tooltip({
  content,
  side = "top",
  children,
  className,
  wrapperClassName,
}: {
  content: React.ReactNode;
  side?: Side;
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", wrapperClassName)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {content && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1.5 text-2xs font-medium text-fg shadow-pop transition-all duration-150",
            sides[side],
            open
              ? "opacity-100 scale-100"
              : "opacity-0 scale-95",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
