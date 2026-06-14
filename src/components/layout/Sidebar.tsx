import { NavLink, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeft, Plus } from "lucide-react";
import { NAV_MAIN, NAV_LIBRARY, NAV_FOOTER, type NavItem } from "@/config/nav";
import { useAppStore } from "@/store/useAppStore";
import { Logo } from "@/components/common/Logo";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

function NavRow({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/app"}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-primary/12 text-primary"
            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon
            className={cn(
              "h-[1.15rem] w-[1.15rem] shrink-0 transition-transform duration-200 group-hover:scale-110",
            )}
          />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <Badge tone="violet" className="px-1.5 py-0">
                  {item.badge}
                </Badge>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right" wrapperClassName="flex w-full">
        {link}
      </Tooltip>
    );
  }
  return link;
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, setNewDesignOpen } = useAppStore();
  const collapsed = sidebarCollapsed;

  return (
    <aside
      className={cn(
        "relative z-30 hidden h-full shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl transition-[width] duration-300 ease-spring lg:flex",
        collapsed ? "w-[4.75rem]" : "w-64",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-line px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link to="/" aria-label="QRIVARA home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>

      {/* New project CTA */}
      <div className={cn("px-3 pt-4", collapsed && "px-2")}>
        <button
          onClick={() => setNewDesignOpen(true)}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgb(var(--primary)/0.8)] transition-transform duration-200 hover:scale-[1.02] active:scale-95",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {!collapsed && "New Design"}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 no-scrollbar">
        {!collapsed && (
          <p className="px-3 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Workspace
          </p>
        )}
        {NAV_MAIN.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} />
        ))}

        {!collapsed && (
          <p className="px-3 pb-1.5 pt-5 text-2xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Library
          </p>
        )}
        {collapsed && <div className="my-3 h-px bg-line" />}
        {NAV_LIBRARY.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer nav */}
      <div className="space-y-1 border-t border-line px-3 py-3">
        {NAV_FOOTER.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} />
        ))}
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-[1.15rem] w-[1.15rem]" />
          ) : (
            <>
              <PanelLeftClose className="h-[1.15rem] w-[1.15rem]" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
