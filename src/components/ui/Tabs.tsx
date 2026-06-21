import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

/** Underline-style tabs with an animated active indicator. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: TabItem<T>[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        // overflow-x-auto + hidden scrollbar so a long tab set scrolls gracefully
        // instead of clipping off-screen; callers that group tabs won't trigger it.
        "flex items-center gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 pb-2.5 pt-1 text-sm font-medium transition-colors duration-200",
              active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-2xs font-semibold",
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-3 text-fg-subtle",
                )}
              >
                {item.count}
              </span>
            )}
            {active && (
              // bottom-0 (not -bottom-px) so the indicator stays inside the box —
              // overflow-x-auto forces overflow-y:auto, which would clip anything below.
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
