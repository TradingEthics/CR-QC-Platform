import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Grading bands (source of truth mirrors scoring_prompt.py). 75 = pass mark. */
export type Band = "Excellent" | "Good" | "Average" | "Fail" | "Unscored";

export function scoreBand(score: number | null | undefined): Band {
  if (score === null || score === undefined) return "Unscored";
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 75) return "Average";
  return "Fail";
}

/** Tailwind text/bg classes per band, for chips and score cells. */
export function bandClasses(band: Band): string {
  switch (band) {
    case "Excellent":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "Good":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
    case "Average":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "Fail":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
    default:
      return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

export function scoreColor(score: number | null | undefined): string {
  return bandClasses(scoreBand(score));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtScore(score: number | null | undefined): string {
  return score === null || score === undefined ? "—" : score.toFixed(1);
}
