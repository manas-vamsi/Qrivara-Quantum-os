import { cn } from "@/lib/utils";

export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="qr-logo"
          x1="8"
          y1="8"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="rgb(var(--primary))" />
          <stop offset="0.55" stopColor="rgb(var(--cyan))" />
          <stop offset="1" stopColor="rgb(var(--violet))" />
        </linearGradient>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke="url(#qr-logo)"
        strokeWidth="3.4"
        fill="none"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="17"
        ry="7"
        stroke="url(#qr-logo)"
        strokeWidth="2.4"
        fill="none"
        transform="rotate(45 32 32)"
      />
      <circle cx="32" cy="32" r="4.6" fill="url(#qr-logo)" />
      <line
        x1="41"
        y1="41"
        x2="51"
        y2="51"
        stroke="url(#qr-logo)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  collapsed,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={30} />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[1.05rem] font-bold tracking-tight text-fg">
            QRIVARA
          </div>
          <div className="mt-0.5 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-subtle">
            Quantum OS
          </div>
        </div>
      )}
    </div>
  );
}
