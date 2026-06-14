import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CircuitBoard,
  Atom,
  Zap,
  Compass,
  Radar,
  Network,
  Boxes,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Textarea, Select } from "@/components/ui/Form";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

const DOMAINS = [
  { id: "superconducting", name: "Superconducting Circuits", desc: "Transmons, resonators, couplers", icon: CircuitBoard, available: true },
  { id: "fluxonium", name: "Fluxonium Systems", desc: "High-anharmonicity flux qubits", icon: Atom, available: false },
  { id: "photonic", name: "Photonic Quantum", desc: "Linear-optical / integrated photonics", icon: Zap, available: false },
  { id: "spin", name: "Spin Qubits", desc: "Semiconductor quantum dots", icon: Compass, available: false },
  { id: "sensors", name: "Quantum Sensors", desc: "Magnetometry & metrology", icon: Radar, available: false },
  { id: "networking", name: "Quantum Networking", desc: "Links, repeaters & memories", icon: Network, available: false },
  { id: "custom", name: "Custom Devices", desc: "Bring your own component set", icon: Boxes, available: false },
];

export function NewDesignModal() {
  const { newDesignOpen, setNewDesignOpen } = useAppStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<"domain" | "details">("domain");
  const [domain, setDomain] = useState("superconducting");
  const [name, setName] = useState("Untitled Design");

  const close = () => {
    setNewDesignOpen(false);
    // reset for next open
    setTimeout(() => setStep("domain"), 200);
  };

  const create = () => {
    close();
    navigate("/app/designer");
  };

  return (
    <Modal
      open={newDesignOpen}
      onClose={close}
      size="xl"
      title={step === "domain" ? "Choose a domain" : "Create a new design"}
      description={
        step === "domain"
          ? "QRIVARA's architecture supports many quantum platforms. V1 ships Superconducting Circuits."
          : "Name your project and pick a starting point."
      }
      footer={
        step === "domain" ? (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              iconRight={<ArrowRight className="h-4 w-4" />}
              onClick={() => setStep("details")}
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep("domain")}>
              Back
            </Button>
            <Button icon={<Sparkles className="h-4 w-4" />} onClick={create}>
              Create design
            </Button>
          </>
        )
      }
    >
      {step === "domain" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DOMAINS.map((d) => {
            const Icon = d.icon;
            const active = domain === d.id;
            return (
              <button
                key={d.id}
                disabled={!d.available}
                onClick={() => d.available && setDomain(d.id)}
                className={cn(
                  "relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                  d.available
                    ? active
                      ? "border-primary/50 bg-primary/8 ring-2 ring-primary/20"
                      : "border-line bg-surface-2 hover:border-line-strong"
                    : "cursor-not-allowed border-line bg-surface-2/40 opacity-60",
                )}
              >
                <div
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    active ? "bg-primary/15 text-primary" : "bg-surface-3 text-fg-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-fg">{d.name}</h4>
                    {!d.available && <Badge tone="neutral">Soon</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-subtle">{d.desc}</p>
                </div>
                {active && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Design name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Falcon-17 Processor" />
          </Field>
          <Field label="Description">
            <Textarea rows={2} placeholder="17-qubit heavy-hex lattice…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start from">
              <Select defaultValue="blank">
                <option value="blank">Blank canvas</option>
                <option value="2q">2-qubit test chip</option>
                <option value="hexlattice">Heavy-hex lattice</option>
                <option value="readout">Multiplexed readout array</option>
              </Select>
            </Field>
            <Field label="Substrate">
              <Select defaultValue="sapphire">
                <option value="sapphire">Sapphire</option>
                <option value="si">Silicon</option>
                <option value="sic">Silicon Carbide</option>
                <option value="quartz">Quartz</option>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-xs text-fg-subtle">
            <CircuitBoard className="h-4 w-4 shrink-0 text-primary" />
            Domain: <span className="font-medium text-fg">Superconducting Circuits</span> · opens in the Visual Designer.
          </div>
        </div>
      )}
    </Modal>
  );
}
