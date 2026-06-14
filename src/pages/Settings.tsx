import { useState } from "react";
import {
  Palette,
  Bell,
  Plug,
  User,
  Shield,
  Check,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Field, Input, Switch } from "@/components/ui/Form";
import { Avatar } from "@/components/ui/Avatar";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: User },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
] as const;

const SOLVERS = [
  { name: "Ansys HFSS", desc: "Full-wave 3D electromagnetic solver", connected: true },
  { name: "Ansys Q3D", desc: "Quasi-static capacitance extraction", connected: true },
  { name: "AWS Palace", desc: "Open-source finite-element EM solver", connected: true },
  { name: "Qiskit Metal", desc: "Quantum device design & analysis", connected: false },
  { name: "scQubits", desc: "Superconducting qubit Hamiltonians", connected: false },
];

export default function Settings() {
  const { theme, setTheme, profile, setProfile } = useAppStore();
  const [section, setSection] =
    useState<(typeof SECTIONS)[number]["id"]>("appearance");
  const [notif, setNotif] = useState({
    simDone: true,
    comments: true,
    reviews: true,
    weekly: false,
  });

  // Account form (controlled draft + save feedback)
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const saveProfile = () => {
    setProfile(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  // Security form feedback
  const [pwSaved, setPwSaved] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, appearance and engineering integrations."
        icon={<Palette className="h-5 w-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section nav */}
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Panels */}
        <div className="space-y-6">
          {section === "appearance" && (
            <Card>
              <CardContent className="space-y-6 pt-5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-fg">
                    Theme
                  </h3>
                  <p className="mt-0.5 text-sm text-fg-subtle">
                    Dark-first, with a professional light mode.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "light", label: "Light", icon: Sun },
                      { id: "system", label: "System", icon: Monitor },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const active =
                        opt.id === theme ||
                        (opt.id === "system" && false);
                      return (
                        <button
                          key={opt.id}
                          onClick={() =>
                            opt.id !== "system" &&
                            setTheme(opt.id as "dark" | "light")
                          }
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all",
                            active
                              ? "border-primary/50 bg-primary/8 ring-2 ring-primary/20"
                              : "border-line bg-surface-2 hover:border-line-strong",
                          )}
                        >
                          {active && (
                            <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-primary text-white">
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            </span>
                          )}
                          <Icon className="h-5 w-5 text-fg-muted" />
                          <span className="text-xs font-medium text-fg">
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-line pt-5">
                  <h3 className="font-display text-sm font-semibold text-fg">
                    Accent color
                  </h3>
                  <p className="mt-0.5 text-sm text-fg-subtle">
                    Deep Quantum Blue is the QRIVARA signature.
                  </p>
                  <div className="mt-4 flex gap-2.5">
                    {[
                      "rgb(var(--primary))",
                      "rgb(var(--cyan))",
                      "rgb(var(--violet))",
                      "rgb(var(--success))",
                      "rgb(var(--warning))",
                    ].map((c, i) => (
                      <button
                        key={c}
                        className={cn(
                          "h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110",
                          i === 0 && "ring-2 ring-primary",
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {section === "account" && (
            <Card>
              <CardContent className="space-y-5 pt-5">
                <div className="flex items-center gap-4">
                  <Avatar name={draft.name || "User"} size={64} />
                  <div>
                    <h3 className="font-display text-base font-semibold text-fg">
                      {draft.name || "Unnamed"}
                    </h3>
                    <p className="text-sm text-fg-subtle">{draft.role}</p>
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto">
                    Change avatar
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name">
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Role">
                    <Input
                      value={draft.role}
                      onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    />
                  </Field>
                  <Field label="Organization">
                    <Input
                      value={draft.org}
                      onChange={(e) => setDraft({ ...draft, org: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <Check className="h-4 w-4" strokeWidth={2.5} /> Saved
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setDraft(profile)}
                    disabled={!dirty}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveProfile} disabled={!dirty}>
                    Save changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {section === "integrations" && (
            <Card>
              <CardContent className="space-y-3 pt-5">
                <p className="text-sm text-fg-subtle">
                  Connect simulation backends and quantum design frameworks.
                </p>
                {SOLVERS.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-3 font-mono text-sm font-semibold text-primary">
                      {s.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-fg">
                          {s.name}
                        </h4>
                        {s.connected && (
                          <Badge tone="success" dot>
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-fg-subtle">{s.desc}</p>
                    </div>
                    <Button
                      variant={s.connected ? "ghost" : "outline"}
                      size="sm"
                    >
                      {s.connected ? "Manage" : "Connect"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {section === "notifications" && (
            <Card>
              <CardContent className="space-y-1 pt-5">
                {[
                  { key: "simDone", label: "Simulation completed", desc: "When a solver run finishes or fails" },
                  { key: "comments", label: "Comments & mentions", desc: "When someone replies or @mentions you" },
                  { key: "reviews", label: "Design reviews", desc: "When a review is requested or resolved" },
                  { key: "weekly", label: "Weekly digest", desc: "Summary of workspace activity" },
                ].map((n) => (
                  <div
                    key={n.key}
                    className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-fg">{n.label}</p>
                      <p className="text-xs text-fg-subtle">{n.desc}</p>
                    </div>
                    <Switch
                      checked={notif[n.key as keyof typeof notif]}
                      onChange={(v) => setNotif({ ...notif, [n.key]: v })}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {section === "security" && (
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center gap-3">
                    <StatusDot tone="success" />
                    <div>
                      <p className="text-sm font-medium text-fg">
                        Two-factor authentication
                      </p>
                      <p className="text-xs text-fg-subtle">
                        Enabled via authenticator app
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
                <Field label="Current password">
                  <Input type="password" defaultValue="••••••••••" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New password">
                    <Input type="password" placeholder="Enter new password" />
                  </Field>
                  <Field label="Confirm password">
                    <Input type="password" placeholder="Re-enter password" />
                  </Field>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                  {pwSaved && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <Check className="h-4 w-4" strokeWidth={2.5} /> Password updated
                    </span>
                  )}
                  <Button
                    onClick={() => {
                      setPwSaved(true);
                      setTimeout(() => setPwSaved(false), 2200);
                    }}
                  >
                    Update password
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
