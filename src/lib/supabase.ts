import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service_role key. This is an internal
 * QC tool gated by Google OAuth (domain-restricted); server components read with
 * the service key so we don't have to model RLS for every dashboard query. The
 * service key is NEVER exposed to the browser — this module is server-only.
 */
export function createServerSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Set them in .env.local (or Vercel env)."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
