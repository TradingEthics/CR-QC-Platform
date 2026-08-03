"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESETS, presetToRange, type PresetKey } from "@/lib/date-range";

/** Preset + custom date-range filter that writes `since`/`until` to the URL. */
export function DateRangeFilter({ basePath }: { basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const base = basePath ?? pathname;

  const [customOpen, setCustomOpen] = useState(false);
  const since = sp.get("since") ?? "";
  const until = sp.get("until") ?? "";

  function apply(next: { since?: string; until?: string }) {
    const params = new URLSearchParams(sp.toString());
    if (next.since) params.set("since", next.since);
    else params.delete("since");
    if (next.until) params.set("until", next.until);
    else params.delete("until");
    router.push(`${base}?${params.toString()}`);
  }

  function activePreset(): PresetKey | null {
    if (!since && !until) return "all";
    for (const p of PRESETS) {
      const r = presetToRange(p.key);
      if ((r.since ?? "") === since && (r.until ?? "") === until) return p.key;
    }
    return null;
  }
  const active = activePreset();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => { setCustomOpen(false); apply(presetToRange(p.key)); }}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
            active === p.key
              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
              : "border-[var(--border)] text-muted-foreground hover:bg-[var(--muted)]/60"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setCustomOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          active === null
            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
            : "border-[var(--border)] text-muted-foreground hover:bg-[var(--muted)]/60"
        )}
      >
        <CalendarRange className="h-3.5 w-3.5" /> Custom
      </button>

      {customOpen && (
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
          <input
            type="date"
            defaultValue={since ? since.slice(0, 10) : ""}
            onChange={(e) => {
              const d = e.target.value ? new Date(e.target.value + "T00:00:00").toISOString() : undefined;
              apply({ since: d, until: until || undefined });
            }}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs outline-none"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            defaultValue={until ? until.slice(0, 10) : ""}
            onChange={(e) => {
              const d = e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined;
              apply({ since: since || undefined, until: d });
            }}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs outline-none"
          />
        </div>
      )}
    </div>
  );
}
