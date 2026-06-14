import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { createPortal } from "react-dom";
import { NAV_ALL } from "@/config/nav";
import { IconButton } from "@/components/ui/Button";
import { Logo } from "@/components/common/Logo";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </IconButton>

      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[100] lg:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-bg-deep/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
                className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-line bg-surface"
              >
                <div className="flex h-16 items-center justify-between border-b border-line px-4">
                  <Logo />
                  <IconButton onClick={() => setOpen(false)} aria-label="Close">
                    <X className="h-5 w-5" />
                  </IconButton>
                </div>
                <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                  {NAV_ALL.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === "/"}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary/12 text-primary"
                              : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                          )
                        }
                      >
                        <Icon className="h-5 w-5" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && <Badge tone="violet">{item.badge}</Badge>}
                      </NavLink>
                    );
                  })}
                </nav>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
