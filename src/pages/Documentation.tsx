import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  Rocket,
  PenTool,
  Activity,
  Zap,
  Grid3x3,
  Target,
  Brain,
  GitBranch,
  Terminal,
  Download,
  Users,
  ArrowRight,
  Check,
  ChevronRight,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
 * QRIVARA — Product Documentation. A self-contained, animated docs page
 * (sticky sidebar + scroll-spy + framed real screenshots), linked from the
 * landing page. Every section maps to a real, shipped capability.
 * ------------------------------------------------------------------------- */

type Section = {
  id: string;
  icon: any;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  image?: string;
  caption?: string;
  steps?: { n: number; title: string; detail: string }[];
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    icon: BookOpen,
    kicker: "Introduction",
    title: "What is QRIVARA?",
    body:
      "QRIVARA is the operating system for superconducting-qubit hardware design — it takes a chip from a drag-and-drop layout to physically accurate results and fab-ready exports, entirely in the browser, on its own open-source electromagnetic + quantum solver stack (no Ansys/COMSOL licence).",
    points: [
      "Our own 3-D electrostatic FEM solver — real capacitance extraction with no licensed dependency.",
      "25+ canonical-physics analyses: Hamiltonian, coherence, gates, readout, QEC, frequency-collision yield.",
      "AI-native and collaborative — generate designs from a sentence, get an AI review, share with your team.",
    ],
    image: "/docs/dashboard.png",
    caption: "The Dashboard — real, computed workspace metrics and a guided getting-started panel.",
  },
  {
    id: "getting-started",
    icon: Rocket,
    kicker: "Quick start",
    title: "The four-step design loop",
    body:
      "Every QRIVARA project follows the same loop. You always know the next step — that's the COMSOL/Ansys pain we set out to remove.",
    points: [],
    steps: [
      { n: 1, title: "Design", detail: "Drag transmons, resonators and couplers onto the Visual Designer canvas (or generate a design from a sentence with AI)." },
      { n: 2, title: "Simulate", detail: "Run any of the 25+ analyses — capacitance, Hamiltonian, coherence, gates, yield — with real computed results." },
      { n: 3, title: "Optimize", detail: "Tune parameters against targets with the multi-objective optimizer, inverse design, and the AI advisor." },
      { n: 4, title: "Export", detail: "Ship GDS-II/DXF for the foundry, or a Qiskit Target digital twin to run circuits against your chip." },
    ],
  },
  {
    id: "designer",
    icon: PenTool,
    kicker: "Build",
    title: "Visual Designer",
    body:
      "An infinite canvas for laying out your chip. Drag components from the library, wire them up, and edit parameters — with a live Code ⇄ Canvas sync so the layout and its Python stay in lockstep.",
    points: [
      "Drag-and-drop transmons, resonators, couplers, feedlines and filters.",
      "Autosave, full undo/redo history, and one-click GDS export.",
      "Live two-way sync with Code Studio — edit either side, the other follows.",
    ],
    image: "/docs/designer.png",
    caption: "The Visual Designer canvas with the component palette and parameter inspector.",
  },
  {
    id: "simulation",
    icon: Activity,
    kicker: "Analyze",
    title: "Simulation engine",
    body:
      "25+ real analyses, grouped by Layout, Modes & RF, Quantum and Performance. Every number is computed from first principles and validated against the canonical literature (Koch 2007, Krantz 2019, Fowler 2012).",
    points: [
      "Capacitance (2-D/3-D FEM), Hamiltonian/LOM, EPR quantization, eigenmodes.",
      "Coherence budget — T₁ (dielectric/Purcell/quasiparticle) and T₂ (photon-shot + flux 1/f).",
      "Dispersive readout, ZZ crosstalk, surface-code QEC, kinetic inductance.",
    ],
    image: "/docs/simulation.png",
    caption: "Decoherence analysis — the full multi-channel T₁/T₂ budget for the design.",
  },
  {
    id: "gates",
    icon: Zap,
    kicker: "Quantum control",
    title: "Two-qubit gates — DRAG-calibrated",
    body:
      "Time-domain gate simulation by genuine Schrödinger propagation. The cross-resonance gate is DRAG-calibrated (two-tone echoed CR, QuTiP) to ~99% — matching real-hardware practice — and an honest on-chip estimate folds in the design's own T₁/T₂.",
    points: [
      "CZ, iSWAP and cross-resonance with leakage-aware average gate fidelity.",
      "Closed-loop pulse calibration: CR drive + cancellation tone + DRAG + echo.",
      "On-chip estimate combines the coherent-control fidelity with real T₁/T₂.",
    ],
    image: "/docs/gates.png",
    caption: "The DRAG-calibrated cross-resonance gate, with the live pulse-calibration panel.",
  },
  {
    id: "fem",
    icon: Grid3x3,
    kicker: "The moat",
    title: "EM field solver",
    body:
      "Our own 3-D electrostatic FEM solver — the single most expensive, licence-locked piece of the quantum-design stack, replaced with validated open-source code. It solves ∇·(ε∇φ)=0 on an edge-conforming grid and extracts the Maxwell capacitance matrix in absolute femtofarads.",
    points: [
      "Resolves the substrate↔vacuum dielectric interface; no empirical fudge factor.",
      "Grid-converged to ±0.4%, validated against the analytic parallel-plate result.",
      "Visible: the solved potential field, mesh, convergence error and matrix.",
    ],
    image: "/docs/fem.png",
    caption: "The Field Solver — the actual solved electrostatic potential and capacitance matrix.",
  },
  {
    id: "optimization",
    icon: Target,
    kicker: "Tune",
    title: "Optimization engine",
    body:
      "Goal-driven, multi-objective parameter tuning. Set targets, watch the optimizer converge, and read off the design-derived objectives, tunable parameters and physics error budget — all computed from the selected design.",
    points: [
      "Nelder-Mead multi-objective optimizer with a live gate-speed-vs-ZZ Pareto front.",
      "Monte-Carlo yield with per-parameter sensitivity, and exact closed-form inverse design.",
      "Real objectives / parameters / error-budget panels tied to your design.",
    ],
    image: "/docs/optimization.png",
    caption: "Objectives vs goals, tunable parameters and the Pareto front — all from the design.",
  },
  {
    id: "advisor",
    icon: Brain,
    kicker: "AI",
    title: "AI design advisor",
    body:
      "An AI review of your design's reports — strengths, what's lacking, and prioritized recommendations. Uses an LLM when configured, and a physics-derived rule-based engine otherwise, so it always works.",
    points: [
      "Reads the real reports (coherence, yield, DRC, coupling) and flags the gaps.",
      "Prioritized, actionable recommendations with expected impact.",
      "Grounded in your project data — never generic boilerplate.",
    ],
    image: "/docs/advisor.png",
    caption: "The AI advisor flagging a low-T₁, high-ZZ, low-yield design with concrete fixes.",
  },
  {
    id: "results",
    icon: GitBranch,
    kicker: "Track",
    title: "Results & version history",
    body:
      "Capture snapshots of a design and watch it evolve. The Results and Experiments pages chart real frequency and 2Q-fidelity across versions, and let you compare any two snapshots.",
    points: [
      "Real design snapshots with captured frequency + coherence-limited fidelity.",
      "Frequency-by-version and fidelity-by-version evolution charts.",
      "Side-by-side snapshot comparison and a metrics summary.",
    ],
    image: "/docs/experiments.png",
    caption: "Experiment Intelligence — real version history and design-evolution charts.",
  },
  {
    id: "code-studio",
    icon: Terminal,
    kicker: "Code",
    title: "Code Studio — a real IDE",
    body:
      "A full in-browser IDE: a Monaco editor, a VS Code-style file/folder workspace, and a Run button that executes Python server-side and streams the real output. Design scripts also round-trip onto the canvas.",
    points: [
      "Create, rename and delete files & folders — your workspace persists.",
      "Run scripts and see real stdout/stderr (NumPy, SciPy, Qiskit available).",
      "Edit a design script and it syncs straight back to the Visual Designer.",
    ],
    image: "/docs/codestudio.png",
    caption: "Code Studio running a design script — real output in the integrated terminal.",
  },
  {
    id: "export",
    icon: Download,
    kicker: "Ship",
    title: "Export & Qiskit digital twin",
    body:
      "Take your design to the foundry or to the cloud. Export GDS-II, DXF, DRC, SPICE and Touchstone — or a Qiskit Target that turns your chip into a digital twin you can transpile circuits against.",
    points: [
      "Fab-ready GDS-II / DXF, DRC reports, SPICE netlists and Touchstone S-parameters.",
      "Qiskit Target export: per-qubit frequencies/coherence, gate errors and coupling map.",
      "Runnable Python snippet — transpile a circuit onto your designed chip in seconds.",
    ],
    image: "/docs/qiskit.png",
    caption: "Export to Qiskit — the chip as a transpilable Target, with a copy-paste snippet.",
  },
  {
    id: "collaboration",
    icon: Users,
    kicker: "Together",
    title: "Collaboration & projects",
    body:
      "Quantum hardware is a team sport. Share projects with role-based permissions, organize them into folders, bookmark favorites, and work with teams, comments and presence — Figma for quantum chips.",
    points: [
      "Project sharing with viewer/editor/owner roles, plus teams.",
      "Bookmarks, folders, messaging, comments, presence and notifications.",
      "Everything scoped per user — your data stays yours.",
    ],
    image: "/docs/projects.png",
    caption: "Projects — real folders, bookmarks and sharing across your workspace.",
  },
];

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
};

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.008 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-pop"
    >
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2/70 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-error/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-3 truncate rounded-md bg-bg-deep/40 px-2 py-0.5 font-mono text-2xs text-fg-subtle">
          app.qrivara.io
        </span>
      </div>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </motion.div>
  );
}

