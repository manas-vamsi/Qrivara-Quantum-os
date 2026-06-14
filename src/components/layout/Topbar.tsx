import { useLocation } from "react-router-dom";
import { Bell, Moon, Search, Sun, HelpCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { NAV_ALL, NAV_MAIN } from "@/config/nav";
import { IconButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Kbd } from "@/components/ui/Kbd";
import { StatusDot } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { MobileNav } from "./MobileNav";

export function Topbar() {
  const { theme, toggleTheme, setCommandOpen, profile } = useAppStore();
  const location = useLocation();
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
        <span className="hidden flex-1 text-left sm:block">
          Search or run a command…
        </span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-2.5 pr-3 lg:flex">
          <StatusDot tone="success" pulse />
          <span className="text-xs font-medium text-fg-muted">
            Solver online
          </span>
        </div>

        <Tooltip content="Help & docs">
          <IconButton aria-label="Help">
            <HelpCircle className="h-[1.15rem] w-[1.15rem]" />
          </IconButton>
        </Tooltip>

        <Tooltip content={theme === "dark" ? "Light mode" : "Dark mode"}>
          <IconButton onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? (
              <Sun className="h-[1.15rem] w-[1.15rem]" />
            ) : (
              <Moon className="h-[1.15rem] w-[1.15rem]" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip content="Notifications">
          <IconButton aria-label="Notifications" className="relative">
            <Bell className="h-[1.15rem] w-[1.15rem]" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-surface bg-error" />
          </IconButton>
        </Tooltip>

        <button className="ml-1 rounded-full transition-transform hover:scale-105 active:scale-95">
          <Avatar name={profile.name || "User"} size={34} />
        </button>
      </div>
    </header>
  );
}
