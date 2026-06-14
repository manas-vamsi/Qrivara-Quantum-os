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
        "flex items-center gap-1 border-b border-line",
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
              "relative inline-flex items-center gap-2 px-3.5 pb-2.5 pt-1 text-sm font-medium transition-colors duration-200",
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
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
