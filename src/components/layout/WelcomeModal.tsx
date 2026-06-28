import { useEffect, useState } from "react";
import { Workflow, Activity, Sparkles, Download, ArrowRight, Rocket } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const SEEN_KEY = "qrivara:welcomed";

const STEPS = [
  { icon: Workflow, title: "Design", body: "Drag components onto the canvas, generate from a prompt, or reconstruct a paper." },
  { icon: Activity, title: "Simulate", body: "Capacitance, T₁/T₂, gate fidelity, yield — ~36 analyses, all real physics." },
  { icon: Sparkles, title: "Optimize", body: "Hit a target frequency & fidelity; explore the Pareto front." },
  { icon: Download, title: "Export", body: "GDS-II, SPICE, a printable datasheet, or a Qiskit digital twin." },
];

/** One-time first-run welcome — orients a brand-new user on the design→export loop,
 *  then gets out of the way (localStorage flag, never shown again). */
export function WelcomeModal({ onCreate, onDemo }: { onCreate: () => void; onDemo: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch { /* private mode — just don't show */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  const choose = (fn: () => void) => { dismiss(); fn(); };

  return (
    <Modal
      open={open}
      onClose={dismiss}
      size="xl"
      title="Welcome to QRIVARA"
      description="The browser-based design studio for superconducting quantum chips. Here's the loop:"
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>Skip for now</Button>
          <Button variant="outline" onClick={() => choose(onDemo)}>Open the demo chip</Button>
          <Button icon={<Rocket className="h-4 w-4" />} onClick={() => choose(onCreate)}>Create your first design</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Icon className="h-[1.05rem] w-[1.05rem]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-2xs text-fg-subtle">0{i + 1}</span>
                  <h4 className="text-sm font-semibold text-fg">{s.title}</h4>
                  {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-fg-subtle" />}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{s.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-2xs text-fg-subtle">
        New here? <span className="text-fg-muted">Open the demo chip</span> to poke around a working 2-qubit design, or
        <span className="text-fg-muted"> create your own</span> — the “Getting started” panel below tracks your progress.
      </p>
    </Modal>
  );
}
