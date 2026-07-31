import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, Users, ClipboardCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CR QC Platform",
  description: "Case Resolution Quality Control — FundedNext",
};

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 md:flex">
            <div className="mb-6 px-2">
              <div className="text-lg font-semibold">CR QC Platform</div>
              <div className="text-xs text-neutral-500">FundedNext · Case Resolution</div>
            </div>
            <nav className="flex flex-col gap-1">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
