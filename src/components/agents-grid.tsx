"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, ScoreCell } from "@/components/ui";
import type { AgentSummary } from "@/lib/types";

type SortKey = "name" | "avg" | "audit";

export function AgentsGrid({ board }: { board: AgentSummary[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("avg");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = board;
    if (needle) {
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(needle) ||
          (a.email ?? "").toLowerCase().includes(needle)
      );
    }
    const sorted = [...rows];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "audit") sorted.sort((a, b) => b.pending_review - a.pending_review);
    else sorted.sort((a, b) => (b.avg_qc ?? -1) - (a.avg_qc ?? -1));
    return sorted;
  }, [board, q, sort]);

  return (
    <div className="px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by agent name or email…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
        >
          <option value="avg">Sort: Avg QC</option>
          <option value="name">Sort: Name</option>
          <option value="audit">Sort: To audit</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} agents</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <Link key={a.agent_id} href={`/agents/${a.agent_id}`}>
            <Card className="p-4 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                </div>
                <ScoreCell score={a.avg_qc} />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>{a.total} scored</span>
                {a.pending_review > 0 && (
                  <span className="text-red-500">{a.pending_review} to audit</span>
                )}
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            No agents match “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}
