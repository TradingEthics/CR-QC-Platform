"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { triggerRefresh } from "@/app/actions/refresh";

const MAX_ITERS = 40; // safety cap (~480 conversations/click)

export function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setStatus("Fetching new conversations from Intercom…");
    let ingested = 0;
    let scored = 0;
    let gemini = 0;
    let deepseek = 0;

    try {
      for (let i = 0; i < MAX_ITERS; i++) {
        // First pass ingests + scores; later passes only score the backlog.
        const res = await triggerRefresh({ ingest: i === 0, scoreLimit: 12 });
        if (!res.ok || !res.result) {
          setError(res.error ?? "Refresh failed");
          break;
        }
        const r = res.result;
        ingested += r.ingested;
        scored += r.scored;
        gemini += r.geminiUsed;
        deepseek += r.deepseekUsed;
        setStatus(
          `Ingested ${ingested} · scored ${scored} (Gemini ${gemini}, DeepSeek ${deepseek}) · ${r.remainingToScore} left…`
        );
        // Done when the backlog is drained, or a pass made no progress.
        if (r.remainingToScore === 0) break;
        if (r.scored === 0 && r.failed > 0) {
          setError(`Stopped: ${r.failed} scoring failures. ${r.errors[0] ?? ""}`);
          break;
        }
        if (r.scored === 0 && r.ingested === 0) break;
      }
      setStatus(`Done. Ingested ${ingested}, scored ${scored} (Gemini ${gemini}, DeepSeek ${deepseek}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {busy ? "Fetching…" : "Fetch new data"}
      </button>
      {status && !error && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {!busy && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          {status}
        </span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </span>
      )}
    </div>
  );
}
