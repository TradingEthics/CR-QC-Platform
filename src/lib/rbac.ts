// Role-Based Access Control — shared, edge-safe helpers.
// Pure permission functions here are imported by both client and server code.

export type Role = "admin" | "reviewer" | "agent";

export const ROLES: Role[] = ["admin", "reviewer", "agent"];
export const DEFAULT_ROLE: Role = "agent";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  reviewer: "Reviewer",
  agent: "Agent",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Full access — dashboards, audits, user management, settings.",
  reviewer: "Run QC audits and view all dashboards, agents, and the scorecard.",
  agent: "Read-only access to the team dashboard and agent profiles.",
};

/** Can run manual audits / access the review queue. */
export function canAudit(role: Role | undefined): boolean {
  return role === "admin" || role === "reviewer";
}

/** Can manage users, roles, and settings. */
export function canAdmin(role: Role | undefined): boolean {
  return role === "admin";
}

/** Route prefixes each role may open. `null` in `deny` means "everything else allowed". */
export function canAccessPath(role: Role | undefined, pathname: string): boolean {
  const r = role ?? DEFAULT_ROLE;
  if (r === "admin") return true;

  if (r === "reviewer") {
    // Everything except admin-only settings / access control.
    return !pathname.startsWith("/settings") && !pathname.startsWith("/access");
  }

  // agent: read-only viewing surfaces only.
  const agentAllowed = ["/dashboard", "/agents", "/conversations"];
  if (pathname === "/") return true;
  return agentAllowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Look up a user's role from app_users. Edge/node safe (plain fetch, no supabase-js). */
export async function getUserRole(email: string | null | undefined): Promise<Role> {
  if (!email) return DEFAULT_ROLE;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return DEFAULT_ROLE;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/app_users?select=role&email=eq.${encodeURIComponent(
        email.toLowerCase()
      )}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return DEFAULT_ROLE;
    const rows = (await res.json()) as { role?: Role }[];
    return rows[0]?.role ?? DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}
