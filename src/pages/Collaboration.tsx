import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  Share2,
  Send,
  Check,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Textarea, Select, Field, Input } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { TEAM, COMMENTS, PROJECT_STATUS_TONE, type Comment } from "@/data/mockData";
import { useDataStore } from "@/store/useDataStore";
import { cn, timeAgo } from "@/lib/utils";

const presenceTone = { online: "success", away: "warning", offline: "neutral" } as const;

export default function Collaboration() {
  const [invite, setInvite] = useState(false);
  const PROJECTS = useDataStore((s) => s.projects);
  const [comments, setComments] = useState<Comment[]>(COMMENTS);
  const [draft, setDraft] = useState("");
  const [reviews, setReviews] = useState<Record<string, "approved" | "changes" | null>>({});

  const online = TEAM.filter((m) => m.status === "online").map((m) => m.name);
  const reviewItems = [
    { id: "r1", project: "Condor Readout Array", by: "Diego Santos" },
    { id: "r2", project: "Falcon-17 Processor", by: "Lena Müller" },
    { id: "r3", project: "Wren Coupler Study", by: "Aisha Khan" },
  ];

  function addComment() {
    if (!draft.trim()) return;
    setComments((c) => [
      {
        id: "new-" + c.length,
        author: "Karthik Nair",
        text: draft.trim(),
        at: new Date().toISOString(),
        target: "Falcon-17 Processor",
        resolved: false,
      },
      ...c,
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collaboration Workspace"
        subtitle="Projects, reviews, comments and design sharing."
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            <div className="hidden sm:block">
              <AvatarGroup names={online} size={32} max={4} />
            </div>
            <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInvite(true)}>
              Invite
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          {/* Shared projects */}
          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Shared Projects
              </h3>
            </div>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              {PROJECTS.filter((p) => p.status !== "archived").map((p) => (
                <div
                  key={p.id}
                  className="group rounded-xl border border-line bg-surface-2 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Badge tone={PROJECT_STATUS_TONE[p.status]} dot={p.status === "active" || p.status === "simulating"}>
                        {p.status}
                      </Badge>
                      <Badge tone="neutral">{p.qubits}Q</Badge>
                    </div>
                    <IconButton size="sm" aria-label="Share">
                      <Share2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <h4 className="mt-2.5 text-sm font-semibold text-fg">{p.name}</h4>
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{p.description}</p>
                  <div className="mt-3"><Progress value={p.progress} size="sm" /></div>
                  <div className="mt-3 flex items-center justify-between">
                    <AvatarGroup names={p.collaborators} size={24} max={3} />
                    <span className="text-2xs text-fg-subtle">{timeAgo(p.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Discussion */}
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Discussion
              </h3>
              <Badge tone="neutral">
                {comments.filter((c) => !c.resolved).length} open
              </Badge>
            </div>
            <CardContent className="pt-4">
              {/* Composer */}
              <div className="flex gap-3">
                <Avatar name="Karthik Nair" size={34} />
                <div className="flex-1">
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a comment…"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={addComment}>
                      Comment
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <AnimatePresence initial={false}>
                  {comments.map((c) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        "flex gap-3 rounded-xl border border-line p-3.5 transition-opacity",
                        c.resolved && "opacity-60",
                      )}
                    >
                      <Avatar name={c.author} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-fg">{c.author}</span>
                          <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs text-fg-subtle">
                            {c.target}
                          </span>
                          <span className="text-2xs text-fg-subtle">{timeAgo(c.at)}</span>
                          {c.resolved && <Badge tone="success" dot>resolved</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-fg-muted">{c.text}</p>
                        <div className="mt-2 flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setComments((cs) =>
                                cs.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)),
                              )
                            }
                            icon={<Check className="h-3.5 w-3.5" />}
                          >
                            {c.resolved ? "Reopen" : "Resolve"}
                          </Button>
                          <Button size="sm" variant="ghost" icon={<MessageSquare className="h-3.5 w-3.5" />}>
                            Reply
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">Team</h3>
              <Button variant="ghost" size="sm">Manage</Button>
            </div>
            <CardContent className="space-y-1 pt-3">
              {TEAM.map((m) => (
                <div key={m.email} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                  <div className="relative">
                    <Avatar name={m.name} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5">
                      <StatusDot tone={presenceTone[m.status]} pulse={m.status === "online"} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{m.name}</p>
                    <p className="truncate text-2xs text-fg-subtle">{m.role}</p>
                  </div>
                  <span className="text-2xs capitalize text-fg-subtle">{m.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <div className="px-5 pt-5">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-tight">
                Pending Reviews
              </h3>
            </div>
            <CardContent className="space-y-3 pt-3">
              {reviewItems.map((r) => {
                const state = reviews[r.id];
                return (
                  <div key={r.id} className="rounded-xl border border-line bg-surface-2 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.by} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{r.project}</p>
                        <p className="text-2xs text-fg-subtle">requested by {r.by}</p>
                      </div>
                      {!state && <Badge tone="warning" dot>review</Badge>}
                      {state === "approved" && <Badge tone="success" dot>approved</Badge>}
                      {state === "changes" && <Badge tone="error" dot>changes</Badge>}
                    </div>
                    {!state && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm" variant="subtle" className="flex-1"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => setReviews((s) => ({ ...s, [r.id]: "approved" }))}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm" variant="outline" className="flex-1"
                          onClick={() => setReviews((s) => ({ ...s, [r.id]: "changes" }))}
                        >
                          Request changes
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invite modal */}
      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="Invite to workspace"
        description="Add a teammate to collaborate on quantum designs."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(false)}>Cancel</Button>
            <Button icon={<Send className="h-4 w-4" />} onClick={() => setInvite(false)}>
              Send invite
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Email address">
            <Input type="email" placeholder="name@lab.edu" />
          </Field>
          <Field label="Role">
            <Select defaultValue="engineer">
              <option value="engineer">Quantum Engineer</option>
              <option value="researcher">Researcher</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
