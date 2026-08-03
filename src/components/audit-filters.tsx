"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DateRangeFilter } from "@/components/date-range-filter";

type AgentOpt = { id: string; name: string };

/** Agent + status + date-range filters for the Audit Queue. Writes to the URL. */
export function AuditFilters({ agents }: { agents: AgentOpt[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const agent = sp.get("agent") ?? "";
  const status = sp.get("status") ?? "pending";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/review?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={agent}
        onChange={(e) => setParam("agent", e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
      >
        <option value="">All agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      <select
        value={status}
        onChange={(e) => setParam("status", e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
      >
        <option value="pending">Pending review</option>
        <option value="all">All conversations</option>
      </select>

      <div className="ml-auto">
        <DateRangeFilter basePath="/review" />
      </div>
    </div>
  );
}
