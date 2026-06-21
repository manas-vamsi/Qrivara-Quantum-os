import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Moon, Search, Sun, HelpCircle, MessageSquare, Command,
  Share2, UserPlus, UserCheck, Activity as ActivityIcon, MessageCircle,
  CheckCheck, Loader2,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { NAV_ALL, NAV_MAIN } from "@/config/nav";
import { IconButton } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, timeAgo } from "@/lib/utils";
import { MobileNav } from "./MobileNav";
import { DevUserSwitcher } from "./DevUserSwitcher";

interface Notif {
  id: string;
  type: string;
  read: boolean;
  payload: Record<string, any>;
  created_at: string;
  actor: { name: string } | null;
}

// Per-type presentation: icon + accent tone.
const NOTIF_STYLE: Record<string, { icon: any; tone: string }> = {
  project_shared: { icon: Share2, tone: "primary" },
  role_changed: { icon: UserCheck, tone: "cyan" },
  connection_request: { icon: UserPlus, tone: "violet" },
  connection_accepted: { icon: UserCheck, tone: "success" },
  comment: { icon: MessageCircle, tone: "primary" },
  mention: { icon: MessageCircle, tone: "violet" },
  sim_done: { icon: ActivityIcon, tone: "success" },
  message: { icon: MessageCircle, tone: "cyan" },
  channel_invite: { icon: MessageSquare, tone: "primary" },
};

const TONE_BG: Record<string, string> = {
  success: "bg-success/15 text-success",
  primary: "bg-primary/15 text-primary",
  cyan: "bg-cyan/15 text-cyan",
  violet: "bg-violet/15 text-violet",
  warning: "bg-warning/15 text-warning",
};

function notifText(n: Notif): string {
  const actor = n.actor?.name ?? n.payload?.actor_name ?? "Someone";
  const proj = n.payload?.project_name ?? "a project";
  switch (n.type) {
    case "project_shared":
      return `${actor} shared “${proj}” with you`;
    case "role_changed":
      return `${actor} set your role on “${proj}” to ${n.payload?.role}`;
    case "connection_request":
      return `${actor} wants to connect`;
    case "connection_accepted":
      return `${actor} accepted your connection`;
    case "sim_done":
      return `Simulation finished${proj ? ` · ${proj}` : ""}`;
    case "message":
      return `${actor}: ${n.payload?.preview ?? "sent you a message"}`;
    case "channel_invite":
      return `${actor} added you to #${n.payload?.channel_name ?? "a channel"}`;
    default:
      return `${actor} sent you an update`;
  }
}

export function Topbar() {
  const { theme, toggleTheme, setCommandOpen } = useAppStore();
  const meId = useAuthStore((s) => s.me?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<null | "help" | "notif">(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await api.getUnreadCount();
      setUnread(count ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotifs = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const data = await api.getNotifications();
      setNotifs(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  // Refresh on mount, when the acting user changes, and on a light poll.
  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 25000);
    return () => clearInterval(t);
  }, [refreshUnread, meId]);

  // Drop the previous identity's notifications the moment the user switches.
  useEffect(() => {
    setNotifs([]);
  }, [meId]);

  useEffect(() => {
    if (menu === "notif") loadNotifs();
  }, [menu, loadNotifs, meId]);

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

  async function openNotif(n: Notif) {
    if (!n.read) {
      await api.markNotificationRead(n.id);
      setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      refreshUnread();
    }
    setMenu(null);
    if (n.type === "message" || n.type === "channel_invite") navigate("/app/collaboration?tab=messages");
    else if (n.payload?.project_id) navigate("/app/projects");
    else if (n.type.startsWith("connection")) navigate("/app/collaboration");
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    setNotifs((ns) => ns.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

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
            onClick={() => setMenu(menu === "notif" ? null : "notif")}
          >
            <Bell className="h-[1.15rem] w-[1.15rem]" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-error px-1 text-[0.6rem] font-bold leading-none text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </IconButton>
        </Tooltip>

        <DevUserSwitcher />

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
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[22rem] rounded-2xl border border-line bg-surface p-2 shadow-pop">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold text-fg">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
              {loadingNotifs ? (
                <p className="flex items-center gap-2 px-2 py-6 text-sm text-fg-subtle">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : notifs.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <Bell className="mx-auto h-6 w-6 text-fg-subtle/50" />
                  <p className="mt-2 text-sm text-fg-muted">You’re all caught up</p>
                  <p className="text-2xs text-fg-subtle">
                    Shares, requests and updates land here.
                  </p>
                </div>
              ) : (
                notifs.map((n) => {
                  const style = NOTIF_STYLE[n.type] ?? { icon: Bell, tone: "primary" };
                  const Icon = style.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => openNotif(n)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2",
                        !n.read && "bg-primary/[0.04]",
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONE_BG[style.tone])}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-fg">{notifText(n)}</p>
                        <p className="mt-0.5 text-2xs text-fg-subtle">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
