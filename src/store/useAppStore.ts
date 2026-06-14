import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

export interface Profile {
  name: string;
  email: string;
  role: string;
  org: string;
}

interface AppState {
  theme: Theme;
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  newDesignOpen: boolean;
  profile: Profile;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setNewDesignOpen: (open: boolean) => void;
  setProfile: (p: Profile) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarCollapsed: false,
      commandOpen: false,
      newDesignOpen: false,
      profile: {
        name: "Karthik Nair",
        email: "karthik@nexvista.com",
        role: "Lead Quantum Engineer",
        org: "NexVista Quantum Labs",
      },
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setNewDesignOpen: (newDesignOpen) => set({ newDesignOpen }),
      setProfile: (profile) => set({ profile }),
    }),
    {
      name: "qrivara-ui",
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        profile: s.profile,
      }),
    },
  ),
);

/** Apply the theme class to <html> — call from a top-level effect. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);
}
