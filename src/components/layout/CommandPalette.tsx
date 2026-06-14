import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Play,
  Moon,
  Sun,
} from "lucide-react";
import { NAV_ALL } from "@/config/nav";
import { useAppStore } from "@/store/useAppStore";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, toggleTheme, theme, setNewDesignOpen } =
    useAppStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    if (commandOpen) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [commandOpen]);

  const commands = useMemo<Cmd[]>(() => {
    const close = () => setCommandOpen(false);
    const nav: Cmd[] = NAV_ALL.map((n) => ({
      id: "nav-" + n.path,
      label: `Go to ${n.label}`,
      group: "Navigation",
      icon: <n.icon className="h-4 w-4" />,
      hint: n.description,
      run: () => {
        navigate(n.path);
        close();
      },
    }));
    const actions: Cmd[] = [
      {
        id: "new-design",
        label: "Create new design",
        group: "Actions",
        icon: <Plus className="h-4 w-4" />,
        run: () => {
          close();
          setNewDesignOpen(true);
        },
      },
      {
        id: "run-sim",
        label: "Run simulation",
        group: "Actions",
        icon: <Play className="h-4 w-4" />,
        run: () => {
          navigate("/app/simulation");
          close();
        },
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        group: "Actions",
        icon:
          theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          ),
        run: () => {
          toggleTheme();
          close();
        },
      },
    ];
    return [...actions, ...nav];
  }, [navigate, setCommandOpen, theme, toggleTheme, setNewDesignOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    filtered.forEach((c) => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    });
    return [...map.entries()];
  }, [filtered]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      setCommandOpen(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {commandOpen && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCommandOpen(false)}
            className="absolute inset-0 bg-bg-deep/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4.5 w-4.5 h-[1.1rem] w-[1.1rem] text-fg-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search modules, run commands…"
                className="h-14 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <div className="py-10 text-center text-sm text-fg-subtle">
                  No results for “{query}”
                </div>
              )}
              {grouped.map(([group, items]) => (
                <div key={group} className="mb-1">
                  <p className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                    {group}
                  </p>
                  {items.map((cmd) => {
                    const index = filtered.indexOf(cmd);
                    const isActive = index === active;
                    return (
                      <button
                        key={cmd.id}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => cmd.run()}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-primary/12 text-fg"
                            : "text-fg-muted hover:bg-surface-2",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 place-items-center rounded-lg",
                            isActive
                              ? "bg-primary/15 text-primary"
                              : "bg-surface-2 text-fg-subtle",
                          )}
                        >
                          {cmd.icon}
                        </span>
                        <span className="flex-1 truncate">{cmd.label}</span>
                        {isActive && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-fg-subtle" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2.5 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> select
              </span>
              <span className="ml-auto font-medium">QRIVARA Quantum OS</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
