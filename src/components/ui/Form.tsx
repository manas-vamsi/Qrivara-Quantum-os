import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Input --------------------------------- */
export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    icon?: React.ReactNode;
    suffix?: React.ReactNode;
  }
>(({ className, icon, suffix, ...props }, ref) => (
  <div className="relative flex items-center">
    {icon && (
      <span className="pointer-events-none absolute left-3 text-fg-subtle">
        {icon}
      </span>
    )}
    <input
      ref={ref}
      className={cn(
        "h-9.5 h-[2.375rem] w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle/70",
        "transition-colors duration-200",
        "hover:border-line-strong focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10",
        icon && "pl-9",
        suffix && "pr-9",
        className,
      )}
      {...props}
    />
    {suffix && (
      <span className="absolute right-3 text-xs text-fg-subtle">{suffix}</span>
    )}
  </div>
));
Input.displayName = "Input";

/* -------------------------------- Textarea -------------------------------- */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle/70",
      "transition-colors duration-200 resize-none",
      "hover:border-line-strong focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/* --------------------------------- Select --------------------------------- */
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-9.5 h-[2.375rem] w-full appearance-none rounded-xl border border-line bg-surface-2 pl-3 pr-9 text-sm text-fg",
        "transition-colors duration-200 cursor-pointer",
        "hover:border-line-strong focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
  </div>
));
Select.displayName = "Select";

/* ---------------------------------- Label --------------------------------- */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-xs font-medium uppercase tracking-wider text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <p className="text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/* --------------------------------- Switch --------------------------------- */
export function Switch({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-spring",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        checked ? "bg-primary" : "bg-surface-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-spring",
          checked ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]",
        )}
      />
    </button>
  );
}

/* --------------------------------- Slider --------------------------------- */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("qr-slider w-full", className)}
      style={
        {
          background: `linear-gradient(to right, rgb(var(--primary)) ${pct}%, rgb(var(--surface-3)) ${pct}%)`,
        } as React.CSSProperties
      }
    />
  );
}

/* --------------------------- Segmented control ---------------------------- */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={id + opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-surface-3 text-fg shadow-sm"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
