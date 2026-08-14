import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, scoreBand, bandClasses, fmtScore, type Band } from "@/lib/utils";

/* ---------------- Button ---------------- */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-sm",
        outline:
          "border border-[var(--border-strong)] bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted text-muted-foreground hover:text-foreground",
        danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        subtle: "bg-accent text-accent-foreground hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* ---------------- Card ---------------- */
export function Card({ className, glass = true, ...props }: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn("rounded-xl", glass ? "glass" : "glass-strong", className)}
      {...props}
    />
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/* ---------------- Page header ---------------- */
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
    <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------------- Stat card ---------------- */
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
      ? "text-red-500"
      : tone === "amber"
        ? "text-amber-500"
        : tone === "emerald"
          ? "text-emerald-500"
          : "";
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/* ---------------- Chips ---------------- */
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
    return <span className="text-xs text-muted-foreground">n/a</span>;
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

export function Segmented({
  options,
  active,
  hrefFor,
}: {
  options: { key: string; label: string }[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1">
      {options.map((o) => (
        <Link
          key={o.key}
          href={hrefFor(o.key)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            o.key === active
              ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
