"use server";

import { revalidatePath } from "next/cache";
import { auth, authConfigured } from "@/auth";
import { runRefresh, type RefreshResult, type RefreshOptions } from "@/lib/pipeline/refresh";

export interface TriggerResult {
  ok: boolean;
  error?: string;
  result?: RefreshResult;
}

/** Admin-only manual refresh. The button calls this in a loop to drain the queue. */
export async function triggerRefresh(opts: RefreshOptions = {}): Promise<TriggerResult> {
  if (authConfigured) {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { ok: false, error: "Admin role required." };
    }
  }
  try {
    const result = await runRefresh(opts);
    revalidatePath("/dashboard");
    revalidatePath("/review");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refresh failed" };
  }
}
