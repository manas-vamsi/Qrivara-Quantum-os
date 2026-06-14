import { create } from "zustand";
import { api } from "@/lib/api";
import { PROJECTS as mockProjects, COMPONENT_LIBRARY as mockComps } from "@/data/mockData";

interface DataState {
  projects: any[];
  components: any;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  fetchComponents: () => Promise<void>;
}

export const useDataStore = create<DataState>((set) => ({
  projects: mockProjects, // fallback/initial
  components: { built_in: mockComps, custom: [] },
  loading: false,
  error: null,
  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getProjects();
      set({ projects: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
  fetchComponents: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getComponents();
      set({ components: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));
