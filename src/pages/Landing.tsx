import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Play,
  Sparkles,
  MousePointer2,
  Code2,
  Activity,
  GitBranch,
  Workflow,
  Cpu,
  Radio,
  Link2,
  Zap,
  Check,
  X,
  FlaskConical,
  GraduationCap,
  Rocket,
  Landmark,
  Building2,
  RefreshCw,
  ArrowDown,
  Send,
} from "lucide-react";
import { LandingNav } from "@/landing/LandingNav";
import { Footer } from "@/landing/Footer";
import { FlowShowcase } from "@/landing/FlowShowcase";
import { Reveal, Section, SectionTag, SectionHeading } from "@/landing/primitives";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { GlowCard } from "@/components/ui/Card";
import { Field, Input, Textarea, Select } from "@/components/ui/Form";
import { cn } from "@/lib/utils";

export default function Landing() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <LandingNav />

      <main className="overflow-x-clip">
        <Hero onWatchDemo={() => setDemoOpen(true)} />
        <TrustBand />
        <Problem />
        <Solution />
        <HowItWorks />
        <Features />
        <HowToUse />
        <WhyQrivara />
        <TargetUsers />
        <Vision />
        <FinalCTA onRequestDemo={() => setRequestOpen(true)} />
      </main>

      <Footer />

      {/* Watch demo modal */}
      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="The QRIVARA flow"
        description="Drag → Generate → Simulate → Results → Optimize."
        size="xl"
      >
        <FlowShowcase />
      </Modal>

      {/* Request demo modal */}
      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request a demo"
        description="Tell us about your team and we'll be in touch."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button icon={<Send className="h-4 w-4" />} onClick={() => setRequestOpen(false)}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input placeholder="Jane Researcher" />
            </Field>
            <Field label="Work email">
              <Input type="email" placeholder="jane@lab.edu" />
            </Field>
          </div>
          <Field label="Organization type">
            <Select defaultValue="university">
              <option value="university">University / Lab</option>
              <option value="national">National Laboratory</option>
              <option value="startup">Quantum Startup</option>
              <option value="company">Hardware Company</option>
            </Select>
          </Field>
          <Field label="What are you building?">
            <Textarea rows={3} placeholder="A 17-qubit heavy-hex processor…" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ================================ HERO ==================================== */
