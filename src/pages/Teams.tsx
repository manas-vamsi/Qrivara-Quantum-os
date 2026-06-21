import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Plus, Shield, UserPlus, Trash2, LogOut, Loader2, Search, X, Crown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

interface Member { id: string; name: string; handle?: string | null; role?: string; org?: string; team_role: string }
interface Team {
  id: string; name: string; description: string; org: string;
  member_count: number; my_role: string | null; is_member: boolean;
  members: Member[]; created_at: string;
}

export default function Teams() {
  const me = useAuthStore((s) => s.me);
  const users = useAuthStore((s) => s.users);
  const userTick = useAuthStore((s) => s.userTick);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTeams();
      setTeams(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, userTick]);

  const managed = teams.find((t) => t.id === manageId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-subtle">
          Group people and share projects with an entire team at once.
        </p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>New team</Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading teams…
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No teams yet"
          description="Create a team to share projects with a group instead of one person at a time."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>New team</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Card key={t.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                {t.my_role && (
                  <Badge tone={t.my_role === "lead" ? "primary" : "neutral"}>
                    {t.my_role === "lead" ? "Lead" : "Member"}
                  </Badge>
                )}
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-fg">{t.name}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{t.description || "No description"}</p>
              <div className="mt-auto flex items-center justify-between pt-4">
                <AvatarGroup names={t.members.map((m) => m.name)} size={26} max={4} />
                <span className="text-2xs text-fg-subtle">{t.member_count} members</span>
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setManageId(t.id)}>
                {t.my_role === "lead" ? "Manage" : "View"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <CreateTeamModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => load()} />
      {managed && (
        <ManageTeamModal
          team={managed}
          meId={me?.id}
          users={users}
          onClose={() => setManageId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CreateTeamModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTeam({ name: name.trim(), description: desc.trim() });
      onCreated();
      setName(""); setDesc("");
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to create team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a team"
      description="You’ll be the team lead and can add members."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!name.trim()} onClick={create}>Create</Button></>}>
      <div className="space-y-3">
        <Input placeholder="Team name — e.g. Falcon Core" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea rows={3} placeholder="What does this team work on? (optional)"
          value={desc} onChange={(e) => setDesc(e.target.value)} />
        {error && <p className="text-2xs text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function ManageTeamModal({
  team, meId, users, onClose, onChanged,
}: {
  team: Team; meId?: string;
  users: { id: string; name: string; handle?: string | null; org?: string }[];
  onClose: () => void; onChanged: () => void;
}) {
  const isLead = team.my_role === "lead";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(team.members.map((m) => m.id)), [team.members]);
  const candidates = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    return users
      .filter((u) => !memberIds.has(u.id) &&
        (u.name.toLowerCase().includes(ql) || (u.handle || "").toLowerCase().includes(ql)))
      .slice(0, 6);
  }, [q, users, memberIds]);

  async function run(key: string, fn: () => Promise<any>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={team.name} description={team.description || "Team members"} size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          {isLead ? (
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />}
              loading={busy === "delete"}
              onClick={() => run("delete", async () => { await api.deleteTeam(team.id); onClose(); })}>
              Delete team
            </Button>
          ) : (
            <Button variant="ghost" icon={<LogOut className="h-4 w-4" />}
              loading={busy === "leave"} disabled={!meId}
              onClick={() => run("leave", async () => { if (!meId) return; await api.removeTeamMember(team.id, meId); onClose(); })}>
              Leave team
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      }>
      <div className="space-y-4">
        {isLead && (
          <div className="relative">
            <Input icon={<Search className="h-4 w-4" />} placeholder="Add a member by name…"
              value={q} onChange={(e) => setQ(e.target.value)} />
            {candidates.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                {candidates.map((u) => (
                  <button key={u.id} disabled={!!busy}
                    onClick={() => run(`add-${u.id}`, async () => { await api.addTeamMember(team.id, u.id); setQ(""); })}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2">
                    <Avatar name={u.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{u.name}</p>
                      <p className="truncate text-2xs text-fg-subtle">{u.handle ? `@${u.handle}` : u.org}</p>
                    </div>
                    <UserPlus className="h-4 w-4 text-fg-subtle" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            {team.member_count} members
          </p>
          <div className="space-y-1">
            {team.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-2">
                <Avatar name={m.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {m.name}{m.id === meId && <span className="text-fg-subtle"> (you)</span>}
                  </p>
                  <p className="truncate text-2xs text-fg-subtle">{m.role || m.org}</p>
                </div>
                {m.team_role === "lead" ? (
                  <Badge tone="primary"><Crown className="mr-1 h-3 w-3" />Lead</Badge>
                ) : (
                  isLead && (
                    <IconButton size="sm" aria-label="Remove member"
                      onClick={() => run(`rm-${m.id}`, () => api.removeTeamMember(team.id, m.id))}>
                      {busy === `rm-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </IconButton>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-2xs text-error">{error}</p>}
      </div>
    </Modal>
  );
}
