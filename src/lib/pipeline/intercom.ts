// Intercom REST client (TypeScript port of docs/references/intercom_client.py).
// Runs server-side on Vercel. Handles admins, teams, conversation search
// (incremental by updated_at), full-conversation fetch, and parsing.
import "server-only";
import { htmlToText } from "./html";

const BASE = "https://api.intercom.io";

export interface ParsedPart {
  intercom_part_id: string | null;
  part_type: string | null;
  author_type: "admin" | "bot" | "user";
  author_id: string | null;
  body_text: string;
  body_html: string;
  sequence_order: number;
  created_at: string | null; // ISO
}

export interface ParsedConversation {
  id: string;
  title: string | null;
  assignee_id: string | null;
  team_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  cx_score: number | null;
  created_at: string | null;
  updated_at: string | null;
  parts: ParsedPart[];
  admin_reply_count: number;
  total_parts_count: number;
  intercom_url: string | null;
}

export interface IntercomAdmin {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class IntercomClient {
  private token: string;
  private version: string;
  private appId: string;
  private remaining = 83;
  private reset = 0;

  constructor(token: string, version = "2.11", appId = "") {
    this.token = token;
    this.version = version;
    this.appId = appId;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": this.version,
    };
  }

  private async throttle() {
    if (this.remaining <= 5) {
      const wait = Math.max(0, this.reset - Date.now() / 1000) + 1;
      await sleep(wait * 1000);
    }
  }

  private track(res: Response) {
    const rem = res.headers.get("X-RateLimit-Remaining");
    const rst = res.headers.get("X-RateLimit-Reset");
    if (rem !== null) this.remaining = parseInt(rem, 10);
    if (rst !== null) this.reset = parseFloat(rst);
  }

