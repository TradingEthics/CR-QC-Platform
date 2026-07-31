"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar-gradient hidden w-64 shrink-0 flex-col justify-between md:flex">
      <div>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-black/90 text-sm font-bold text-white">
            FN
          </div>
          <div>
            <div className="text-sm font-semibold text-white">CR QC Platform</div>
            <div className="text-[11px] text-[var(--sidebar-muted)]">FundedNext</div>
          </div>
        </div>

        <div className="px-3 pt-2">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
            Quality Control
          </div>
          <nav className="flex flex-col gap-1">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
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
      </div>

      <div className="m-3 rounded-xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
            QC
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white">QC Reviewer</div>
            <div className="truncate text-[10px] text-[var(--sidebar-muted)]">nextventures.io</div>
          </div>
        </div>
        <button className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--sidebar-foreground)] transition-colors hover:bg-white/5 hover:text-white">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}

export function Topbar() {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/70 px-6 backdrop-blur">
      <div className="text-sm text-muted-foreground md:hidden">CR QC Platform</div>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  );
}
