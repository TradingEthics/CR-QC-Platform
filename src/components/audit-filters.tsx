"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";

type AgentOpt = { id: string; name: string };

/** Agent + status + date-range filters + Chat-ID lookup for the Audit Queue. */
export function AuditFilters({ agents }: { agents: AgentOpt[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const agent = sp.get("agent") ?? "";
  const status = sp.get("status") ?? "pending";
  const [chatId, setChatId] = useState("");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/review?${params.toString()}`);
  }

  function findByChatId(e: React.FormEvent) {
    e.preventDefault();
    const id = chatId.trim();
    if (id) router.push(`/conversations/${encodeURIComponent(id)}`);
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
        <option value="reviewed">Manually reviewed</option>
        <option value="all">All conversations</option>
      </select>

      <form onSubmit={findByChatId} className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Find by Chat ID…"
          className="w-44 rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[var(--primary)]"
        />
      </form>

      <div className="ml-auto">
        <DateRangeFilter basePath="/review" />
      </div>
    </div>
  );
}
