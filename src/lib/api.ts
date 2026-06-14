const API_BASE = "http://localhost:8000";

export const api = {
  getProjects: async () => {
    const res = await fetch(`${API_BASE}/projects/`);
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
  },
  createProject: async (data: any) => {
    const res = await fetch(`${API_BASE}/projects/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getProjectDesigns: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/designs`);
    return res.json();
  },
  getDesign: async (designId: string) => {
    const res = await fetch(`${API_BASE}/designs/${designId}`);
    return res.json();
  },
  saveDesign: async (designId: string, version: number, doc: any) => {
    const res = await fetch(`${API_BASE}/designs/${designId}/doc`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, doc }),
    });
    if (!res.ok) throw new Error("Conflict or error saving design");
    return res.json();
  },
  runSimulation: async (designId: string, type: string, solver: string, params: any) => {
    const res = await fetch(`${API_BASE}/designs/${designId}/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, solver, params }),
    });
    return res.json();
  },
  getComponents: async () => {
    const res = await fetch(`${API_BASE}/components/`);
    return res.json();
  },
};
