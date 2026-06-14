import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/common/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <LogoMark size={56} className="mb-6 animate-float" />
      <p className="font-mono text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
        This qubit decohered
      </h1>
      <p className="mt-2 max-w-md text-sm text-fg-subtle">
        The page you're looking for has tunneled out of existence. Let's get you
        back to a stable state.
      </p>
      <Link to="/app" className="mt-6">
        <Button icon={<ArrowLeft className="h-4 w-4" />}>
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
