import { Link } from "react-router-dom";
import { Logo } from "@/components/common/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Visual Designer", to: "/app/designer" },
      { label: "Code Studio", to: "/app/code" },
      { label: "Simulation", to: "/app/simulation" },
      { label: "Optimization", to: "/app/optimization" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Experiments", to: "/app/experiments" },
      { label: "Collaboration", to: "/app/collaboration" },
      { label: "Dashboard", to: "/app" },
      { label: "Settings", to: "/app/settings" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/" },
      { label: "Research", to: "/" },
      { label: "Careers", to: "/" },
      { label: "Contact", to: "/" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-surface/40">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-subtle">
              The operating system for quantum hardware design. Build, simulate
              and optimize superconducting quantum circuits — all in one place.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-fg-muted transition-colors hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-fg-subtle">
            © 2026 QRIVARA. Built for the quantum era.
          </p>
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
