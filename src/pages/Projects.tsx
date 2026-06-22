import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Folder,
  FolderInput,
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
import { ShareDialog } from "@/components/collab/ShareDialog";
import { AIDesignBar } from "@/components/common/AIDesignBar";
import { PROJECT_STATUS_TONE } from "@/data/mockData";
import { useAppStore } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

type Filter = "all" | "active" | "review" | "archived" | "simulating";

export default function Projects() {
  const navigate = useNavigate();
  const setNewDesignOpen = useAppStore((s) => s.setNewDesignOpen);
  const { projects, fetchProjects } = useDataStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Real folders, derived from the projects' folder field.
  const folders = useMemo(() => {
    const m: Record<string, number> = {};
    projects.forEach((p) => { if (p.folder) m[p.folder] = (m[p.folder] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const toggleBookmark = async (id: string) => {
    try { await api.toggleBookmark(id); await fetchProjects(); } catch (e) { console.error(e); }
  };
  const assignFolder = async (id: string, current?: string | null) => {
    const name = window.prompt("Move to folder (leave blank to remove):", current || "");
    if (name === null) return;
    try { await api.updateProject(id, { folder: name.trim() || null }); await fetchProjects(); } catch (e) { console.error(e); }
  };

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (folderFilter && p.folder !== folderFilter) return false;
      if (starredOnly && !p.bookmarked) return false;
      const s = q.toLowerCase();
      return (
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        (p.tags || []).some((t: string) => t.toLowerCase().includes(s))
      );
    });
  }, [projects, q, filter, folderFilter, starredOnly]);

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

      {/* Folders + starred — real, derived from your projects */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setFolderFilter(null); setStarredOnly(false); }}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            !folderFilter && !starredOnly ? "border-primary/30 bg-primary/15 text-primary" : "border-line text-fg-subtle hover:bg-surface-2 hover:text-fg",
          )}
        >
          All projects
        </button>
        <button
          onClick={() => { setStarredOnly((v) => !v); setFolderFilter(null); }}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            starredOnly ? "border-primary/30 bg-primary/15 text-primary" : "border-line text-fg-subtle hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Bookmark className={cn("h-3.5 w-3.5", starredOnly && "fill-primary")} /> Starred
        </button>
        {folders.map((f) => (
          <button
            key={f.name}
            onClick={() => { setFolderFilter((cur) => (cur === f.name ? null : f.name)); setStarredOnly(false); }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              folderFilter === f.name ? "border-primary/30 bg-primary/15 text-primary" : "border-line text-fg-subtle hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Folder className="h-3.5 w-3.5" /> {f.name}
            <span className="text-fg-subtle">{f.count}</span>
          </button>
        ))}
        {folders.length === 0 && (
          <span className="text-2xs text-fg-subtle">No folders yet — use the folder button on a project to organize.</span>
        )}
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
                  <IconButton size="sm" aria-label={p.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={(e) => { e.stopPropagation(); toggleBookmark(p.id); }}>
                    <Bookmark className={cn("h-4 w-4", p.bookmarked && "fill-primary text-primary")} />
                  </IconButton>
                  <IconButton size="sm" aria-label="Move to folder" onClick={(e) => { e.stopPropagation(); assignFolder(p.id, p.folder); }}><FolderInput className="h-4 w-4" /></IconButton>
                  <IconButton size="sm" aria-label="Share" onClick={(e) => { e.stopPropagation(); setShareTarget({ id: p.id, name: p.name }); }}><Share2 className="h-4 w-4" /></IconButton>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <h3 className="font-display text-base font-semibold text-fg">{p.name}</h3>
                <Badge tone={PROJECT_STATUS_TONE[p.status] || "neutral"} dot={p.status === "active" || p.status === "simulating"}>
                  {p.status}
                </Badge>
                {p.folder && (
                  <span className="flex items-center gap-1 text-2xs text-fg-subtle">
                    <Folder className="h-3 w-3" />{p.folder}
                  </span>
                )}
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
