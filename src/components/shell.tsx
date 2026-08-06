"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  ListChecks,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";
import { signOutAction } from "@/app/actions/auth";
import { canAccessPath, ROLE_LABEL, type Role, DEFAULT_ROLE } from "@/lib/rbac";

const groups = [
  {
    label: "Quality Control",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agents", label: "Agents", icon: Users },
      { href: "/review", label: "Audit Queue", icon: ClipboardCheck },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/scorecard", label: "Scorecard", icon: ListChecks },
      { href: "/access", label: "Access Control", icon: Shield },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

type SidebarUser = { name: string | null; email: string | null; image: string | null; role: Role } | null;

/** App shell: manages the responsive sidebar (desktop collapse + mobile drawer). */
export function AppShell({ user, children }: { user: SidebarUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  // Restore the desktop collapse preference.
  useEffect(() => {
    const saved = localStorage.getItem("sidebarOpen");
    if (saved !== null) setDesktopOpen(saved === "1");
  }, []);

  const toggleDesktop = () =>
    setDesktopOpen((v) => {
      localStorage.setItem("sidebarOpen", v ? "0" : "1");
      return !v;
    });

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar (collapsible) */}
      <Sidebar user={user} className={cn("hidden", desktopOpen && "md:flex")} />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <Sidebar
        user={user}
        onNavigate={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        showClose
        onClose={() => setMobileOpen(false)}
      />

      <div className="app-canvas flex min-h-screen flex-1 flex-col overflow-x-hidden">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onToggleDesktop={toggleDesktop}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function Sidebar({
  user,
  className,
  onNavigate,
  showClose,
  onClose,
}: {
  user: SidebarUser;
  className?: string;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const role = user?.role ?? DEFAULT_ROLE;
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessPath(role, i.href)) }))
    .filter((g) => g.items.length > 0);
  const initials = (user?.name ?? user?.email ?? "QC")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside
      className={cn(
        "sidebar-gradient w-64 shrink-0 flex-col justify-between",
        className ?? "flex"
      )}
    >
      <div>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-black/90 text-sm font-bold text-white">
            FN
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">CR QC Platform</div>
            <div className="text-[11px] text-[var(--sidebar-muted)]">FundedNext</div>
          </div>
          {showClose && (
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-lg p-1 text-[var(--sidebar-foreground)] hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4 px-3 pt-1">
          {visibleGroups.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
                {g.label}
              </div>
              <nav className="flex flex-col gap-1">
                {g.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
                          : "text-[var(--sidebar-foreground)] hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      <div className="m-3 rounded-xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
            {initials || "QC"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium text-white">{user?.name ?? "QC Reviewer"}</span>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/80">
                {ROLE_LABEL[role]}
              </span>
            </div>
            <div className="truncate text-[10px] text-[var(--sidebar-muted)]">{user?.email ?? "not signed in"}</div>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--sidebar-foreground)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function Topbar({
  onMenu,
  onToggleDesktop,
}: {
  onMenu?: () => void;
  onToggleDesktop?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/70 px-4 backdrop-blur md:px-6">
      {/* Mobile: open drawer */}
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="mr-2 rounded-lg p-1.5 text-muted-foreground hover:bg-[var(--muted)] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Desktop: collapse/expand sidebar */}
      <button
        onClick={onToggleDesktop}
        aria-label="Toggle sidebar"
        className="mr-2 hidden rounded-lg p-1.5 text-muted-foreground hover:bg-[var(--muted)] md:inline-flex"
      >
        <PanelLeft className="h-5 w-5" />
      </button>
      <div className="text-sm font-medium text-muted-foreground md:hidden">CR QC Platform</div>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  );
}
