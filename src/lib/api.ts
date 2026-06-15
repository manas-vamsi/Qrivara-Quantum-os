const API_BASE = "http://localhost:8000";

export const api = {
  baseUrl: API_BASE,
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
  getProjectResults: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/results/project/${projectId}`);
    return res.json();
  },
  generateCode: async (doc: any) => {
    const res = await fetch(`${API_BASE}/codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    return res.json();
  },
  executeCode: async (code: string) => {
    const res = await fetch(`${API_BASE}/codegen/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error("Code execution failed");
    return res.json();
  },
  startOptimization: async (params: any) => {
    const res = await fetch(`${API_BASE}/optimization/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: params.method || "bayesian",
        objectives: params.objectives || ["frequency"],
        params: params,
      }),
    });
    return res.json();
  },
  getOptimizationResults: async (runId: string) => {
    const res = await fetch(`${API_BASE}/optimization/${runId}/results`);
    return res.json();
  },
  runInverseDesign: async (targetFreq: number, targetAnharm: number) => {
    const res = await fetch(`${API_BASE}/optimization/inverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_frequency: targetFreq, target_anharmonicity: targetAnharm }),
    });
    return res.json();
  },
  getEjEcRegion: async () => {
    const res = await fetch(`${API_BASE}/optimization/region/ej-ec`);
    return res.json();
  },
  runYield: async (body: any) => {
    const res = await fetch(`${API_BASE}/optimization/yield`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Yield analysis failed");
    return res.json();
  },
};