  private async req(path: string, init?: RequestInit, attempt = 0): Promise<Record<string, unknown>> {
    await this.throttle();
    const res = await fetch(BASE + path, { ...init, headers: this.headers() });
    this.track(res);
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) throw new Error(`Intercom ${res.status} after retries`);
      await sleep(Math.pow(2, attempt) * 2000);
      return this.req(path, init, attempt + 1);
    }
    if (!res.ok) throw new Error(`Intercom ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async listAdmins(): Promise<IntercomAdmin[]> {
    const data = await this.req("/admins");
    const admins = (data.admins as Record<string, unknown>[]) ?? [];
    return admins.map((a) => ({
      id: String(a.id),
      name: (a.name as string) ?? "Unknown",
      email: (a.email as string) ?? null,
      avatar_url:
        a.avatar && typeof a.avatar === "object"
          ? ((a.avatar as Record<string, unknown>).image_url as string) ?? null
          : null,
    }));
  }

  async listTeams(): Promise<{ id: string; name: string }[]> {
    const data = await this.req("/teams");
    const teams = (data.teams as Record<string, unknown>[]) ?? [];
    return teams.map((t) => ({ id: String(t.id), name: (t.name as string) ?? "Unknown" }));
  }

  private searchQuery(inboxId: string, updatedAfter: Date | null) {
    const filters: Record<string, unknown>[] = [
      { field: "team_assignee_id", operator: "=", value: inboxId },
    ];
    if (updatedAfter) {
      filters.push({
        field: "updated_at",
        operator: ">",
        value: Math.floor(updatedAfter.getTime() / 1000),
      });
    }
    return filters.length === 1 ? filters[0] : { operator: "AND", value: filters };
  }

  /** One page of conversation search results + the cursor for the next page. */
  async searchConversationsPage(
    inboxId: string,
    updatedAfter: Date | null,
    startingAfter?: string,
    pageSize = 50
  ): Promise<{ conversations: Record<string, unknown>[]; nextCursor?: string }> {
    const pagination: Record<string, unknown> = { per_page: pageSize };
    if (startingAfter) pagination.starting_after = startingAfter;
    const data = await this.req("/conversations/search", {
      method: "POST",
      body: JSON.stringify({ query: this.searchQuery(inboxId, updatedAfter), pagination }),
    });
    const conversations = (data.conversations as Record<string, unknown>[]) ?? [];
    const pages = (data.pages as Record<string, unknown>) ?? {};
    const next = (pages.next as Record<string, unknown>) ?? {};
    return { conversations, nextCursor: next.starting_after as string | undefined };
  }

  /** Search conversations in an inbox updated after a timestamp (fully paginated). */
  async searchConversations(
    inboxId: string,
    updatedAfter: Date | null,
    pageSize = 50,
    maxPages = 100
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const { conversations, nextCursor } = await this.searchConversationsPage(
        inboxId,
        updatedAfter,
        cursor,
        pageSize
      );
      all.push(...conversations);
      cursor = nextCursor;
      if (!cursor || conversations.length === 0) break;
    }
    return all;
  }

  async getConversation(id: string): Promise<Record<string, unknown>> {
    return this.req(`/conversations/${id}?display_as=plaintext`);
  }

  /** Parse a raw Intercom conversation into our model. */
  parseConversation(raw: Record<string, unknown>, botAdminIds: Set<string>): ParsedConversation {
    const convId = String(raw.id ?? "");
    const source = (raw.source as Record<string, unknown>) ?? {};
    const title = (raw.title as string) ?? (source.subject as string) ?? null;

    const assignee = (raw.assignee as Record<string, unknown>) ?? {};
    const assignee_id = assignee.id ? String(assignee.id) : null;
    const team_id = raw.team_assignee_id ? String(raw.team_assignee_id) : null;

    // Customer
    let customer_name: string | null = null;
    let customer_email: string | null = null;
    const contacts = ((raw.contacts as Record<string, unknown>)?.contacts as Record<string, unknown>[]) ?? [];
    if (contacts.length) {
      customer_name = (contacts[0].name as string) ?? null;
      customer_email = (contacts[0].email as string) ?? null;
    }
    const srcAuthor = (source.author as Record<string, unknown>) ?? {};
    if (!customer_name) customer_name = (srcAuthor.name as string) ?? null;
    if (!customer_email) customer_email = (srcAuthor.email as string) ?? null;

    // CX score (CSAT)
    let cx_score: number | null = null;
    const rating = (raw.conversation_rating as Record<string, unknown>) ?? {};
    if (rating.rating) cx_score = parseInt(String(rating.rating), 10);
    const custom = (raw.custom_attributes as Record<string, unknown>) ?? {};
    if (cx_score === null && custom.cx_score) cx_score = parseInt(String(custom.cx_score), 10);

    const toIso = (ts: unknown) =>
      ts ? new Date(Number(ts) * 1000).toISOString() : null;
    const created_at = toIso(raw.created_at);
    const updated_at = toIso(raw.updated_at);

    // Parts: source is #0, then conversation_parts.
    const parts: ParsedPart[] = [];
    let seq = 0;
    if (Object.keys(source).length) {
      const bodyHtml = (source.body as string) ?? "";
      parts.push({
        intercom_part_id: null,
        part_type: "source",
        author_type: normalizeAuthor((srcAuthor.type as string) ?? "user"),
        author_id: srcAuthor.id ? String(srcAuthor.id) : null,
        body_html: bodyHtml,
        body_text: htmlToText(bodyHtml),
        sequence_order: seq++,
        created_at,
      });
    }
    const cpData =
      ((raw.conversation_parts as Record<string, unknown>)?.conversation_parts as Record<string, unknown>[]) ?? [];
    for (const p of cpData) {
      const author = (p.author as Record<string, unknown>) ?? {};
      const bodyHtml = (p.body as string) ?? "";
      parts.push({
        intercom_part_id: p.id ? String(p.id) : null,
        part_type: (p.part_type as string) ?? null,
        author_type: normalizeAuthor((author.type as string) ?? "unknown"),
        author_id: author.id ? String(author.id) : null,
        body_html: bodyHtml,
        body_text: htmlToText(bodyHtml),
        sequence_order: seq++,
        created_at: toIso(p.created_at),
      });
    }

    // Count human-agent replies (exclude bots by author id).
    const adminReplies = parts.filter(
      (p) =>
        p.author_type === "admin" &&
        p.author_id !== null &&
        !botAdminIds.has(p.author_id) &&
        p.body_text.trim() &&
        (p.part_type === "comment" || p.part_type === "source" || !p.part_type)
    );

    return {
      id: convId,
      title,
      assignee_id,
      team_id,
      customer_name,
      customer_email,
      cx_score,
      created_at,
      updated_at,
      parts,
      admin_reply_count: adminReplies.length,
      total_parts_count: parts.length,
      intercom_url: this.appId
        ? `https://app.intercom.com/a/inbox/${this.appId}/inbox/conversation/${convId}`
        : null,
    };
  }
}

function normalizeAuthor(t: string): "admin" | "bot" | "user" {
  return t === "admin" || t === "bot" || t === "user" ? t : "user";
}
