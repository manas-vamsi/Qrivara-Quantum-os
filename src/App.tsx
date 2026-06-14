import { lazy, Suspense, useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { LogoMark } from "@/components/common/Logo";
import { useAppStore, applyTheme } from "@/store/useAppStore";
import { useDataStore } from "@/store/useDataStore";

// Public landing page (front door) loads eagerly.
import Landing from "@/pages/Landing";
// App modules are code-split so heavy deps (Monaco, React Flow, Recharts)
// only load with their page.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const Designer = lazy(() => import("@/pages/Designer"));
const CodeStudio = lazy(() => import("@/pages/CodeStudio"));
const Simulation = lazy(() => import("@/pages/Simulation"));
const Optimization = lazy(() => import("@/pages/Optimization"));
const Results = lazy(() => import("@/pages/Results"));
const Fabrication = lazy(() => import("@/pages/Fabrication"));
const Experiments = lazy(() => import("@/pages/Experiments"));
const Collaboration = lazy(() => import("@/pages/Collaboration"));
const ComponentLibrary = lazy(() => import("@/pages/ComponentLibrary"));
const MaterialLibrary = lazy(() => import("@/pages/MaterialLibrary"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4">
      <LogoMark size={44} className="animate-pulse" />
      <div className="flex items-center gap-2 text-sm text-fg-subtle">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        Loading module…
      </div>
    </div>
  );
}

const withSuspense = (el: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{el}</Suspense>
);

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  {
    path: "/app",
    element: <AppShell />,
    children: [
      { index: true, element: withSuspense(<Dashboard />) },
      { path: "projects", element: withSuspense(<Projects />) },
      { path: "designer", element: withSuspense(<Designer />) },
      { path: "code", element: withSuspense(<CodeStudio />) },
      { path: "simulation", element: withSuspense(<Simulation />) },
      { path: "optimization", element: withSuspense(<Optimization />) },
      { path: "results", element: withSuspense(<Results />) },
      { path: "fabrication", element: withSuspense(<Fabrication />) },
      { path: "experiments", element: withSuspense(<Experiments />) },
      { path: "collaboration", element: withSuspense(<Collaboration />) },
      { path: "components", element: withSuspense(<ComponentLibrary />) },
      { path: "materials", element: withSuspense(<MaterialLibrary />) },
      { path: "settings", element: withSuspense(<Settings />) },
      { path: "*", element: withSuspense(<NotFound />) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const fetchProjects = useDataStore((s) => s.fetchProjects);
  const fetchComponents = useDataStore((s) => s.fetchComponents);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    fetchProjects();
    fetchComponents();
  }, [fetchProjects, fetchComponents]);

  return <RouterProvider router={router} />;
}
