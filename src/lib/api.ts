const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

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
  getSimulationJob: async (jobId: string) => {
    const res = await fetch(`${API_BASE}/simulations/${jobId}`);
    return res.json();
  },
  // Submit a job (backend returns 202 + a queued job), then poll the status
  // endpoint until the background worker finishes. Resolves to the completed
  // job (status "done" with .result, or "failed"/"canceled"). Callers can keep
  // checking `job.status === "done"` exactly as before — the wait is internal.
  runSimulation: async (
    designId: string,
    type: string,
    solver: string,
    params: any,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ) => {
    const { intervalMs = 400, timeoutMs = 120000 } = opts;
    const submitRes = await fetch(`${API_BASE}/designs/${designId}/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, solver, params }),
    });
    if (!submitRes.ok) throw new Error(`Simulation submit failed (${submitRes.status})`);
    let job = await submitRes.json();
    if (!job?.id) throw new Error(job?.detail || "Simulation submit failed");
    const deadline = Date.now() + timeoutMs;
    while (job.status === "queued" || job.status === "running") {
      if (Date.now() > deadline) throw new Error("Simulation timed out");
      await new Promise((r) => setTimeout(r, intervalMs));
      const res = await fetch(`${API_BASE}/simulations/${job.id}`);
      if (!res.ok) throw new Error(`Simulation status check failed (${res.status})`);
      job = await res.json();
    }
    return job;
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
  getExportFormats: async () => {
    const res = await fetch(`${API_BASE}/export/formats`);
    return res.json();
  },
  downloadDesignExport: (designId: string, format: string) => {
    window.open(`${API_BASE}/designs/${designId}/export/${format}`, "_blank");
  },
  downloadSimulationExport: (jobId: string, format: string) => {
    window.open(`${API_BASE}/simulations/${jobId}/export/${format}`, "_blank");
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
  getAiStatus: async () => {
    const res = await fetch(`${API_BASE}/ai/status`);
    return res.json();
  },
  analyzeProjectAI: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "AI analysis failed");
    }
    return res.json();
  },
  aiChat: async (
    messages: { role: string; content: string }[],
    opts?: { page?: string; projectId?: string | null },
  ) => {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, page: opts?.page, project_id: opts?.projectId ?? undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Chat failed");
    }
    return res.json();
  },
  /** Streaming chat — calls onDelta(textChunk) as tokens arrive. */
  aiChatStream: async (
    messages: { role: string; content: string }[],
    opts: { page?: string; projectId?: string | null } | undefined,
    onDelta: (chunk: string) => void,
  ) => {
    const res = await fetch(`${API_BASE}/ai/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, page: opts?.page, project_id: opts?.projectId ?? undefined }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Chat failed");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) onDelta(chunk);
    }
  },
};
