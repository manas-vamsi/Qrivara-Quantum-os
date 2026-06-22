import { create } from "zustand";
import { api, getDevUserId, setDevUserId } from "@/lib/api";
import { useAppStore } from "./useAppStore";
import { useDataStore } from "./useDataStore";

export interface CollabUser {
  id: string;
  name: string;
  email: string;
  role: string;
  org: string;
  handle?: string | null;
  headline?: string;
  bio?: string;
  institution?: string;
  discoverable?: boolean;
  avatar_url?: string;
}

interface AuthState {
  me: CollabUser | null;
  users: CollabUser[];
  ready: boolean;
  /** Bumped whenever the acting user changes — subscribe to force refresh. */
  userTick: number;
  init: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  /** Dev-only: impersonate another seeded user and reload their workspace. */
  actAs: (id: string) => Promise<void>;
  /** Heartbeat so other users see this account as online. */
  startPresence: () => () => void;
}

function syncProfile(me: CollabUser) {
  useAppStore.getState().setProfile({
    name: me.name,
    email: me.email,
    role: me.role,
    org: me.org,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  me: null,
  users: [],
  ready: false,
  userTick: 0,
  init: async () => {
    try {
      const [me, users] = await Promise.all([api.getMe(), api.getUsers()]);
      // If no acting user was chosen yet, pin to whoever the backend returned
      // so the header is explicit from here on.
      if (!getDevUserId() && me?.id) setDevUserId(me.id);
      if (me) syncProfile(me);
      set({ me, users, ready: true });
    } catch {
      set({ ready: true });
    }
  },
  refreshUsers: async () => {
    try {
      set({ users: await api.getUsers() });
    } catch {
      /* ignore */
    }
  },
  actAs: async (id: string) => {
    if (id === get().me?.id) return;
    setDevUserId(id);
    try {
      const me = await api.getMe();
      if (me) syncProfile(me);
      set((s) => ({ me, userTick: s.userTick + 1 }));
      // Reload the workspace as the new user (visibility differs per user).
      await useDataStore.getState().fetchProjects();
      api.presencePing().catch(() => {});
    } catch {
      /* ignore */
    }
  },
  startPresence: () => {
    const ping = () => api.presencePing().catch(() => {});
    ping();
    const t = setInterval(ping, 45000);
    return () => clearInterval(t);
  },
}));
