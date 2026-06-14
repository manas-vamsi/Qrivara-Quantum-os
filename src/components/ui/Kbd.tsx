import { cn } from "@/lib/utils";

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-2xs font-medium text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