export default function Documentation() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = refs.current[s.id];
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const jump = (id: string) =>
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-dvh bg-bg text-fg">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              QRIVARA <span className="text-fg-subtle">Docs</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="hidden text-sm font-medium text-fg-subtle transition-colors hover:text-fg sm:block">
              ← Home
            </Link>
            <Link
              to="/app"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-bg-deep transition-transform hover:scale-[1.03]"
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_120%_at_50%_-10%,rgb(var(--primary)/0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(var(--line)/0.5)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--line)/0.5)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-primary">
              <BookOpen className="h-3 w-3" /> Documentation
            </span>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Everything QRIVARA can do — <span className="text-primary">end to end</span>.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-fg-muted">
              A guided tour of the platform: design, simulate, optimize, and ship superconducting
              quantum chips in the browser. Every feature below is real and shipping today.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {SECTIONS.slice(0, 7).map((s) => (
                <button
                  key={s.id}
                  onClick={() => jump(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <s.icon className="h-3.5 w-3.5 text-primary" /> {s.title.split("—")[0].trim()}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Body: sidebar + content */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-0.5">
            <p className="px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">On this page</p>
            {SECTIONS.map((s) => {
              const on = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => jump(s.id)}
                  className={cnx(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    on ? "bg-primary/12 font-semibold text-primary" : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <s.icon className={cnx("h-4 w-4 shrink-0", on ? "text-primary" : "text-fg-subtle")} />
                  <span className="truncate">{s.title.split("—")[0].trim()}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 space-y-20">
          {SECTIONS.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => { refs.current[s.id] = el; }}
              className="scroll-mt-24"
            >
              <motion.div {...reveal}>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
                    <s.icon className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{s.kicker}</span>
                </div>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h2>
                <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-fg-muted">{s.body}</p>
              </motion.div>

              {/* Steps (getting started) */}
              {s.steps && (
                <motion.div {...reveal} className="mt-6 grid gap-4 sm:grid-cols-2">
                  {s.steps.map((st) => (
                    <div key={st.n} className="rounded-2xl border border-line bg-surface p-5">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
                          {st.n}
                        </span>
                        <h3 className="font-display text-base font-semibold">{st.title}</h3>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{st.detail}</p>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Points + image */}
              {(s.points.length > 0 || s.image) && (
                <div className={cnx("mt-6 grid items-center gap-7", s.image ? "lg:grid-cols-2" : "")}>
                  {s.points.length > 0 && (
                    <motion.ul {...reveal} className={cnx("space-y-3", i % 2 === 1 && s.image ? "lg:order-2" : "")}>
                      {s.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="text-sm leading-relaxed text-fg">{p}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                  {s.image && (
                    <motion.figure {...reveal} className={cnx(i % 2 === 1 ? "lg:order-1" : "")}>
                      <BrowserFrame src={s.image} alt={s.caption || s.title} />
                      {s.caption && (
                        <figcaption className="mt-2.5 text-2xs text-fg-subtle">{s.caption}</figcaption>
                      )}
                    </motion.figure>
                  )}
                </div>
              )}
            </section>
          ))}

          {/* CTA */}
          <motion.div
            {...reveal}
            className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-violet/5 p-8 text-center sm:p-12"
          >
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Ready to design a chip?</h2>
            <p className="mx-auto mt-3 max-w-lg text-fg-muted">
              Open the app and run the full loop — design, simulate, optimize and export — in your browser.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-bg-deep transition-transform hover:scale-[1.03]"
              >
                Open the app <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
              >
                Back to home <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

/** local class-merge (avoids a hard dep on the app's cn in this public page) */
function cnx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
