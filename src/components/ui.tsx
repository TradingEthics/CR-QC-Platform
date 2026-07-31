import Link from "next/link";
import { cn, scoreBand, bandClasses, fmtScore, type Band } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "red" | "amber" | "emerald";
}) {
  const toneCls =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "emerald"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export function BandChip({ band }: { band: Band }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", bandClasses(band))}>
      {band}
    </span>
  );
}

export function ScoreCell({ score }: { score: number | null | undefined }) {
  return (
    <span className={cn("inline-flex min-w-[3rem] justify-center rounded-md px-2 py-0.5 text-sm font-semibold", bandClasses(scoreBand(score)))}>
      {fmtScore(score)}
    </span>
  );
}

export function CxChip({ cx }: { cx: number | null | undefined }) {
  if (cx === null || cx === undefined)
    return <span className="text-xs text-neutral-400">n/a</span>;
  const cls =
    cx <= 2
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : cx === 3
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      CX {cx}
    </span>
  );
}

export function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block hover:bg-neutral-50 dark:hover:bg-neutral-900">
      {children}
    </Link>
  );
}
