import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Folder,
  Bookmark,
  Share2,
  LayoutGrid,
  List,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, GlowCard } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { AvatarGroup } from "@/components/ui/Avatar";
import { Input, SegmentedControl } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { comingSoon } from "@/components/common/ComingSoon";
import { ShareDialog } from "@/components/collab/ShareDialog";
import { AIDesignBar } from "@/components/common/AIDesignBar";
import { PROJECT_STATUS_TONE } from "@/data/mockData";
import { useAppStore } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";
import { timeAgo } from "@/lib/utils";

type Filter = "all" | "active" | "review" | "archived" | "simulating";

const FOLDERS = [
  { name: "Flagship", count: 1 },
  { name: "Test chips", count: 2 },
  { name: "Studies", count: 1 },
  { name: "Archive", count: 1 },
];

export default function Projects() {
  const navigate = useNavigate();
  const setNewDesignOpen = useAppStore((s) => s.setNewDesignOpen);
  const { projects, fetchProjects } = useDataStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      const s = q.toLowerCase();
      return (
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        (p.tags || []).some((t: string) => t.toLowerCase().includes(s))
      );
    });
  }, [projects, q, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="All your quantum designs, folders, snapshots and tags."
        icon={<Folder className="h-5 w-5" />}
        actions={
          <Button icon={<Plus className="h-4 w-4" strokeWidth={2.5} />} onClick={() => setNewDesignOpen(true)}>
            New Design
          </Button>
        }
      />

      {/* AI design generator — the primary "create" action for this page */}
      <AIDesignBar />

      {/* Folders */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FOLDERS.map((f) => (
          <button
            key={f.name}
            onClick={() => comingSoon("Project folders")}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/12 text-primary">
              <Folder className="h-[1.1rem] w-[1.1rem]" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">{f.name}</p>
              <p className="text-2xs text-fg-subtle">{f.count} designs</p>
            </div>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-xs">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search projects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={(val) => setFilter(val as Filter)}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "review", label: "Review" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <SegmentedControl
            size="sm"
            value={view}
            onChange={(val) => setView(val as "grid" | "list")}
            options={[
              { value: "grid", label: <LayoutGrid className="h-3.5 w-3.5" /> },
              { value: "list", label: <List className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Folder className="h-5 w-5" />}
          title="No projects found"
          description="Try a different search or create a new design."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewDesignOpen(true)}>New Design</Button>}
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <GlowCard key={p.id} className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                  {p.qubits}Q
                </div>
                <div className="flex items-center gap-1">
                  <IconButton size="sm" aria-label="Bookmark" onClick={(e) => { e.stopPropagation(); comingSoon("Bookmarks"); }}><Bookmark className="h-4 w-4" /></IconButton>
                  <IconButton size="sm" aria-label="Share" onClick={(e) => { e.stopPropagation(); setShareTarget({ id: p.id, name: p.name }); }}><Share2 className="h-4 w-4" /></IconButton>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <h3 className="font-display text-base font-semibold text-fg">{p.name}</h3>
                <Badge tone={PROJECT_STATUS_TONE[p.status] || "neutral"} dot={p.status === "active" || p.status === "simulating"}>
                  {p.status}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-fg-subtle">{p.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.tags || []).map((t: string) => (
                  <span key={t} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-2xs text-fg-muted">
                    #{t}
                  </span>
                ))}
              </div>
              <div className="mt-4"><Progress value={p.progress || 0} size="sm" /></div>
              <div className="mt-auto flex items-center justify-between pt-4">
                <AvatarGroup names={p.collaborators || []} size={26} max={3} />
                <span className="text-2xs text-fg-subtle">{timeAgo(p.updatedAt || p.updated_at)}</span>
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => navigate(`/app/designer?projectId=${p.id}`)}>
                Open
              </Button>
            </GlowCard>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-1 pt-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="flex w-full items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
              >
                <button
                  onClick={() => navigate(`/app/designer?projectId=${p.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-xs font-semibold text-primary">
                    {p.qubits}Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-fg">{p.name}</h4>
                      <Badge tone={PROJECT_STATUS_TONE[p.status] || "neutral"} dot={p.status === "active"}>{p.status}</Badge>
                    </div>
                    <p className="truncate text-xs text-fg-subtle">{p.description}</p>
                  </div>
                  <div className="hidden w-28 sm:block"><Progress value={p.progress || 0} size="sm" /></div>
                  <AvatarGroup names={p.collaborators || []} size={24} max={3} />
                  <span className="hidden w-16 shrink-0 text-right text-2xs text-fg-subtle sm:block">{timeAgo(p.updatedAt || p.updated_at)}</span>
                </button>
                <IconButton size="sm" aria-label="Share" onClick={() => setShareTarget({ id: p.id, name: p.name })}><Share2 className="h-4 w-4" /></IconButton>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
