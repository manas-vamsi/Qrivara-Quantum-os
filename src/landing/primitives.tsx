import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Scroll-triggered fade-up reveal. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 20,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "span" | "section";
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </Comp>
  );
}

/** Eyebrow / section tag pill. */
export function SectionTag({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur",
        className,
      )}
    >
      {icon && <span className="text-primary">{icon}</span>}
      {children}
    </span>
  );
}

/** Standard section wrapper with consistent vertical rhythm + anchor id. */
export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  tag,
  title,
  subtitle,
  center,
  className,
}: {
  tag?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && "mx-auto text-center", "max-w-3xl", className)}>
      {tag && <Reveal className={center ? "flex justify-center" : ""}>{tag}</Reveal>}
      <Reveal delay={0.05}>
        <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-4xl md:text-[2.75rem]">
          {title}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.1}>
          <p className="mt-4 text-base leading-relaxed text-fg-muted sm:text-lg">
            {subtitle}
          </p>
        </Reveal>
      )}
    </div>
  );
}
