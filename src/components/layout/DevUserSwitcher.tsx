import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, UserCog } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

/**
 * Dev-only "Act as" switcher. Impersonates any seeded user so per-project
 * sharing / visibility / notifications can be exercised across identities.
 * In production this is replaced by the real authenticated-user menu.
 */
export function DevUserSwitcher() {
  const { me, users, actAs } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const name = me?.name ?? "User";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 flex items-center gap-1.5 rounded-full pl-0.5 pr-1.5 transition-colors hover:bg-surface-2"
        aria-label="Switch user"
      >
        <Avatar name={name} src={me?.avatar_url} size={34} />
        <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-fg">Acting as</p>
            <span className="inline-flex items-center gap-1 rounded-md bg-violet/12 px-1.5 py-0.5 text-2xs font-medium text-violet">
              <UserCog className="h-3 w-3" /> dev
            </span>
          </div>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {users.map((u) => {
              const active = u.id === me?.id;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    actAs(u.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2",
                    active && "bg-surface-2",
                  )}
                >
                  <Avatar name={u.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{u.name}</p>
                    <p className="truncate text-2xs text-fg-subtle">
                      {u.role} · {u.org}
                    </p>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
          <p className="px-2 pb-1 pt-2 text-2xs text-fg-subtle">
            Switch identity to test sharing &amp; permissions.
          </p>
        </div>
      )}
    </div>
  );
}
