import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "subtle"
  | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-fg hover:brightness-110 active:brightness-95 shadow-[0_4px_16px_-6px_rgb(var(--primary)/0.7)]",
  secondary:
    "bg-surface-3 text-fg hover:bg-surface-3/70 border border-line",
  outline:
    "border border-line-strong text-fg hover:bg-surface-2 hover:border-line-strong",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  subtle: "bg-primary/10 text-primary hover:bg-primary/15",
  danger: "bg-error/90 text-white hover:bg-error",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9.5 h-[2.375rem] px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      icon,
      iconRight,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
          "transition-all duration-200 ease-spring",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          icon && <span className="-ml-0.5 shrink-0">{icon}</span>
        )}
        {children}
        {iconRight && !loading && (
          <span className="-mr-0.5 shrink-0">{iconRight}</span>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "md", active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-xl transition-all duration-200 ease-spring",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "disabled:pointer-events-none disabled:opacity-40",
          size === "sm" ? "h-8 w-8" : "h-9.5 h-[2.375rem] w-[2.375rem]",
          active
            ? "bg-primary/15 text-primary"
            : variant === "ghost"
              ? "text-fg-muted hover:bg-surface-2 hover:text-fg"
              : "border border-line text-fg-muted hover:bg-surface-2 hover:text-fg",
          className,
        )}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";
