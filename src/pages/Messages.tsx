import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hash, Lock, Plus, Search, Send, MessageSquare, Users, X, Loader2, Compass,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Switch } from "@/components/ui/Form";
import { EmptyState } from "@/components/common/EmptyState";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { cn, timeAgo } from "@/lib/utils";

interface Author { id: string; name: string; handle?: string | null; online?: boolean }
interface Channel {
  id: string; kind: "channel" | "dm"; name: string; topic: string;
  is_private: boolean; member_count: number; members: Author[];
  dm_user: Author | null; unread: number;
  last_message: { body: string; created_at: string; author: Author | null } | null;
}
interface Msg {
  id: string; channel_id: string; body: string; parent_id: string | null;
  created_at: string; author: Author | null; reply_count: number;
}

/** Small avatar with a presence dot. */
function PresenceAvatar({ name, online, size = 36 }: { name: string; online?: boolean; size?: number }) {
  return (
    <div className="relative shrink-0">
      <Avatar name={name} size={size} />
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" />
      )}
    </div>
  );
}

function MessageRow({
  m, onOpenThread,
}: { m: Msg; onOpenThread?: (m: Msg) => void }) {
  return (
    <div className="group flex gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2">
      <PresenceAvatar name={m.author?.name ?? "?"} online={m.author?.online} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-fg">{m.author?.name ?? "Unknown"}</span>
          <span className="text-2xs text-fg-subtle">{timeAgo(m.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{m.body}</p>
        {onOpenThread && m.reply_count > 0 && (
          <button
            onClick={() => onOpenThread(m)}
            className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({
  placeholder, onSend, autoFocus,
}: { placeholder: string; onSend: (text: string) => Promise<void>; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-line bg-surface p-3">
      <Textarea
        autoFocus={autoFocus}
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-32 min-h-[2.5rem] flex-1 resize-none"
      />
      <Button icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        disabled={!text.trim() || busy} onClick={submit}>
        Send
      </Button>
    </div>
  );
}

export default function Messages() {
  const me = useAuthStore((s) => s.me);
  const users = useAuthStore((s) => s.users);
  const userTick = useAuthStore((s) => s.userTick);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [thread, setThread] = useState<{ root: Msg; replies: Msg[] } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  // Whether the message list is scrolled near the bottom — only auto-scroll then.
  const atBottomRef = useRef(true);

  const active = useMemo(() => channels.find((c) => c.id === activeId) ?? null, [channels, activeId]);

  const loadChannels = useCallback(async () => {
    try {
      const data = await api.getChannels();
      const list: Channel[] = Array.isArray(data) ? data : [];
      // The channel being viewed is read — don't flash an unread badge on it.
      setChannels(list.map((c) => (c.id === activeIdRef.current ? { ...c, unread: 0 } : c)));
      // Auto-select the first channel on first load.
      if (!activeIdRef.current && list.length) setActiveId(list[0].id);
    } catch {
      /* ignore */
    }
  }, []);

  const loadMessages = useCallback(async (channelId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingMsgs(true);
    try {
      const data = await api.getMessages(channelId);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      if (!opts?.silent) setLoadingMsgs(false);
    }
  }, []);

  // Reset everything when the acting user switches.
  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    setThread(null);
    loadChannels();
  }, [loadChannels, userTick]);

  // Poll the channel list (unread badges) on a light interval.
  useEffect(() => {
    const t = setInterval(loadChannels, 15000);
    return () => clearInterval(t);
  }, [loadChannels]);

  // Load + poll the active channel's messages; keep it marked read while viewing.
  useEffect(() => {
    if (!activeId) return;
    setThread(null);          // a thread belongs to one channel — drop it on switch
    atBottomRef.current = true; // jump to newest when entering a channel
    loadMessages(activeId);
    api.markChannelRead(activeId).then(loadChannels).catch(() => {});
    const t = setInterval(() => {
      loadMessages(activeId, { silent: true });
      api.markChannelRead(activeId).catch(() => {}); // messages read in real time
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Pin to the newest message only when the user is already near the bottom, so
  // polling never yanks them away while reading history.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  // Refresh an open thread when the channel polls.
  useEffect(() => {
    if (!thread || !activeId) return;
    const t = setInterval(async () => {
      const replies = await api.getMessages(activeId, { parentId: thread.root.id }).catch(() => []);
      setThread((cur) => (cur ? { ...cur, replies: Array.isArray(replies) ? replies : [] } : cur));
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.root.id, activeId]);

  async function send(text: string) {
    if (!activeId) return;
    await api.postMessage(activeId, text);
    await loadMessages(activeId, { silent: true });
    loadChannels();
  }

  async function openThread(m: Msg) {
    const replies = await api.getMessages(m.channel_id, { parentId: m.id }).catch(() => []);
    setThread({ root: m, replies: Array.isArray(replies) ? replies : [] });
  }

  async function sendReply(text: string) {
    if (!thread || !activeId) return;
    await api.postMessage(activeId, text, thread.root.id);
    const replies = await api.getMessages(activeId, { parentId: thread.root.id }).catch(() => []);
    setThread((cur) => (cur ? { ...cur, replies: Array.isArray(replies) ? replies : [] } : cur));
    loadMessages(activeId, { silent: true });
  }

  const roomChannels = channels.filter((c) => c.kind === "channel");
  const dms = channels.filter((c) => c.kind === "dm");

  return (
    // Embedded under the Collaboration page (header + tabs above), so height is
    // offset for that chrome with a sensible floor on short viewports.
    <div className="flex h-[calc(100dvh-15rem)] min-h-[460px] gap-4">
      {/* ------------------------------- Rail ------------------------------- */}
      <Card className="flex w-64 shrink-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-fg">Messages</h2>
          <div className="flex items-center gap-1">
            <IconButton size="sm" aria-label="Browse channels" onClick={() => setShowBrowse(true)}>
              <Compass className="h-4 w-4" />
            </IconButton>
            <IconButton size="sm" aria-label="New channel" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3 no-scrollbar">
          {/* Channels */}
          <div>
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Channels</p>
            <div className="space-y-0.5">
              {roomChannels.map((c) => (
                <ChannelRow key={c.id} c={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} />
              ))}
              {roomChannels.length === 0 && (
                <p className="px-2 py-1 text-2xs text-fg-subtle">No channels yet.</p>
              )}
            </div>
          </div>

          {/* DMs */}
          <div>
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Direct messages</p>
              <button onClick={() => setShowNewDm(true)} aria-label="New direct message"
                className="text-fg-subtle hover:text-fg">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {dms.map((c) => (
                <ChannelRow key={c.id} c={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} />
              ))}
              {dms.length === 0 && (
                <p className="px-2 py-1 text-2xs text-fg-subtle">Start a conversation.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ----------------------------- Main pane ---------------------------- */}
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!active ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={<MessageSquare className="h-6 w-6" />}
              title="Select a conversation"
              description="Pick a channel or direct message to start chatting."
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {active.kind === "dm" ? (
                  <PresenceAvatar name={active.name} online={active.dm_user?.online} size={28} />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                    {active.is_private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-fg">{active.name}</h3>
                  <p className="truncate text-2xs text-fg-subtle">
                    {active.kind === "dm"
                      ? active.dm_user?.online ? "Active now" : "Offline"
                      : active.topic || `${active.member_count} members`}
                  </p>
                </div>
              </div>
              {active.kind === "channel" && (
                <Badge tone="neutral"><Users className="mr-1 h-3 w-3" />{active.member_count}</Badge>
              )}
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="flex-1 space-y-0.5 overflow-y-auto p-3"
            >
              {loadingMsgs ? (
                <p className="flex items-center gap-2 px-2 py-6 text-sm text-fg-subtle">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
                </p>
              ) : messages.length === 0 ? (
                <div className="grid h-full place-items-center">
                  <p className="text-sm text-fg-subtle">No messages yet — say hello 👋</p>
                </div>
              ) : (
                messages.map((m) => <MessageRow key={m.id} m={m} onOpenThread={openThread} />)
              )}
            </div>

            <Composer placeholder={`Message ${active.kind === "dm" ? active.name : "#" + active.name}…`} onSend={send} />
          </>
        )}
      </Card>

      {/* ----------------------------- Thread pane -------------------------- */}
      {thread && (
        <Card className="flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <MessageSquare className="h-4 w-4 text-primary" /> Thread
            </h3>
            <IconButton size="sm" aria-label="Close thread" onClick={() => setThread(null)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
            <MessageRow m={thread.root} />
            <div className="my-2 flex items-center gap-2 px-2 text-2xs text-fg-subtle">
              <span className="h-px flex-1 bg-line" />
              {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
              <span className="h-px flex-1 bg-line" />
            </div>
            {thread.replies.map((m) => <MessageRow key={m.id} m={m} />)}
          </div>
          <Composer placeholder="Reply…" onSend={sendReply} autoFocus />
        </Card>
      )}

      {/* ------------------------------- Modals ----------------------------- */}
      <CreateChannelModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => { loadChannels(); setActiveId(id); }}
      />
      <BrowseChannelsModal
        open={showBrowse}
        onClose={() => setShowBrowse(false)}
        onJoined={(id) => { loadChannels(); setActiveId(id); }}
      />
      <NewDmModal
        open={showNewDm}
        onClose={() => setShowNewDm(false)}
        users={users.filter((u) => u.id !== me?.id)}
        onOpened={(id) => { loadChannels(); setActiveId(id); }}
      />
    </div>
  );
}

function ChannelRow({ c, active, onClick }: { c: Channel; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-primary/12 text-primary" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {c.kind === "dm" ? (
        <PresenceAvatar name={c.name} online={c.dm_user?.online} size={22} />
      ) : c.is_private ? (
        <Lock className="h-4 w-4 shrink-0" />
      ) : (
        <Hash className="h-4 w-4 shrink-0" />
      )}
      <span className={cn("flex-1 truncate", c.unread > 0 && "font-semibold text-fg")}>{c.name}</span>
      {c.unread > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-none text-white">
          {c.unread > 9 ? "9+" : c.unread}
        </span>
      )}
    </button>
  );
}

function CreateChannelModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const ch = await api.createChannel({ name: name.trim(), topic: topic.trim(), is_private: isPrivate });
      onCreated(ch.id);
      setName(""); setTopic(""); setIsPrivate(false);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to create channel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a channel"
      description="Channels organize conversations by topic."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={create} disabled={!name.trim()}>Create</Button></>}>
      <div className="space-y-3">
        <Input icon={<Hash className="h-4 w-4" />} placeholder="e.g. falcon-17"
          value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())} />
        <Input placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-fg-muted" />
            <div>
              <p className="text-sm font-medium text-fg">Private channel</p>
              <p className="text-2xs text-fg-subtle">Only invited members can find and join.</p>
            </div>
          </div>
          <Switch checked={isPrivate} onChange={setIsPrivate} />
        </div>
        {error && <p className="text-2xs text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function BrowseChannelsModal({
  open, onClose, onJoined,
}: { open: boolean; onClose: () => void; onJoined: (id: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string; topic: string; member_count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.discoverChannels()
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function join(id: string) {
    setJoining(id);
    try {
      await api.joinChannel(id);
      onJoined(id);
      onClose();
    } finally {
      setJoining(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Browse channels"
      description="Public channels in your organization.">
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-subtle">You’ve joined every public channel.</p>
      ) : (
        <div className="space-y-1">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                <Hash className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{c.name}</p>
                <p className="truncate text-2xs text-fg-subtle">{c.topic || `${c.member_count} members`}</p>
              </div>
              <Button size="sm" variant="outline" loading={joining === c.id} onClick={() => join(c.id)}>Join</Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function NewDmModal({
  open, onClose, users, onOpened,
}: {
  open: boolean; onClose: () => void;
  users: { id: string; name: string; handle?: string | null; org?: string }[];
  onOpened: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const base = users.filter((u) =>
      !ql || u.name.toLowerCase().includes(ql) || (u.handle || "").toLowerCase().includes(ql));
    return base.slice(0, 8);
  }, [q, users]);

  async function start(id: string) {
    setOpening(id);
    try {
      const ch = await api.openDm(id);
      onOpened(ch.id);
      onClose();
    } finally {
      setOpening(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New direct message"
      description="Start a private conversation.">
      <div className="space-y-3">
        <Input icon={<Search className="h-4 w-4" />} placeholder="Search people…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {matches.map((u) => (
            <button key={u.id} onClick={() => start(u.id)} disabled={!!opening}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2">
              <Avatar name={u.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{u.name}</p>
                <p className="truncate text-2xs text-fg-subtle">
                  {u.handle ? `@${u.handle}` : u.org}
                </p>
              </div>
              {opening === u.id && <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />}
            </button>
          ))}
          {matches.length === 0 && <p className="py-4 text-center text-sm text-fg-subtle">No people found.</p>}
        </div>
      </div>
    </Modal>
  );
}
