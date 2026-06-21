import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";

const EXAMPLES = [
  "5-qubit transmon processor at 5 GHz with readout resonators",
  "2-qubit chip with a tunable coupler and Purcell filters",
  "single fluxonium qubit with dispersive readout",
  "4-qubit grid at 4.8 GHz with capacitive couplers",
];

/** Natural-language design generator — type a request, QRIVARA creates the
 *  project, generates + saves the design, and opens it in the Visual Designer. */
export function AIDesignBar() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const fetchProjects = useDataStore((s) => s.fetchProjects);

  const generate = async (text: string) => {
    const p = text.trim();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    setStatus("Designing your device…");
    let projectId: string | null = null; // for rollback if a later step fails
    try {
      const gen = await api.aiGenerateDesign(p);
      setStatus(`Creating project “${gen.project_name}”…`);
      const project = await api.createProject({
        name: gen.project_name,
        description: gen.summary,
        qubits: gen.spec?.n_qubits ?? 1,
      });
      projectId = project.id;
      const designs = await api.getProjectDesigns(project.id);
      const design = designs?.[0];
      if (!design?.id) throw new Error("layout-failed");
      setStatus(`Placing ${gen.n_components} components…`);
      await api.saveDesign(design.id, design.version ?? 1, gen.doc);
      projectId = null; // success — keep the project
      await fetchProjects();
      setActiveProject(project.id, project.name);
      navigate(`/app/designer?id=${design.id}`);
    } catch (e: any) {
      // roll back a half-created project so we never leave an empty one behind
      if (projectId) api.deleteProject(projectId).catch(() => {});
      setError(
        e?.message === "layout-failed"
          ? "Couldn't finish the layout — please try again."
          : e?.message || "Couldn't generate the design — try rephrasing your request.",
      );
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-violet/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Sparkles className="h-4 w-4 text-primary" />
        Describe a device — AI builds it
        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary">AI</span>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">
        Type what you want; QRIVARA creates the project, lays out the components, and opens it in the Visual Designer — ready to simulate.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate(prompt)}
          disabled={loading}
          placeholder="e.g. design a 5-qubit transmon processor at 5 GHz with readout resonators…"
          className="h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-primary/60 focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
          aria-label="Describe the device to design"
        />
        <Button
          onClick={() => generate(prompt)}
          loading={loading}
          disabled={!prompt.trim()}
          icon={loading ? undefined : <Wand2 className="h-4 w-4" />}
        >
          {loading ? "Generating…" : "Generate"}
        </Button>
      </div>

      {!loading && !status && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setPrompt(ex); generate(ex); }}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-primary/30 hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {status && (
        <div className="mt-3 flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">{error}</div>
      )}
    </div>
  );
}
