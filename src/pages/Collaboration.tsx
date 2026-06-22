import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Share2, FolderGit2, Inbox, UserPlus, Check, X, Loader2,
  MessageSquare, Shield, Search,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { ShareDialog } from "@/components/collab/ShareDialog";
import Messages from "@/pages/Messages";
import Teams from "@/pages/Teams";
import { PROJECT_STATUS_TONE } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type Tab = "mine" | "shared" | "network" | "messages" | "teams";
const TABS: Tab[] = ["mine", "shared", "network", "messages", "teams"];

const ROLE_TONE: Record<string, "primary" | "cyan" | "violet" | "neutral"> = {
  owner: "primary", editor: "cyan", commenter: "violet", viewer: "neutral",
};

/** A directory person row with a connection-aware action (search + suggestions). */
function PersonRow({ u, state, pending, onConnect, onOpen }: {
  u: any;
  state: "connected" | "pending" | "incoming" | "none";
  pending: boolean;
  onConnect: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={u.name} src={u.avatar_url} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{u.name}</p>
          <p className="truncate text-2xs text-fg-subtle">{u.headline || u.org}</p>
        </div>
      </button>
      {state === "connected" ? (
        <Badge tone="success" dot>connected</Badge>
      ) : state === "incoming" ? (
        <Badge tone="warning">wants to connect</Badge>
      ) : state === "pending" ? (
        <Badge tone="neutral">pending</Badge>
      ) : (
        <Button size="sm" variant="outline" icon={<UserPlus className="h-3.5 w-3.5" />} loading={pending} onClick={onConnect}>
          Connect
        </Button>
      )}
    </div>
  );
}

