import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Globe,
  Link2,
  Lock,
  Mail,
  Search,
  Building2,
  Loader2,
  X,
  Shield,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Form";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, "primary" | "cyan" | "violet" | "neutral"> = {
  owner: "primary",
  editor: "cyan",
  commenter: "violet",
  viewer: "neutral",
};

const VIS = [
  { value: "private", label: "Private — only invited people", icon: Lock },
  { value: "org", label: "Organization — anyone in your org", icon: Building2 },
  { value: "link", label: "Anyone with the link", icon: Link2 },
  { value: "public", label: "Public — anyone", icon: Globe },
] as const;

interface Grant {
  id: string;
  role: string;
  subject_id: string;
  subject_type: string;
  user: { id: string; name: string; email: string; role: string } | null;
  team: { id: string; name: string } | null;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
}

export function ShareDialog({
  open,
  onClose,
  projectId,
  projectName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectName: string;
  onChanged?: () => void;
}) {
  const me = useAuthStore((s) => s.me);
  const users = useAuthStore((s) => s.users);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mode, setMode] = useState<"people" | "teams">("people");
  const [visibility, setVisibility] = useState("private");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGrants(projectId);
      setGrants(data.grants ?? []);
      setVisibility(data.visibility ?? "private");
    } catch (e: any) {
      setError(e.message || "Failed to load sharing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Load teams once when the dialog opens so the owner can share with a group.
  useEffect(() => {
    if (!open) return;
    api.getTeams().then((t) => setTeams(Array.isArray(t) ? t : [])).catch(() => setTeams([]));
  }, [open]);

  // Keep user- and team-grant ids separate so a coincidental id match across
  // the two namespaces can't hide an unrelated person or team.
  const grantedUserIds = useMemo(
    () => new Set(grants.filter((g) => g.subject_type === "user").map((g) => g.subject_id)),
    [grants],
  );
  const grantedTeamIds = useMemo(
    () => new Set(grants.filter((g) => g.subject_type === "team").map((g) => g.subject_id)),
    [grants],
  );

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());

  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    return users
      .filter(
        (u) =>
          u.id !== me?.id &&
          !grantedUserIds.has(u.id) &&
          (u.name.toLowerCase().includes(ql) ||
            (u.email || "").toLowerCase().includes(ql) ||
            (u.handle || "").toLowerCase().includes(ql)),
      )
      .slice(0, 6);
  }, [q, users, me, grantedUserIds]);

  const teamMatches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return teams
      .filter((t) => !grantedTeamIds.has(t.id) && (!ql || t.name.toLowerCase().includes(ql)))
      .slice(0, 6);
  }, [q, teams, grantedTeamIds]);

  async function shareTeam(teamId: string) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await api.addTeamGrant(projectId, teamId, role);
      setQ("");
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || "Failed to share with team");
    } finally {
      setBusy(false);
    }
  }

  async function share(body: { user_id?: string; email?: string }) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await api.addGrant(projectId, { ...body, role });
      setQ("");
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || "Failed to share");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(grantId: string, newRole: string) {
    if (!projectId) return;
    setError(null);
    try {
      await api.updateGrant(projectId, grantId, newRole);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || "Failed to update role");
    }
  }

  async function revoke(grantId: string) {
    if (!projectId) return;
    setError(null);
    try {
      await api.removeGrant(projectId, grantId);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || "Failed to remove access");
    }
  }

  async function changeVisibility(v: string) {
    if (!projectId) return;
    const prev = visibility;
    setVisibility(v); // optimistic
    try {
      await api.setVisibility(projectId, v);
      onChanged?.();
    } catch (e: any) {
      setVisibility(prev); // revert locally without clobbering the error message
      setError(e.message || "Failed to update visibility");
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/app/projects?p=${projectId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const VisIcon = VIS.find((v) => v.value === visibility)?.icon ?? Lock;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share “${projectName}”`}
      description="Invite people to this project. They’ll see only what you share."
      size="lg"
    >
      <div className="space-y-5">
        {/* Mode toggle: share with people or whole teams */}
        <div className="flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
          <button
            onClick={() => { setMode("people"); setQ(""); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mode === "people" ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
            )}
          >
            <Mail className="h-3.5 w-3.5" /> People
          </button>
          <button
            onClick={() => { setMode("teams"); setQ(""); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mode === "teams" ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
            )}
          >
            <Shield className="h-3.5 w-3.5" /> Teams
          </button>
        </div>

        {/* Add people / teams */}
        <div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                icon={<Search className="h-4 w-4" />}
                placeholder={mode === "people" ? "Add people by name or email…" : "Share with a team…"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {mode === "teams" && teamMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                  {teamMatches.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => shareTeam(t.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/12 text-primary">
                        <Shield className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                        <p className="truncate text-2xs text-fg-subtle">{t.member_count ?? 0} members</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {mode === "teams" && q.trim() && teamMatches.length === 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-2xs text-fg-subtle shadow-pop">
                  No matching teams.
                </div>
              )}
              {mode === "people" && (matches.length > 0 || isEmail) && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                  {matches.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => share({ user_id: u.id })}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <Avatar name={u.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{u.name}</p>
                        <p className="truncate text-2xs text-fg-subtle">
                          {u.handle ? `@${u.handle}` : u.email}
                        </p>
                      </div>
                    </button>
                  ))}
                  {isEmail && !matches.some((m) => m.email === q.trim()) && (
                    <button
                      onClick={() => share({ email: q.trim() })}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/12 text-primary">
                        <Mail className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm text-fg">
                        Invite <span className="font-medium">{q.trim()}</span> by email
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-36"
            >
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          {busy && (
            <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
              <Loader2 className="h-3 w-3 animate-spin" /> Sharing…
            </p>
          )}
          {error && <p className="mt-1.5 text-2xs text-error">{error}</p>}
        </div>

        {/* People & teams with access */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Who has access
          </p>
          {loading ? (
            <p className="flex items-center gap-2 py-3 text-sm text-fg-subtle">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <div className="space-y-1">
              {grants.map((g) => {
                const isOwner = g.role === "owner";
                const isTeam = g.subject_type === "team";
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    {isTeam ? (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                        <Shield className="h-4 w-4" />
                      </span>
                    ) : (
                      <Avatar name={g.user?.name ?? "?"} size={32} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
                        {isTeam ? (g.team?.name ?? "Team") : (g.user?.name ?? "Unknown")}
                        {isTeam && (
                          <Badge tone="violet" className="px-1.5 py-0">
                            <Users className="mr-0.5 h-2.5 w-2.5" />team
                          </Badge>
                        )}
                        {!isTeam && g.subject_id === me?.id && (
                          <span className="text-fg-subtle"> (you)</span>
                        )}
                      </p>
                      <p className="truncate text-2xs text-fg-subtle">
                        {isTeam ? "Everyone on this team" : g.user?.email}
                      </p>
                    </div>
                    {isOwner ? (
                      <Badge tone={ROLE_TONE[g.role]}>Owner</Badge>
                    ) : (
                      <>
                        <Select
                          value={g.role}
                          onChange={(e) => changeRole(g.id, e.target.value)}
                          className="h-8 w-32 text-xs"
                        >
                          <option value="editor">Editor</option>
                          <option value="commenter">Commenter</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                        <IconButton
                          size="sm"
                          aria-label="Remove access"
                          onClick={() => revoke(g.id)}
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* General access */}
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            General access
          </p>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                visibility === "private"
                  ? "bg-surface-3 text-fg-muted"
                  : "bg-primary/12 text-primary",
              )}
            >
              <VisIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Select
                value={visibility}
                onChange={(e) => changeVisibility(e.target.value)}
              >
                {VIS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-2xs text-fg-subtle">
              {visibility === "private"
                ? "Only invited people can open this project."
                : "Anyone permitted can open this project."}
            </p>
            <Button
              size="sm"
              variant="ghost"
              icon={
                copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )
              }
              onClick={copyLink}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
