import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  FolderGit2,
  Loader2,
  UserPlus,
  UserCheck,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

const ROLE_TONE: Record<string, "primary" | "cyan" | "violet" | "neutral"> = {
  owner: "primary", editor: "cyan", commenter: "violet", viewer: "neutral",
};

interface ProfileProject {
  id: string;
  name: string;
  description: string;
  qubits: number;
  status: string;
  your_role: string;
}

interface ProfileData {
  id: string;
  name: string;
  role: string;
  org: string;
  handle?: string | null;
  headline?: string;
  bio?: string;
  institution?: string;
  projects: ProfileProject[];
}

export default function Profile() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection state for this person (relative to the acting user).
  const [conn, setConn] = useState<{ id: string; status: string; direction: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelf = me?.id === userId;

  const loadConnections = useCallback(async () => {
    try {
      const conns = await api.getConnections();
      const match = (Array.isArray(conns) ? conns : []).find(
        (c: any) => c.user?.id === userId,
      );
      setConn(match ? { id: match.id, status: match.status, direction: match.direction } : null);
    } catch {
      /* ignore */
    }
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.getUser(userId);
      setData(d);
    } catch (e: any) {
      setError(e.message || "Profile not found");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    if (!isSelf) loadConnections();
  }, [load, loadConnections, isSelf]);

  async function connect() {
    setBusy(true);
    try {
      await api.requestConnection(userId);
      await loadConnections();
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    if (!conn) return;
    setBusy(true);
    try {
      await api.acceptConnection(conn.id);
      await loadConnections();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-fg-subtle">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <IconButton aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <EmptyState
          icon={<FolderGit2 className="h-6 w-6" />}
          title="Profile unavailable"
          description={error || "This user could not be found."}
        />
      </div>
    );
  }

  function connectionAction() {
    if (isSelf) return null;
    if (!conn) {
      return (
        <Button icon={<UserPlus className="h-4 w-4" />} loading={busy} onClick={connect}>
          Connect
        </Button>
      );
    }
    if (conn.status === "accepted") {
      return <Badge tone="success" dot>Connected</Badge>;
    }
    if (conn.direction === "incoming") {
      return (
        <Button icon={<Check className="h-4 w-4" />} loading={busy} onClick={accept}>
          Accept request
        </Button>
      );
    }
    return <Badge tone="neutral">Request pending</Badge>;
  }

  return (
    <div className="space-y-6">
      <IconButton aria-label="Back" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
      </IconButton>

      {/* Identity header */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={data.name} size={64} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold tracking-tight text-fg">
                  {data.name}
                </h2>
                {isSelf && <Badge tone="neutral">You</Badge>}
              </div>
              {data.handle && (
                <p className="text-sm text-fg-subtle">@{data.handle}</p>
              )}
              <p className="mt-0.5 text-sm text-fg-muted">
                {data.headline || data.role}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-2xs text-fg-subtle">
                <Building2 className="h-3.5 w-3.5" />
                {data.institution || data.org || "—"}
              </p>
            </div>
          </div>
          <div className="shrink-0">{connectionAction()}</div>
        </CardContent>
      </Card>

      {/* Bio */}
      {data.bio && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
              About
            </h3>
            <p className="text-sm leading-relaxed text-fg-muted">{data.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Projects this viewer can see */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <FolderGit2 className="h-4 w-4 text-primary" />
          <h3 className="font-display text-[0.95rem] font-semibold tracking-tight text-fg">
            Projects you can access
          </h3>
          <Badge tone="neutral">{data.projects.length}</Badge>
        </div>
        {data.projects.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="h-6 w-6" />}
            title="No shared projects"
            description={
              isSelf
                ? "Projects you own appear here."
                : `${data.name} hasn’t shared any projects with you.`
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/app/designer?projectId=${p.id}`)}
                className="rounded-xl border border-line bg-surface-2 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
              >
                <div className="flex items-start justify-between">
                  <Badge tone="neutral">{p.qubits}Q</Badge>
                  <Badge tone={ROLE_TONE[p.your_role] ?? "neutral"}>{p.your_role}</Badge>
                </div>
                <h4 className="mt-2.5 text-sm font-semibold text-fg">{p.name}</h4>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{p.description}</p>
                <p className="mt-2 flex items-center gap-1.5 text-2xs text-fg-subtle">
                  <UserCheck className="h-3 w-3" /> {p.status}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
