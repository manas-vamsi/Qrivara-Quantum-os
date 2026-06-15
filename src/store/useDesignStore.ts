import { create } from "zustand";

/**
 * Shared design graph (canvas nodes + edges) so the 2D Visual Designer is the
 * single source of truth and the 3D View can mirror it. Kept loosely-typed
 * (`any`) to avoid coupling to React Flow's generics.
 */
interface DesignState {
  nodes: any[];
  edges: any[];
  setGraph: (nodes: any[], edges: any[]) => void;
  removeNode: (id: string) => void;
}

export const useDesignStore = create<DesignState>((set) => ({
  nodes: [],
  edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    })),
}));
