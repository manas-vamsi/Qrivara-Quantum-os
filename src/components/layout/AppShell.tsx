import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { NewDesignModal } from "./NewDesignModal";
import { ChatbotWidget } from "./ChatbotWidget";
import { useAppStore, applyTheme } from "@/store/useAppStore";

export function AppShell() {
  const theme = useAppStore((s) => s.theme);
  const location = useLocation();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Designer & Code Studio want a full-bleed (non-scrolling) canvas.
  const fullBleed =
    location.pathname.startsWith("/app/designer") ||
    location.pathname.startsWith("/app/view3d") ||
    location.pathname.startsWith("/app/code");

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-bg text-fg">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute left-1/2 top-0 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[30rem] w-[30rem] rounded-full bg-violet/[0.05] blur-[120px]" />
      </div>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative flex-1 overflow-hidden">
          {fullBleed ? (
            <Outlet />
          ) : (
            <div className="h-full overflow-y-auto">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"
              >
                <Outlet />
              </motion.div>
            </div>
          )}
        </main>
      </div>

      <CommandPalette />
      <NewDesignModal />
      <ChatbotWidget />
    </div>
  );
}
