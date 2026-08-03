"use server";

import { revalidatePath } from "next/cache";
import { auth, ALLOWED_DOMAIN } from "@/auth";
import { createServerSupabase } from "@/lib/supabase";
import { ROLES, type Role } from "@/lib/rbac";

/** Guard: only an admin may mutate roles. Throws otherwise. */
async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email || session?.user?.role !== "admin") {
    throw new Error("Not authorized: admin role required.");
  }
  return email;
}

export interface RoleActionResult {
  ok: boolean;
  error?: string;
}

/** Assign (upsert) a role for a @nextventures.io user. Admin only. */
export async function setUserRole(
  emailRaw: string,
  role: Role
): Promise<RoleActionResult> {
  try {
    const actor = await requireAdmin();
    const email = emailRaw.trim().toLowerCase();

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return { ok: false, error: `Email must be @${ALLOWED_DOMAIN}` };
    }
    if (!ROLES.includes(role)) {
      return { ok: false, error: "Invalid role" };
    }
    // Prevent an admin from demoting themselves (avoids locking out access mgmt).
    if (email === actor.toLowerCase() && role !== "admin") {
      return { ok: false, error: "You cannot change your own admin role." };
    }

    const sb = createServerSupabase();
    const { error } = await sb
      .from("app_users")
      .upsert({ email, role }, { onConflict: "email" });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Remove a user's explicit role (reverts them to the default 'agent'). Admin only. */
export async function removeUser(emailRaw: string): Promise<RoleActionResult> {
  try {
    const actor = await requireAdmin();
    const email = emailRaw.trim().toLowerCase();
    if (email === actor.toLowerCase()) {
      return { ok: false, error: "You cannot remove yourself." };
    }
    const sb = createServerSupabase();
    const { error } = await sb.from("app_users").delete().eq("email", email);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