function Hero({ onWatchDemo }: { onWatchDemo: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 pb-12 pt-28 sm:px-8 sm:pt-36">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[44rem] w-[80rem] max-w-[140vw] -translate-x-1/2 rounded-full bg-primary/[0.10] blur-[130px]" />
        <div className="absolute right-[10%] top-[20%] h-[24rem] w-[24rem] rounded-full bg-violet/[0.08] blur-[120px]" />
        <div className="absolute left-[8%] top-[30%] h-[20rem] w-[20rem] rounded-full bg-cyan/[0.06] blur-[110px]" />
        <div className="absolute inset-0 bg-grid-dark [background-size:42px_42px] [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
      </div>

      {/* Floating qubits */}
      {[
        { l: "12%", t: "26%", d: 0, c: "bg-primary" },
        { l: "85%", t: "32%", d: 1.2, c: "bg-cyan" },
        { l: "22%", t: "62%", d: 0.6, c: "bg-violet" },
        { l: "78%", t: "68%", d: 1.8, c: "bg-success" },
      ].map((q, i) => (
        <span
          key={i}
          className="pointer-events-none absolute hidden lg:block"
          style={{ left: q.l, top: q.t }}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className={cn("absolute inline-flex h-full w-full animate-pulse-ring rounded-full", q.c)} style={{ animationDelay: `${q.d}s` }} />
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", q.c)} />
          </span>
        </span>
      ))}

      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center"
        >
          <SectionTag icon={<Sparkles className="h-3.5 w-3.5" />}>
            The operating system for quantum hardware design
          </SectionTag>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl"
        >
          Design Quantum Hardware at the{" "}
          <span className="gradient-text">Speed of Software</span>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg"
        >
          QRIVARA is the unified platform for designing, simulating, optimizing,
          and managing superconducting quantum circuits. Build visually, code
          when needed, run simulations instantly, and accelerate quantum hardware
          development from concept to experiment.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link to="/app" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto" iconRight={<ArrowRight className="h-4 w-4" />}>
              Start Building
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            icon={<Play className="h-4 w-4" />}
            onClick={onWatchDemo}
          >
            Watch Demo
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="mt-6 text-sm text-fg-subtle"
        >
          Built for researchers, engineers, universities, and quantum computing teams.
        </motion.p>
      </div>

      {/* Hero animation */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-16 max-w-4xl"
      >
        <FlowShowcase />
      </motion.div>
    </section>
  );
}

/* ============================== TRUST BAND ================================ */
function TrustBand() {
  const items = [
    "Quantum Researchers",
    "Universities",
    "National Laboratories",
    "Quantum Startups",
    "RF / Microwave Engineers",
  ];
  return (
    <div className="border-y border-line bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-6 sm:px-8">
        {items.map((i) => (
          <span key={i} className="text-sm font-medium text-fg-subtle">
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

/* =============================== PROBLEM ================================== */
function Problem() {
  const loop = [
    "Writing code",
    "Generating layouts",
    "Running simulations",
    "Analyzing results",
    "Tracking changes manually",
  ];
  return (
    <Section id="problem">
      <SectionHeading
        center
        tag={<SectionTag>The problem</SectionTag>}
        title="Quantum hardware development is broken"
        subtitle="Today's quantum hardware workflow is fragmented. Researchers spend countless hours switching between design tools, Python scripts, simulation software, spreadsheets, and experiment logs."
      />

      <Reveal className="mx-auto mt-14 max-w-3xl">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <p className="mb-5 text-center text-sm font-medium uppercase tracking-wider text-fg-subtle">
            Every design iteration requires
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {loop.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/[0.07] px-3.5 py-2 text-sm font-medium text-fg">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-warning/15 text-2xs font-bold text-warning">
                    {i + 1}
                  </span>
                  {step}
                </div>
                {i < loop.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-error">
            <RefreshCw className="h-4 w-4" />
            …and repeating the process again
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-10 max-w-2xl text-center">
        <p className="text-lg font-medium text-fg">
          Innovation slows down because the workflow slows down.
        </p>
        <p className="mt-2 text-base text-fg-muted">
          Quantum engineering deserves better tools.
        </p>
      </Reveal>
    </Section>
  );
}

/* =============================== SOLUTION ================================= */
function Solution() {
  const points = [
    { icon: Workflow, text: "Design visually" },
    { icon: Code2, text: "Write code when needed" },
    { icon: Activity, text: "Run simulations instantly" },
    { icon: Sparkles, text: "Optimize automatically" },
    { icon: GitBranch, text: "Track every experiment" },
    { icon: Cpu, text: "Collaborate with your team" },
  ];
  return (
    <div className="relative border-y border-line bg-surface/30">
      <Section>
        <SectionHeading
          center
          tag={<SectionTag icon={<Check className="h-3.5 w-3.5" />}>The solution</SectionTag>}
          title={<>One platform. <span className="gradient-text">Entire quantum workflow.</span></>}
          subtitle="QRIVARA brings every stage of quantum hardware development into a single environment."
        />

        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {points.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.text} delay={i * 0.05}>
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                    <Icon className="h-[1.1rem] w-[1.1rem]" />
                  </div>
                  <span className="text-sm font-medium text-fg">{p.text}</span>
                  <Check className="ml-auto h-4 w-4 text-success" />
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.15} className="mx-auto mt-10 max-w-2xl text-center">
          <p className="text-base text-fg-muted">
            From the first qubit to the final architecture,{" "}
            <span className="font-medium text-fg">everything lives in one place.</span>
          </p>
        </Reveal>
      </Section>
    </div>
  );
}

/* ============================= HOW IT WORKS ============================== */
/* Guided getting-started: every step says exactly WHAT to do and links straight
   into the app — so a first-time user is never lost (the COMSOL pain point). */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: MousePointer2,
      color: "primary" as const,
      title: "Design your chip",
      text: "Drag transmons, resonators, couplers and feedlines onto the canvas — or describe it in plain English and let the AI assistant build the first draft for you.",
      do: "Open the Visual Designer and drop your first qubit (or click “Generate with AI”).",
      to: "/app/designer",
      cta: "Open the Designer",
      list: ["Transmons", "Resonators", "Couplers", "Readout", "AI generate"],
    },
    {
      n: "02",
      icon: Activity,
      color: "cyan" as const,
      title: "Simulate (real physics)",
      text: "Run capacitance extraction on our own 3-D field solver, then the quantum analyses — Hamiltonian, T1/T2 coherence, 2-qubit gate fidelity, readout, frequency collisions. No Ansys licence required.",
      do: "Pick a project, choose an analysis tab, and press Run. Results appear in seconds.",
      to: "/app/simulation",
      cta: "Open Simulation",
      list: ["Field solver", "T1 / T2", "2-qubit gates", "Yield"],
    },
    {
      n: "03",
      icon: Sparkles,
      color: "violet" as const,
      title: "Optimize to targets",
      text: "Set your target frequency, anharmonicity and coupling. QRIVARA runs a real multi-objective optimizer and a Monte-Carlo yield study, and recommends parameters.",
      do: "Enter your targets and press Start — watch the convergence and Pareto front update live.",
      to: "/app/optimization",
      cta: "Open Optimization",
      list: ["Multi-objective", "Pareto", "Yield MC", "Inverse design"],
    },
    {
      n: "04",
      icon: GitBranch,
      color: "success" as const,
      title: "Export & collaborate",
      text: "Export fab-ready GDS-II / DXF / SPICE / Touchstone, or a Qiskit “digital twin” of your chip. Share with your team, leave comments, and track every revision.",
      do: "Open Results, export your format, and invite a teammate to review.",
      to: "/app/results",
      cta: "Open Results",
      list: ["GDS-II", "Qiskit target", "Share", "Comments"],
    },
  ];
  const chip: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    cyan: "bg-cyan/12 text-cyan",
    violet: "bg-violet/12 text-violet",
    success: "bg-success/12 text-success",
  };
  const linkTone: Record<string, string> = {
    primary: "text-primary hover:text-primary/80",
    cyan: "text-cyan hover:text-cyan/80",
    violet: "text-violet hover:text-violet/80",
    success: "text-success hover:text-success/80",
  };
  return (
    <Section id="how">
      <SectionHeading
        center
        tag={<SectionTag>Getting started</SectionTag>}
        title="New here? Follow these four steps"
        subtitle="QRIVARA guides you end-to-end — each step tells you exactly what to do and drops you straight into the right workspace."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.n} delay={i * 0.07}>
              <GlowCard className="flex h-full flex-col p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <div className={cn("grid h-11 w-11 place-items-center rounded-xl", chip[s.color])}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-display text-3xl font-semibold text-line-strong">{s.n}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.text}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.list.map((l) => (
                    <span key={l} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted">
                      {l}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="text-xs text-fg-muted"><span className="font-semibold text-fg">Do this:</span> {s.do}</p>
                </div>
                <Link to={s.to} className={cn("mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors", linkTone[s.color])}>
                  {s.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </GlowCard>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

/* =============================== FEATURES ================================= */
function Features() {
  return (
    <div className="relative border-y border-line bg-surface/30">
      <Section id="features">
        <SectionHeading
          center
          tag={<SectionTag icon={<Sparkles className="h-3.5 w-3.5" />}>Capabilities</SectionTag>}
          title="Everything quantum hardware teams need"
          subtitle="A complete toolchain — visual design, code, simulation, optimization and experiment tracking — working as one."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {/* Own EM field solver — wide, the moat */}
          <Reveal className="md:col-span-2">
            <GlowCard className="flex h-full flex-col justify-between overflow-hidden p-6 sm:p-8">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">
                  Our own 3-D field solver — no Ansys licence
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
                  A genuine 3-D electrostatic FEM solver (∇·(ε∇φ)=0, edge-conforming grid)
                  extracts the Maxwell capacitance matrix in absolute femtofarads —
                  grid-converged to ±0.4%, validated against analytic results. See the
                  solved field, mesh and convergence right in the app.
                </p>
              </div>
              <MiniCanvas />
            </GlowCard>
          </Reveal>

          <Reveal delay={0.05}>
            <FeatureCard
              icon={Activity}
              color="cyan"
              title="25+ physics-correct analyses"
              text="Exact transmon/fluxonium spectra, T1/T2 coherence, dispersive readout, ZZ crosstalk, surface-code QEC — every analysis validated against the canonical literature (Koch, Krantz, Fowler) and benchmarked vs scqubits."
            />
          </Reveal>

          <Reveal delay={0.05}>
            <FeatureCard
              icon={Zap}
              color="violet"
              title="Time-domain 2-qubit gates"
              text="Real Schrödinger-equation simulation of CZ / iSWAP / cross-resonance gates with leakage-aware fidelity — not a coherence estimate, the actual pulse dynamics."
            />
          </Reveal>

          <Reveal delay={0.1}>
            <FeatureCard
              icon={GitBranch}
              color="success"
              title="Frequency-collision yield maps"
              text="The manufacturability question for fixed-frequency chips — the IBM heavy-hex collision model with a Monte-Carlo yield map, so you see which qubits collide before tape-out."
            />
          </Reveal>

          <Reveal delay={0.1}>
            <FeatureCard
              icon={Sparkles}
              color="primary"
              title="Optimization + AI assistant"
              text="Multi-objective optimizer, inverse design and Monte-Carlo yield — plus an AI assistant that generates designs from a sentence and reviews your reports."
            />
          </Reveal>

          <Reveal delay={0.1}>
            <FeatureCard
              icon={Code2}
              color="cyan"
              title="Fab exports + Qiskit twin"
              text="One click to GDS-II, DXF, SPICE and Touchstone — or export a Qiskit Target “digital twin” of your chip to run circuits against it. Real-time collaboration, sharing and comments built in."
            />
          </Reveal>
        </div>
      </Section>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  color,
  title,
  text,
}: {
  icon: typeof Code2;
  color: "primary" | "cyan" | "violet" | "success";
  title: string;
  text: string;
}) {
  const chip: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    cyan: "bg-cyan/12 text-cyan",
    violet: "bg-violet/12 text-violet",
    success: "bg-success/12 text-success",
  };
  return (
    <GlowCard className="h-full p-6">
      <div className={cn("grid h-11 w-11 place-items-center rounded-xl", chip[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
    </GlowCard>
  );
}

function MiniCanvas() {
  const nodes = [
    { icon: Cpu, label: "Q1", c: "bg-primary/12 text-primary", x: "left-2 top-2" },
    { icon: Link2, label: "C1", c: "bg-violet/12 text-violet", x: "left-1/2 top-8 -translate-x-1/2" },
    { icon: Cpu, label: "Q2", c: "bg-primary/12 text-primary", x: "left-2 bottom-3" },
    { icon: Radio, label: "R1", c: "bg-cyan/12 text-cyan", x: "right-3 top-3" },
    { icon: Zap, label: "Z1", c: "bg-warning/12 text-warning", x: "right-4 bottom-4" },
  ];
  return (
    <div className="relative mt-6 h-40 overflow-hidden rounded-xl border border-line bg-bg-deep/40 bg-dots">
      {nodes.map((n) => {
        const Icon = n.icon;
        return (
          <div
            key={n.label}
            className={cn("absolute flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-card", n.x)}
          >
            <span className={cn("grid h-5 w-5 place-items-center rounded-md", n.c)}>
              <Icon className="h-3 w-3" />
            </span>
            <span className="text-2xs font-semibold text-fg">{n.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================ HOW-TO / DOCS ============================== */
/* Integrated, read-on-the-home-page how-to guide — concrete recipes so a new
   user knows the exact clicks for each common task. */
function HowToUse() {
  const guides = [
    {
      icon: MousePointer2, color: "primary" as const, title: "Create your first qubit",
      steps: ["Open the Visual Designer", "Drag a Transmon onto the canvas (or click “Generate with AI”)", "Set its target frequency & anharmonicity in the inspector"],
    },
    {
      icon: Cpu, color: "cyan" as const, title: "Extract capacitance (field solver)",
      steps: ["Go to Simulation → Layout → Field Solver", "Pick your project and press Run", "Read the solved potential map, ε_eff and the Maxwell matrix"],
    },
    {
      icon: Zap, color: "violet" as const, title: "Check 2-qubit gate fidelity",
      steps: ["Simulation → Performance → 2Q Gate (Time-Domain)", "Choose CZ, iSWAP or Cross-Resonance and Run", "Inspect the population dynamics, fidelity and leakage"],
    },
    {
      icon: GitBranch, color: "success" as const, title: "Find frequency collisions",
      steps: ["Simulation → Performance → Freq. Collisions / Yield", "Set the lattice size and fab precision σ", "Read the yield curve and the collision heat-map"],
    },
    {
      icon: Code2, color: "cyan" as const, title: "Export for fabrication",
      steps: ["Open Results (or the Designer toolbar)", "Choose GDS-II, DXF, SPICE or Touchstone", "Or grab a Qiskit Target to run circuits on your chip"],
    },
    {
      icon: Sparkles, color: "primary" as const, title: "Use the AI assistant",
      steps: ["Open the assistant from any page", "Describe the chip you want in plain English", "Review the generated design and the AI’s recommendations"],
    },
  ];
  const chip: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    cyan: "bg-cyan/12 text-cyan",
    violet: "bg-violet/12 text-violet",
    success: "bg-success/12 text-success",
  };
  return (
    <Section id="docs">
      <SectionHeading
        center
        tag={<SectionTag icon={<MousePointer2 className="h-3.5 w-3.5" />}>How to use it</SectionTag>}
        title="Quick recipes — know exactly what to click"
        subtitle="No 400-page manual. Each common task is three clicks; here is the exact path for the ones you’ll use most."
      />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g, i) => {
          const Icon = g.icon;
          return (
            <Reveal key={g.title} delay={i * 0.05}>
              <GlowCard className="h-full p-6">
                <div className="flex items-center gap-3">
                  <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", chip[g.color])}>
                    <Icon className="h-[1.1rem] w-[1.1rem]" />
                  </div>
                  <h3 className="font-display text-base font-semibold tracking-tight text-fg">{g.title}</h3>
                </div>
                <ol className="mt-4 space-y-2.5">
                  {g.steps.map((s, k) => (
                    <li key={k} className="flex items-start gap-2.5 text-sm text-fg-muted">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-surface-2 text-2xs font-bold text-fg-subtle">
                        {k + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </GlowCard>
            </Reveal>
          );
        })}
      </div>
      <Reveal delay={0.15} className="mx-auto mt-10 max-w-xl text-center">
        <Link to="/app">
          <Button size="lg" iconRight={<ArrowRight className="h-4 w-4" />}>Start with step 1 — open the Designer</Button>
        </Link>
      </Reveal>
    </Section>
  );
}

/* ============================== WHY QRIVARA =============================== */
function WhyQrivara() {
  return (
    <Section>
      <SectionHeading
        center
        tag={<SectionTag>Why QRIVARA</SectionTag>}
        title="Built specifically for quantum hardware"
        subtitle="Traditional engineering software was not built for quantum systems. QRIVARA was built from the ground up for quantum hardware teams."
      />

      <Reveal className="mx-auto mt-14 max-w-4xl">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
            <h3 className="font-display text-base font-semibold text-fg-muted">
              General-purpose tools
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "General CAD tools cannot understand quantum circuits",
                "Simulation tools cannot manage the entire workflow",
                "Spreadsheets and scripts scattered across machines",
                "Knowledge lost between iterations",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-fg-muted">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-error/12 text-error">
                    <X className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.06] p-6 shadow-glow sm:p-7">
            <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
            <h3 className="relative font-display text-base font-semibold text-primary">
              QRIVARA
            </h3>
            <ul className="relative mt-4 space-y-3">
              {[
                "Understands transmons, resonators and couplers natively",
                "Manages the full design → simulate → optimize loop",
                "One synchronized source of truth for your team",
                "Every experiment and revision preserved automatically",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-fg">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* ============================= TARGET USERS ============================== */
function TargetUsers() {
  const users = [
    { icon: FlaskConical, color: "primary", title: "Researchers", text: "Accelerate experimentation." },
    { icon: GraduationCap, color: "cyan", title: "Universities", text: "Enable students and laboratories." },
    { icon: Rocket, color: "violet", title: "Quantum Startups", text: "Move faster with smaller teams." },
    { icon: Landmark, color: "success", title: "National Laboratories", text: "Standardize workflows and knowledge." },
    { icon: Building2, color: "warning", title: "Quantum Hardware Companies", text: "Scale engineering operations efficiently." },
  ] as const;
  const chip: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    cyan: "bg-cyan/12 text-cyan",
    violet: "bg-violet/12 text-violet",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
  };
  return (
    <div className="relative border-y border-line bg-surface/30">
      <Section>
        <SectionHeading
          center
          tag={<SectionTag>Who it's for</SectionTag>}
          title="Made for the people building quantum"
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((u, i) => {
            const Icon = u.icon;
            return (
              <Reveal key={u.title} delay={i * 0.06}>
                <GlowCard className="h-full p-6">
                  <div className={cn("grid h-11 w-11 place-items-center rounded-xl", chip[u.color])}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                    {u.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{u.text}</p>
                </GlowCard>
              </Reveal>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/* =============================== VISION ================================== */
function Vision() {
  const analogies = [
    { who: "Software engineers", have: "GitHub" },
    { who: "Designers", have: "Figma" },
    { who: "Product teams", have: "Linear" },
  ];
  return (
    <Section id="vision">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal className="flex justify-center">
          <SectionTag icon={<Sparkles className="h-3.5 w-3.5" />}>The vision</SectionTag>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl">
            The future of quantum hardware engineering
          </h2>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-2xl gap-3 sm:grid-cols-3">
          {analogies.map((a, i) => (
            <Reveal key={a.have} delay={i * 0.08}>
              <div className="rounded-xl border border-line bg-surface p-5">
                <p className="text-sm text-fg-subtle">{a.who} have</p>
                <p className="mt-1 font-display text-xl font-semibold text-fg">{a.have}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-10 flex justify-center">
            <ArrowDown className="h-6 w-6 animate-bounce text-fg-subtle" />
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-8 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Quantum hardware engineers deserve their own platform.
          </p>
          <p className="mt-4 text-lg text-fg-muted">
            QRIVARA is building the{" "}
            <span className="gradient-text font-semibold">operating system</span>{" "}
            for quantum hardware development.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

/* ============================== FINAL CTA ================================ */
function FinalCTA({ onRequestDemo }: { onRequestDemo: () => void }) {
  return (
    <Section>
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-surface px-6 py-16 text-center shadow-pop sm:px-12 sm:py-20">
          {/* glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-[30rem] w-[50rem] max-w-[120vw] -translate-x-1/2 rounded-full bg-primary/[0.14] blur-[110px]" />
            <div className="absolute inset-0 bg-grid-dark [background-size:38px_38px] [mask-image:radial-gradient(70%_70%_at_50%_40%,black,transparent)]" />
          </div>

          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl md:text-5xl">
              Build the next generation of{" "}
              <span className="gradient-text">quantum technology</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-fg-muted sm:text-lg">
              Stop fighting fragmented workflows. Start building quantum hardware
              faster.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/app" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto" iconRight={<ArrowRight className="h-4 w-4" />}>
                  Start Building
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={onRequestDemo}
              >
                Request Demo
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
