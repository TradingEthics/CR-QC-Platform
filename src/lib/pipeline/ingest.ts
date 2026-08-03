// Ingestion writer (TypeScript port of docs/references/ingest.py SupabaseWriter).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntercomAdmin, ParsedConversation } from "./intercom";

/** Upsert agents; returns intercom_id → uuid map. */
export async function upsertAgents(
  sb: SupabaseClient,
  admins: IntercomAdmin[]
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  if (admins.length === 0) return cache;
  const { data, error } = await sb
    .from("agents")
    .upsert(
      admins.map((a) => ({
        intercom_id: a.id,
        name: a.name,
        email: a.email,
        avatar_url: a.avatar_url,
      })),
      { onConflict: "intercom_id" }
    )
    .select("id, intercom_id");
  if (error) throw new Error(`upsertAgents: ${error.message}`);
  for (const row of data ?? []) cache.set(row.intercom_id as string, row.id as string);
  return cache;
}

/** Upsert inboxes; returns intercom_id → uuid map. */
export async function upsertInboxes(
  sb: SupabaseClient,
  teams: { id: string; name: string }[]
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  if (teams.length === 0) return cache;
  const { data, error } = await sb
    .from("inboxes")
    .upsert(
      teams.map((t) => ({ intercom_id: t.id, name: t.name })),
      { onConflict: "intercom_id" }
    )
    .select("id, intercom_id");
  if (error) throw new Error(`upsertInboxes: ${error.message}`);
  for (const row of data ?? []) cache.set(row.intercom_id as string, row.id as string);
  return cache;
}

/** Upsert one conversation + its parts. Preserves manual review_status. Returns uuid or null. */
export async function upsertConversation(
  sb: SupabaseClient,
  conv: ParsedConversation,
  agentCache: Map<string, string>,
  inboxCache: Map<string, string>
): Promise<string | null> {
  const inboxUuid = conv.team_id ? inboxCache.get(conv.team_id) ?? null : null;

  // Primary agent = human admin with the most reply parts; fall back to assignee.
  const counts = new Map<string, number>();
  for (const p of conv.parts) {
    if (p.author_type === "admin" && p.author_id) {
      counts.set(p.author_id, (counts.get(p.author_id) ?? 0) + 1);
    }
  }
  let primary: string | null = conv.assignee_id;
  let max = 0;
  for (const [id, n] of counts) if (n > max) { max = n; primary = id; }
  const agentUuid = primary ? agentCache.get(primary) ?? null : null;

  const convData: Record<string, unknown> = {
    intercom_id: conv.id,
    inbox_id: inboxUuid,
    agent_id: agentUuid,
    cx_score: conv.cx_score,
    customer_name: conv.customer_name,
    customer_email: conv.customer_email,
    subject: conv.title,
    intercom_created_at: conv.created_at,
    intercom_updated_at: conv.updated_at,
    admin_reply_count: conv.admin_reply_count,
    total_parts_count: conv.total_parts_count,
    intercom_url: conv.intercom_url,
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from("conversations")
    .select("id, review_status")
    .eq("intercom_id", conv.id)
    .maybeSingle();

  let convUuid: string;
  if (existing) {
    convUuid = existing.id as string;
    const status = existing.review_status as string;
    // Never overwrite a manually-set status.
    if (status !== "in_review" && status !== "reviewed") {
      // keep existing status; do not force back to pending_scoring on re-sync
    }
    const { error } = await sb.from("conversations").update(convData).eq("id", convUuid);
    if (error) throw new Error(`update conversation: ${error.message}`);
  } else {
    convData.review_status = "pending_scoring";
    const { data: ins, error } = await sb
      .from("conversations")
      .insert(convData)
      .select("id")
      .single();
    if (error || !ins) return null;
    convUuid = ins.id as string;
  }

  // Replace parts (delete + reinsert).
  await sb.from("conversation_parts").delete().eq("conversation_id", convUuid);
  const rows = conv.parts.map((p) => ({
    conversation_id: convUuid,
    intercom_part_id: p.intercom_part_id,
    author_type: p.author_type,
    author_id: p.author_id,
    agent_id: p.author_type === "admin" && p.author_id ? agentCache.get(p.author_id) ?? null : null,
    body_text: p.body_text,
    body_html: p.body_html,
    part_type: p.part_type,
    sequence_order: p.sequence_order,
    intercom_created_at: p.created_at,
  }));
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await sb.from("conversation_parts").insert(chunk);
    if (error) throw new Error(`insert parts: ${error.message}`);
  }
  return convUuid;
}
