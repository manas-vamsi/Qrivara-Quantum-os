import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send, Loader2 } from "lucide-react";
import { ChatbotMark } from "@/components/common/Logo";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

/** Friendly page name from the route, so the assistant knows where the user is. */
const PAGE_NAMES: Record<string, string> = {
  "": "Dashboard", dashboard: "Dashboard", projects: "Projects", designer: "Visual Designer",
  view3d: "3D View", code: "Code Studio", simulation: "Simulation", optimization: "Optimization",
  results: "Results", fabrication: "Fabrication", experiments: "Experiments",
  collaboration: "Collaboration", components: "Component Library", materials: "Material Library",
  settings: "Settings",
};
function pageFromPath(path: string): string {
  const seg = path.replace(/^\/app\/?/, "").split("/")[0] || "";
  return PAGE_NAMES[seg] || "Dashboard";
}

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm **QRIVARA AI** — think of me as your quantum-hardware mentor. Ask me anything about your designs, your results, the physics behind them, or how to get the most out of QRIVARA. What are you working on?",
};

const SUGGESTIONS = [
  "What does anharmonicity mean for my qubit?",
  "How do I improve fabrication yield?",
  "Explain dispersive readout simply.",
];

/* ---- tiny markdown renderer (bold, inline code, bullets, headings) ---- */
function renderInline(text: string, kp: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**"))
      nodes.push(<strong key={`${kp}b${i}`} className="font-semibold text-fg">{tok.slice(2, -2)}</strong>);
    else
      nodes.push(<code key={`${kp}c${i}`} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.8em] text-primary">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul${k}`} className="my-1 space-y-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-px text-primary">•</span>
            <span>{renderInline(b, `li${k}_${i}_`)}</span>
          </li>
        ))}
      </ul>,
    );
  };
  lines.forEach((ln, idx) => {
    const t = ln.trim();
    if (/^[*-]\s+/.test(t)) { bullets.push(t.replace(/^[*-]\s+/, "")); return; }
    flush(idx);
    if (!t) return;
    const h = t.match(/^#{1,4}\s+(.*)/);
    if (h) { blocks.push(<p key={idx} className="mt-1 font-semibold text-fg">{renderInline(h[1], `h${idx}_`)}</p>); return; }
    blocks.push(<p key={idx}>{renderInline(t, `p${idx}_`)}</p>);
  });
  flush(lines.length);
  return <div className="space-y-1.5">{blocks}</div>;
}

export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    let started = false;
    let acc = "";
    try {
      await api.aiChatStream(
        next.map((m) => ({ role: m.role, content: m.content })),
        { page: pageFromPath(location.pathname), projectId: activeProjectId },
        (chunk) => {
          acc += chunk;
          if (!started) {
            started = true;
            setLoading(false);            // first token arrived — swap "Thinking…" for the live message
            setMessages((m) => [...m, { role: "assistant", content: acc }]);
          } else {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: acc };
              return copy;
            });
          }
        },
      );
      if (!started) setMessages((m) => [...m, { role: "assistant", content: "…" }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: e?.message || "AI service is temporarily unavailable." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Launcher — hidden while the panel is open to avoid a double close button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setOpen(true)}
            aria-label="Open QRIVARA AI assistant"
            className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface shadow-pop ring-1 ring-primary/15 transition-transform hover:scale-105 hover:border-primary/40"
          >
            <ChatbotMark size={34} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="QRIVARA AI assistant"
            className="fixed bottom-6 right-6 z-50 flex h-[34rem] max-h-[calc(100dvh-3rem)] w-[24rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/40"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-3">
              <ChatbotMark size={30} />
              <div className="leading-tight">
                <p className="font-display text-sm font-semibold text-fg">QRIVARA AI</p>
                <p className="text-2xs text-fg-subtle">Design & physics assistant</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-3 hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-surface px-4 py-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && <ChatbotMark size={24} className="mt-0.5 shrink-0" />}
                  <div
                    className={cn(
                      "max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-primary text-white"
                        : "rounded-bl-sm border border-line bg-surface-2 text-fg",
                    )}
                  >
                    {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-fg-subtle">
                  <ChatbotMark size={24} className="shrink-0" />
                  <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </span>
                </div>
              )}

              {messages.length === 1 && !loading && (
                <div className="space-y-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-center gap-2 border-t border-line bg-surface-2 p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask QRIVARA AI…"
                aria-label="Message"
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
