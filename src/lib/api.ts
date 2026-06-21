const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/* --------------------------------------------------------------------------
 * Dev multi-user ("Act as") — the backend resolves the current user from the
 * X-Dev-User-Id header while running without Supabase JWT. The switcher writes
 * the chosen user id here; every request carries it so sharing/visibility rules
 * are exercised as that user. Swapped for a real bearer token in production.
 * ------------------------------------------------------------------------ */
const DEV_USER_KEY = "qrivara-dev-user";

export function getDevUserId(): string | null {
  try {
    return localStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
}

export function setDevUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(DEV_USER_KEY, id);
    else localStorage.removeItem(DEV_USER_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const id = getDevUserId();
  return id ? { "X-Dev-User-Id": id } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

async function getJSON(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function postJSON(path: string, body?: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// Auth-aware file download: fetch with the dev/bearer header, then save the blob.
async function downloadBlob(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || `Download failed (${res.status})`);
  }
  // Honor a server-provided filename when present.
  const disp = res.headers.get("Content-Disposition");
  const match = disp?.match(/filename="?([^"]+)"?/);
  const name = match?.[1] || filename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  baseUrl: API_BASE,
  getProjects: async () => {
    const res = await fetch(`${API_BASE}/projects/`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
  },
  createProject: async (data: any) => {
    const res = await fetch(`${API_BASE}/projects/`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "Failed to create project");
    }
    return res.json();
  },
  deleteProject: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  },
  getProjectDesigns: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/designs`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load designs");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },
  getDesign: async (designId: string) => {
    const res = await fetch(`${API_BASE}/designs/${designId}`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  saveDesign: async (designId: string, version: number, doc: any) => {
    const res = await fetch(`${API_BASE}/designs/${designId}/doc`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ version, doc }),
    });
    if (!res.ok) throw new Error("Conflict or error saving design");
    return res.json();
  },
  getSimulationJob: async (jobId: string) => {
    const res = await fetch(`${API_BASE}/simulations/${jobId}`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  // Natural-language -> a complete, simulatable design doc {nodes, edges} +
  // a suggested project name + summary. The caller creates the project, saves
  // the doc, and opens it in the Visual Designer.
  aiGenerateDesign: async (prompt: string) => {
    const res = await fetch(`${API_BASE}/ai/generate-design`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || "Design generation failed");
    }
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
      headers: jsonHeaders(),
      body: JSON.stringify({ type, solver, params }),
    });
    if (!submitRes.ok) throw new Error(`Simulation submit failed (${submitRes.status})`);
    let job = await submitRes.json();
    if (!job?.id) throw new Error(job?.detail || "Simulation submit failed");
    const deadline = Date.now() + timeoutMs;
    while (job.status === "queued" || job.status === "running") {
      if (Date.now() > deadline) throw new Error("Simulation timed out");
      await new Promise((r) => setTimeout(r, intervalMs));
      const res = await fetch(`${API_BASE}/simulations/${job.id}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Simulation status check failed (${res.status})`);
      job = await res.json();
    }
    return job;
  },
  getComponents: async () => {
    const res = await fetch(`${API_BASE}/components/`, { headers: authHeaders() });
    return res.json();
  },
  // Material catalog (conductors, substrates, loss interfaces, DRC rules) — real backend.
  getMaterials: async () => {
    const res = await fetch(`${API_BASE}/materials`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load materials");
    return res.json();
  },
  getProjectResults: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/results/project/${projectId}`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  // Real, computed workspace stats for the Dashboard (scoped to visible projects).
  getDashboard: (days = 14) => getJSON(`/dashboard?days=${days}`),
  generateCode: async (doc: any) => {
    const res = await fetch(`${API_BASE}/codegen`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ doc }),
    });
    return res.json();
  },
  executeCode: async (code: string) => {
    const res = await fetch(`${API_BASE}/codegen/execute`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error("Code execution failed");
    return res.json();
  },
  startOptimization: async (params: any) => {
    const res = await fetch(`${API_BASE}/optimization/start`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        method: params.method || "bayesian",
        objectives: params.objectives || ["frequency"],
        params: params,
      }),
    });
    return res.json();
  },
  getOptimizationResults: async (runId: string) => {
    const res = await fetch(`${API_BASE}/optimization/${runId}/results`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  runInverseDesign: async (targetFreq: number, targetAnharm: number) => {
    const res = await fetch(`${API_BASE}/optimization/inverse`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ target_frequency: targetFreq, target_anharmonicity: targetAnharm }),
    });
    return res.json();
  },
  getEjEcRegion: async () => {
    const res = await fetch(`${API_BASE}/optimization/region/ej-ec`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  getExportFormats: async () => {
    const res = await fetch(`${API_BASE}/export/formats`, { headers: authHeaders() });
    return res.json();
  },
  // Exports are access-gated, so they need the auth header — `window.open` can't
  // send it. Fetch as a blob with auth, then trigger a client-side download.
  downloadDesignExport: (designId: string, format: string) =>
    downloadBlob(`/designs/${designId}/export/${format}`, `${designId}.${format}`),
  // Export the designed chip as a Qiskit Target descriptor ("digital twin"):
  // qubit freq/coherence, gate errors/durations, coupling map — assembled from the
  // design's completed simulation results. Pure JSON (no Qiskit needed server-side).
  getQiskitTarget: (designId: string) => getJSON(`/designs/${designId}/qiskit-target`),
  downloadSimulationExport: (jobId: string, format: string) =>
    downloadBlob(`/simulations/${jobId}/export/${format}`, `${jobId}.${format}`),
  runYield: async (body: any) => {
    const res = await fetch(`${API_BASE}/optimization/yield`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Yield analysis failed");
    return res.json();
  },
  getAiStatus: async () => {
    const res = await fetch(`${API_BASE}/ai/status`, { headers: authHeaders() });
    return res.json();
  },
  analyzeProjectAI: async (projectId: string) => {
    const res = await fetch(`${API_BASE}/ai/analyze`, {
      method: "POST",
      headers: jsonHeaders(),
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
      headers: jsonHeaders(),
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
      headers: jsonHeaders(),
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

  /* ----------------------------------------------------------------------
   * Collaboration module
   * -------------------------------------------------------------------- */
  // Identity / people
  getMe: () => getJSON(`/auth/me`),
  getUsers: (q?: string) => getJSON(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getUser: (userId: string) => getJSON(`/users/${userId}`),
  updateProfile: async (body: {
    name?: string;
    role?: string;
    org?: string;
    headline?: string;
    bio?: string;
    institution?: string;
    discoverable?: boolean;
  }) => {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "Failed to update profile");
    }
    return res.json();
  },

  // Sharing (grants + visibility)
  getGrants: (projectId: string) => getJSON(`/projects/${projectId}/grants`),
  addGrant: async (
    projectId: string,
    body: { user_id?: string; email?: string; role: string },
  ) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/grants`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "Failed to share");
    }
    return res.json();
  },
  updateGrant: async (projectId: string, grantId: string, role: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/grants/${grantId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error("Failed to update role");
    return res.json();
  },
  removeGrant: async (projectId: string, grantId: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/grants/${grantId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  },
  setVisibility: async (projectId: string, visibility: string) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/visibility`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ visibility }),
    });
    if (!res.ok) throw new Error("Failed to update visibility");
    return res.json();
  },
  getSharedWithMe: () => getJSON(`/shared-with-me`),

  // Connections
  getConnections: (status?: string) =>
    getJSON(`/connections${status ? `?status=${status}` : ""}`),
  requestConnection: async (addresseeId: string) => {
    const res = await fetch(`${API_BASE}/connections`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ addressee_id: addresseeId }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || "Failed to send request");
    }
    return res.json();
  },
  acceptConnection: async (id: string) => {
    const res = await fetch(`${API_BASE}/connections/${id}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to accept");
    return res.json();
  },
  declineConnection: async (id: string) => {
    const res = await fetch(`${API_BASE}/connections/${id}/decline`, {
      method: "POST",
      headers: authHeaders(),
    });
    return res.ok;
  },

  // Notifications
  getNotifications: () => getJSON(`/notifications`),
  getUnreadCount: () => getJSON(`/notifications/unread-count`),
  markNotificationRead: async (id: string) => {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: "POST",
      headers: authHeaders(),
    });
    return res.ok;
  },
  markAllNotificationsRead: async () => {
    const res = await fetch(`${API_BASE}/notifications/read-all`, {
      method: "POST",
      headers: authHeaders(),
    });
    return res.ok;
  },

  // Comments & Activity
  getActivity: () => getJSON(`/activity`),
  getComments: () => getJSON(`/comments`),
  addComment: async (body: { target?: string; body: string }) => {
    const res = await fetch(`${API_BASE}/comments`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to add comment");
    return res.json();
  },
  resolveComment: async (commentId: string) => {
    const res = await fetch(`${API_BASE}/comments/${commentId}/resolve`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to resolve comment");
    return res.json();
  },

  /* ----------------------------------------------------------------------
   * Chat (channels, DMs, threads)
   * -------------------------------------------------------------------- */
  getChannels: () => getJSON(`/channels`),
  discoverChannels: () => getJSON(`/channels/discover`),
  createChannel: (body: { name: string; topic?: string; is_private?: boolean; member_ids?: string[] }) =>
    postJSON(`/channels`, body),
  joinChannel: (channelId: string) => postJSON(`/channels/${channelId}/join`),
  leaveChannel: (channelId: string) => postJSON(`/channels/${channelId}/leave`),
  markChannelRead: (channelId: string) => postJSON(`/channels/${channelId}/read`),
  openDm: (userId: string) => postJSON(`/dm/${userId}`),
  getMessages: (channelId: string, opts?: { parentId?: string; after?: string }) => {
    const q = new URLSearchParams();
    if (opts?.parentId) q.set("parent_id", opts.parentId);
    if (opts?.after) q.set("after", opts.after);
    const qs = q.toString();
    return getJSON(`/channels/${channelId}/messages${qs ? `?${qs}` : ""}`);
  },
  postMessage: (channelId: string, body: string, parentId?: string) =>
    postJSON(`/channels/${channelId}/messages`, { body, parent_id: parentId }),

  /* ----------------------------------------------------------------------
   * Teams
   * -------------------------------------------------------------------- */
  getTeams: () => getJSON(`/teams`),
  getTeam: (teamId: string) => getJSON(`/teams/${teamId}`),
  createTeam: (body: { name: string; description?: string }) => postJSON(`/teams`, body),
  addTeamMember: (teamId: string, userId: string, role?: string) =>
    postJSON(`/teams/${teamId}/members`, { user_id: userId, role }),
  removeTeamMember: async (teamId: string, memberId: string) => {
    const res = await fetch(`${API_BASE}/teams/${teamId}/members/${memberId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  },
  deleteTeam: async (teamId: string) => {
    const res = await fetch(`${API_BASE}/teams/${teamId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  },
  // Share a project with a whole team.
  addTeamGrant: (projectId: string, teamId: string, role: string) =>
    postJSON(`/projects/${projectId}/grants`, { team_id: teamId, role }),

  /* Presence heartbeat. */
  presencePing: () => postJSON(`/presence/ping`),
};
