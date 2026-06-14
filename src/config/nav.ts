import {
  LayoutDashboard,
  FolderKanban,
  Workflow,
  Code2,
  Activity,
  Sparkles,
  LineChart,
  Layers,
  GitBranch,
  Users,
  Boxes,
  FlaskConical,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  short: string;
  path: string;
  icon: LucideIcon;
  description: string;
  badge?: string;
}

export const NAV_MAIN: NavItem[] = [
  {
    label: "Dashboard",
    short: "Home",
    path: "/app",
    icon: LayoutDashboard,
    description: "Workspace overview, activity & quick actions",
  },
  {
    label: "Projects",
    short: "Projects",
    path: "/app/projects",
    icon: FolderKanban,
    description: "All designs, folders, tags & snapshots",
  },
  {
    label: "Visual Designer",
    short: "Designer",
    path: "/app/designer",
    icon: Workflow,
    description: "Infinite canvas — drag, connect & edit components",
  },
  {
    label: "Code Studio",
    short: "Code",
    path: "/app/code",
    icon: Code2,
    description: "Python + Quantum Metal with live bidirectional sync",
  },
  {
    label: "Simulation",
    short: "Simulate",
    path: "/app/simulation",
    icon: Activity,
    description: "Validation, frequency, capacitance & coupling analysis",
  },
  {
    label: "Optimization",
    short: "Optimize",
    path: "/app/optimization",
    icon: Sparkles,
    description: "Goal-driven, multi-objective parameter tuning",
    badge: "AI",
  },
  {
    label: "Results",
    short: "Results",
    path: "/app/results",
    icon: LineChart,
    description: "Metrics dashboard — frequency, Q, coupling & more",
  },
  {
    label: "Fabrication",
    short: "Fab",
    path: "/app/fabrication",
    icon: Layers,
    description: "Materials, surface-participation loss & design-rule checks",
  },
  {
    label: "Experiments",
    short: "Experiments",
    path: "/app/experiments",
    icon: GitBranch,
    description: "Version history, evolution & run comparisons",
  },
  {
    label: "Collaboration",
    short: "Team",
    path: "/app/collaboration",
    icon: Users,
    description: "Reviews, comments & design sharing",
  },
];

export const NAV_LIBRARY: NavItem[] = [
  {
    label: "Component Library",
    short: "Components",
    path: "/app/components",
    icon: Boxes,
    description: "All quantum components & their parameters",
  },
  {
    label: "Material Library",
    short: "Materials",
    path: "/app/materials",
    icon: FlaskConical,
    description: "Conductors & substrates with properties",
  },
];

export const NAV_FOOTER: NavItem[] = [
  {
    label: "Settings",
    short: "Settings",
    path: "/app/settings",
    icon: Settings,
    description: "Workspace, appearance & integrations",
  },
];

/** All nav items (for active-route matching / command palette). */
export const NAV_ALL: NavItem[] = [...NAV_MAIN, ...NAV_LIBRARY, ...NAV_FOOTER];