export default function Collaboration() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const users = useAuthStore((s) => s.users);
  const userTick = useAuthStore((s) => s.userTick);
  const projects = useDataStore((s) => s.projects);
  const fetchProjects = useDataStore((s) => s.fetchProjects);

  // Tab is deep-linkable via ?tab= so notifications / old /app/messages and
  // /app/teams routes land on the right sub-view.
  const [params, setParams] = useSearchParams();
  const paramTab = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(paramTab && TABS.includes(paramTab) ? paramTab : "mine");
  const changeTab = (t: Tab) => {
    setTab(t);
    setParams(t === "mine" ? {} : { tab: t }, { replace: true });
  };
  useEffect(() => {
    if (paramTab && TABS.includes(paramTab) && paramTab !== tab) setTab(paramTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTab]);

  const [shared, setShared] = useState<any[]>([]);
  const [conns, setConns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // User search (Network tab) — backed by GET /users?q=
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const owned = projects.filter((p) => p.created_by === me?.id);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.getSharedWithMe(), api.getConnections()]);
      setShared(Array.isArray(s) ? s : []);
      setConns(Array.isArray(c) ? c : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, userTick]);

  // Debounced user search across the directory (name / handle / org).
  useEffect(() => {
    const q = userQuery.trim();
    if (!q) { setUserResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.getUsers(q);
        setUserResults(Array.isArray(r) ? r.filter((u) => u.id !== me?.id) : []);
      } catch {
        setUserResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [userQuery, me?.id]);

  // Connection state for a given user id → drives the row's action.
  const connState = (uid?: string): "connected" | "pending" | "incoming" | "none" => {
    const c = conns.find((x) => x.user?.id === uid);
    if (c?.status === "accepted") return "connected";
    if (c?.status === "pending" && c?.direction === "outgoing") return "pending";
    if (c?.status === "pending" && c?.direction === "incoming") return "incoming";
    return "none";
  };

  const incoming = conns.filter((c) => c.direction === "incoming" && c.status === "pending");
  const accepted = conns.filter((c) => c.status === "accepted");
  // Hide people we're already connected to or who have requested us — but KEEP
  // outgoing-pending users so their "pending" badge renders in suggestions.
  const hiddenIds = new Set(
    conns
      .filter((c) => c.status === "accepted" || c.direction === "incoming")
      .map((c) => c.user?.id),
  );
  const suggestions = users.filter((u) => u.id !== me?.id && !hiddenIds.has(u.id)).slice(0, 6);

  async function accept(id: string) {
    setPendingId(id);
    try { await api.acceptConnection(id); await reload(); } finally { setPendingId(null); }
  }
  async function ignore(id: string) {
    setPendingId(id);
    try { await api.declineConnection(id); await reload(); } finally { setPendingId(null); }
  }
  async function connect(userId: string) {
    setPendingId(userId);
    try { await api.requestConnection(userId); await reload(); } finally { setPendingId(null); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collaboration"
        subtitle="Your network, shared work and project sharing."
        icon={<Users className="h-5 w-5" />}
        actions={
          accepted.length > 0 ? (
            <div className="hidden sm:block">
              <AvatarGroup names={accepted.map((c) => c.user?.name).filter(Boolean)} size={32} max={4} />
            </div>
          ) : null
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={changeTab}
        items={[
          { value: "mine", label: "My projects", icon: <FolderGit2 className="h-4 w-4" />, count: owned.length },
          { value: "shared", label: "Shared with me", icon: <Inbox className="h-4 w-4" />, count: shared.length },
          { value: "network", label: "Network", icon: <Users className="h-4 w-4" />, count: accepted.length },
          { value: "messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
          { value: "teams", label: "Teams", icon: <Shield className="h-4 w-4" /> },
        ]}
      />

      {/* ----------------------------- My projects ---------------------------- */}
      {tab === "mine" && (
        owned.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="h-6 w-6" />}
            title="No projects yet"
            description="Create a project, then share it with collaborators — they’ll only see what you grant."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map((p) => (
              <div
                key={p.id}
                className="group rounded-xl border border-line bg-surface-2 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={PROJECT_STATUS_TONE[p.status] ?? "neutral"} dot={p.status === "active" || p.status === "simulating"}>
                      {p.status}
                    </Badge>
                    <Badge tone="neutral">{p.qubits}Q</Badge>
                  </div>
                  <Button size="sm" variant="subtle" icon={<Share2 className="h-3.5 w-3.5" />}
                    onClick={() => setShareTarget({ id: p.id, name: p.name })}>
                    Share
                  </Button>
                </div>
                <h4 className="mt-2.5 text-sm font-semibold text-fg">{p.name}</h4>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{p.description}</p>
                <div className="mt-3"><Progress value={p.progress} size="sm" /></div>
                <div className="mt-3 flex items-center justify-between">
                  <AvatarGroup names={p.collaborators ?? []} size={24} max={3} />
                  <span className="text-2xs text-fg-subtle">{timeAgo(p.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* --------------------------- Shared with me --------------------------- */}
      {tab === "shared" && (
        loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-fg-subtle">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : shared.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nothing shared with you yet"
            description="When a colleague shares a project, it shows up here with your role."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((p) => (
              <div key={p.id} className="rounded-xl border border-line bg-surface-2 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={PROJECT_STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    <Badge tone="neutral">{p.qubits}Q</Badge>
                  </div>
                  <Badge tone={ROLE_TONE[p.your_role] ?? "neutral"}>{p.your_role}</Badge>
                </div>
                <h4 className="mt-2.5 text-sm font-semibold text-fg">{p.name}</h4>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{p.description}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <Avatar name={p.owner?.name ?? "?"} size={22} />
                  <span className="text-2xs text-fg-subtle">
                    by {p.owner?.name} · {timeAgo(p.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ------------------------------- Network ------------------------------ */}
      {tab === "network" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Requests */}
            <Card>
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Requests</h3>
                <Badge tone={incoming.length ? "warning" : "neutral"}>{incoming.length}</Badge>
              </div>
              <CardContent className="pt-3">
                {incoming.length === 0 ? (
                  <p className="py-4 text-sm text-fg-subtle">No pending requests.</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {incoming.map((c) => (
                      <motion.div key={c.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-3 rounded-xl border border-line p-3">
                        <Avatar name={c.user?.name ?? "?"} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{c.user?.name}</p>
                          <p className="truncate text-2xs text-fg-subtle">{c.user?.headline || c.user?.org}</p>
                        </div>
                        <Button size="sm" variant="subtle" icon={<Check className="h-3.5 w-3.5" />}
                          loading={pendingId === c.id} onClick={() => accept(c.id)}>Accept</Button>
                        <IconButton size="sm" aria-label="Ignore" onClick={() => ignore(c.id)}><X className="h-4 w-4" /></IconButton>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </CardContent>
            </Card>

            {/* Connections */}
            <Card>
              <div className="px-5 pt-5">
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Connections</h3>
              </div>
              <CardContent className="pt-3">
                {accepted.length === 0 ? (
                  <p className="py-4 text-sm text-fg-subtle">No connections yet — send a request from suggestions.</p>
                ) : (
                  <div className="space-y-1">
                    {accepted.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => c.user?.id && navigate(`/app/u/${c.user.id}`)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
                      >
                        <Avatar name={c.user?.name ?? "?"} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{c.user?.name}</p>
                          <p className="truncate text-2xs text-fg-subtle">{c.user?.role} · {c.user?.org}</p>
                        </div>
                        <Badge tone="success" dot>connected</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Find people + suggestions */}
          <div className="space-y-6">
            <Card>
              <div className="px-5 pt-5">
                <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Find people</h3>
                <p className="text-2xs text-fg-subtle">Search the directory by name, handle or organization.</p>
              </div>
              <CardContent className="pt-3">
                <Input
                  icon={<Search className="h-4 w-4" />}
                  placeholder="Search researchers…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
                {userQuery.trim() && (
                  <div className="mt-3 space-y-1">
                    {searching ? (
                      <p className="flex items-center justify-center gap-2 py-4 text-sm text-fg-subtle">
                        <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                      </p>
                    ) : userResults && userResults.length > 0 ? (
                      userResults.map((u) => (
                        <PersonRow key={u.id} u={u} state={connState(u.id)} pending={pendingId === u.id}
                          onOpen={() => navigate(`/app/u/${u.id}`)} onConnect={() => connect(u.id)} />
                      ))
                    ) : (
                      <p className="py-4 text-center text-sm text-fg-subtle">No users match “{userQuery.trim()}”.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {!userQuery.trim() && (
              <Card>
                <div className="px-5 pt-5">
                  <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Suggested</h3>
                </div>
                <CardContent className="space-y-1 pt-3">
                  {suggestions.length === 0 ? (
                    <p className="py-2 text-sm text-fg-subtle">No suggestions.</p>
                  ) : (
                    suggestions.map((u) => (
                      <PersonRow key={u.id} u={u} state={connState(u.id)} pending={pendingId === u.id}
                        onOpen={() => navigate(`/app/u/${u.id}`)} onConnect={() => connect(u.id)} />
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------ Messages ------------------------------ */}
      {tab === "messages" && <Messages />}

      {/* ------------------------------- Teams -------------------------------- */}
      {tab === "teams" && <Teams />}

      <ShareDialog
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        projectId={shareTarget?.id ?? null}
        projectName={shareTarget?.name ?? ""}
        onChanged={() => fetchProjects()}
      />
    </div>
  );
}
