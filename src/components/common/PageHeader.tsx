import { cn } from "@/lib/utils";

/** Standard page header with title, subtitle and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        {icon && (
          <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-sm text-fg-subtle">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-fg-subtle">{subtitle}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
