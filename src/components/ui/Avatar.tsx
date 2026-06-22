import { cn } from "@/lib/utils";

const gradients = [
  "from-primary to-cyan",
  "from-violet to-primary",
  "from-cyan to-success",
  "from-warning to-error",
  "from-violet to-cyan",
  "from-success to-primary",
];

function hashIndex(str: string, mod: number) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 9973;
  return h % mod;
}

export function Avatar({
  name,
  size = 32,
  className,
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  src?: string | null;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={name}
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const grad = gradients[hashIndex(name, gradients.length)];
  return (
    <div
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-surface",
        grad,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function AvatarGroup({
  names,
  size = 28,
  max = 4,
}: {
  names: string[];
  size?: number;
  max?: number;
}) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <div key={n + i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="grid place-items-center rounded-full border border-line bg-surface-2 font-medium text-fg-muted ring-2 ring-surface"
          style={{
            width: size,
            height: size,
            marginLeft: -size * 0.32,
            fontSize: size * 0.34,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
