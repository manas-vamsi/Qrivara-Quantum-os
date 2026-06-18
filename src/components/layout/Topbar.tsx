import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Bell, Moon, Search, Sun, HelpCircle, Activity, Cpu, AlertTriangle, Command, MessageSquare,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { NAV_ALL, NAV_MAIN } from "@/config/nav";
import { IconButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { MobileNav } from "./MobileNav";

const NOTIFICATIONS = [
  { icon: Activity, tone: "success", title: "Frequency sweep finished", desc: "Falcon-17 · Q7 eigenmode converged", time: "2m ago" },
  { icon: Cpu, tone: "primary", title: "Optimization converged", desc: "Minimize ZZ crosstalk · score 0.0127", time: "1h ago" },
  { icon: AlertTriangle, tone: "warning", title: "DRC warning", desc: "Sparrow Test Chip · qubit spacing < 800µm", time: "3h ago" },
];

const TONE_BG: Record<string, string> = {
  success: "bg-success/15 text-success",
  primary: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
};

export function Topbar() {
  const { theme, toggleTheme, setCommandOpen, profile } = useAppStore();
  const location = useLocation();
  const [menu, setMenu] = useState<null | "help" | "notif">(null);
  const [notifRead, setNotifRead] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  const current =
    NAV_ALL.find((n) =>
      n.path === "/app"
        ? location.pathname === "/app"
        : location.pathname.startsWith(n.path),
    ) ?? NAV_MAIN[0];

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/70 px-4 backdrop-blur-xl sm:px-6">
      <MobileNav />

      {/* Current module */}
      <div className="hidden min-w-0 items-center gap-2.5 md:flex">
        <current.icon className="h-[1.15rem] w-[1.15rem] shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="truncate font-display text-sm font-semibold tracking-tight text-fg">
            {current.label}
          </h2>
        </div>
      </div>

      {/* Command / search */}
      <button
        onClick={() => setCommandOpen(true)}
        className="group ml-auto flex h-9.5 h-[2.375rem] w-full max-w-xs items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong hover:bg-surface-3 md:ml-0 md:mr-auto"
      >
        <Search className="h-4 w-4" />
        <span className="hidden flex-1 text-left sm:block">Search or run a command…</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Right actions */}
      <div ref={ref} className="relative flex items-center gap-1.5">
        <Tooltip content="Help & shortcuts" side="bottom">
          <IconButton aria-label="Help" onClick={() => setMenu(menu === "help" ? null : "help")}>
            <HelpCircle className="h-[1.15rem] w-[1.15rem]" />
          </IconButton>
        </Tooltip>

        <Tooltip content={theme === "dark" ? "Light mode" : "Dark mode"} side="bottom">
          <IconButton onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? (
              <Sun className="h-[1.15rem] w-[1.15rem]" />
            ) : (
              <Moon className="h-[1.15rem] w-[1.15rem]" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip content="Notifications" side="bottom">
          <IconButton
            aria-label="Notifications"
            className="relative"
            onClick={() => { setMenu(menu === "notif" ? null : "notif"); setNotifRead(true); }}
          >
            <Bell className="h-[1.15rem] w-[1.15rem]" />
            {!notifRead && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-surface bg-error" />
            )}
          </IconButton>
        </Tooltip>

        <button className="ml-1 rounded-full transition-transform hover:scale-105 active:scale-95">
          <Avatar name={profile.name || "User"} size={34} />
        </button>

        {/* Help dropdown */}
        {menu === "help" && (
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-80 rounded-2xl border border-line bg-surface p-3 shadow-pop">
            <p className="px-1 pb-2 text-sm font-semibold text-fg">Help & shortcuts</p>
            <button
              onClick={() => { setMenu(null); setCommandOpen(true); }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary"><Command className="h-4 w-4" /></span>
              <span className="flex-1">Command palette</span>
              <span className="flex gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-fg-muted">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet/15 text-violet"><MessageSquare className="h-4 w-4" /></span>
              <span className="flex-1">Ask <span className="font-medium text-fg">QRIVARA AI</span> — chat bubble, bottom-right</span>
            </div>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-fg-subtle">
              <div className="flex items-center justify-between px-2"><span>Toggle theme</span><span className="text-fg-muted">moon / sun icon</span></div>
              <div className="flex items-center justify-between px-2"><span>New design</span><span className="text-fg-muted">sidebar button</span></div>
              <div className="px-2 pt-1">QRIVARA — Quantum OS · v0.1</div>
            </div>
          </div>
        )}

        {/* Notifications dropdown */}
        {menu === "notif" && (
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-80 rounded-2xl border border-line bg-surface p-2 shadow-pop">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold text-fg">Notifications</p>
              <span className="text-2xs text-fg-subtle">{NOTIFICATIONS.length} recent</span>
            </div>
            <div className="space-y-0.5">
              {NOTIFICATIONS.map((n, i) => {
                const Icon = n.icon;
                return (
                  <div key={i} className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                    <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONE_BG[n.tone])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{n.title}</p>
                      <p className="truncate text-xs text-fg-subtle">{n.desc}</p>
                      <p className="mt-0.5 text-2xs text-fg-subtle">{n.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
