import { useEffect, useState } from "react";
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
import { comingSoon } from "@/components/common/ComingSoon";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Field, Input, Switch } from "@/components/ui/Form";
import { Avatar } from "@/components/ui/Avatar";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: User },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
] as const;

// Solver engines. "Built-in" = QRIVARA's own open-source solvers (always on, no
// license). The rest are optional open-source integrations not yet wired.
const SOLVERS = [
  { name: "QRIVARA 3-D FEM", desc: "Built-in electrostatic field solver (capacitance / Q3D-class)", connected: true },
  { name: "QRIVARA Quantum Engine", desc: "Built-in transmon/fluxonium diagonalization, decoherence, QEC", connected: true },
  { name: "AWS Palace", desc: "Open-source full-wave EM (eigenmode / S-params) — integration planned", connected: false },
  { name: "Qiskit Metal", desc: "Open-source device design & GDS — integration planned", connected: false },
  { name: "scQubits", desc: "Open-source qubit Hamiltonians — integration planned", connected: false },
];

export default function Settings() {
  const { theme, setTheme, profile, setProfile } = useAppStore();
  const me = useAuthStore((s) => s.me);
  const refreshUsers = useAuthStore((s) => s.refreshUsers);

  const [section, setSection] =
    useState<(typeof SECTIONS)[number]["id"]>("appearance");
  const [notif, setNotif] = useState({
    simDone: true,
    comments: true,
    reviews: true,
    weekly: false,
  });

  // Account form (controlled draft + save feedback)
  const getProfileData = () => ({
    name: me?.name ?? profile.name,
    email: me?.email ?? profile.email,
    role: me?.role ?? profile.role,
    org: me?.org ?? profile.org,
    handle: me?.handle ?? profile.handle ?? "",
    headline: me?.headline ?? profile.headline ?? "",
    bio: me?.bio ?? profile.bio ?? "",
    institution: me?.institution ?? profile.institution ?? "",
    discoverable: me?.discoverable ?? profile.discoverable ?? true,
  });

  const [draft, setDraft] = useState(getProfileData);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(getProfileData());
  }, [me]);

  const initialData = getProfileData();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialData);

  const saveProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      const updatedUser = await api.updateProfile({
        name: draft.name,
        role: draft.role,
        org: draft.org,
        headline: draft.headline,
        bio: draft.bio,
        institution: draft.institution,
        discoverable: draft.discoverable,
      });

      // Update state in stores
      useAuthStore.setState({ me: updatedUser });
      setProfile({
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        org: updatedUser.org,
        handle: updatedUser.handle,
        headline: updatedUser.headline,
        bio: updatedUser.bio,
        institution: updatedUser.institution,
        discoverable: updatedUser.discoverable,
      });

      await refreshUsers();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setBusy(false);
    }
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
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => comingSoon("Avatar upload")}>
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
                      disabled
                      className="cursor-not-allowed opacity-60"
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
                  <Field label="Headline" className="sm:col-span-2">
                    <Input
                      value={draft.headline}
                      onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                      placeholder="e.g., PhD Candidate / Senior Qubit Designer"
                    />
                  </Field>
                  <Field label="Institution" className="sm:col-span-2">
                    <Input
                      value={draft.institution}
                      onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
                      placeholder="e.g., Delft University / NexVista"
                    />
                  </Field>
                  <Field label="Bio" className="sm:col-span-2">
                    <Input
                      value={draft.bio}
                      onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                      placeholder="Brief bio about your quantum hardware work…"
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between border-t border-line/60 pt-4 pb-2">
                  <div>
                    <p className="text-sm font-medium text-fg">Discoverable in search</p>
                    <p className="text-2xs text-fg-subtle">
                      Allow other researchers to find you by your name, handle, or email.
                    </p>
                  </div>
                  <Switch
                    checked={draft.discoverable}
                    onChange={(v) => setDraft({ ...draft, discoverable: v })}
                  />
                </div>

                {error && <p className="text-xs text-error">{error}</p>}

                <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <Check className="h-4 w-4" strokeWidth={2.5} /> Saved
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setDraft(getProfileData())}
                    disabled={!dirty || busy}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveProfile} disabled={!dirty || busy} loading={busy}>
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
                      onClick={() => comingSoon(`${s.name} integration`)}
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
                  <Button variant="outline" size="sm" onClick={() => comingSoon("Two-factor authentication")}>
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
                  <Button onClick={() => comingSoon("Password change")}>
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
