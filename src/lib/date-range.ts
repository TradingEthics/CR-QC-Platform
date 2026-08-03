// Client-safe date-range helpers shared by the filter UI and the server pages.

export type RangeParams = { since?: string; until?: string };

export type PresetKey = "today" | "yesterday" | "7d" | "30d" | "all";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

/** Read a since/until window out of Next.js searchParams. */
export function rangeFromSearchParams(sp: {
  since?: string | string[];
  until?: string | string[];
}): RangeParams {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  return { since: one(sp.since) || undefined, until: one(sp.until) || undefined };
}

/** Compute a preset window using the viewer's local day boundaries (returns ISO/UTC). */
export function presetToRange(key: PresetKey, now: Date = new Date()): RangeParams {
  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const today0 = startOfDay(now);

  switch (key) {
    case "today":
      return { since: today0.toISOString(), until: now.toISOString() };
    case "yesterday": {
      const y = new Date(today0);
      y.setDate(y.getDate() - 1);
      return { since: y.toISOString(), until: today0.toISOString() };
    }
    case "7d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      return { since: s.toISOString() };
    }
    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { since: s.toISOString() };
    }
    case "all":
    default:
      return {};
  }
}
