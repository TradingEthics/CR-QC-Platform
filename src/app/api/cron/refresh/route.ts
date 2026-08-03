import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runRefresh } from "@/lib/pipeline/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap

/**
 * Daily refresh endpoint. Authenticated by CRON_SECRET (Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`) or by an admin session (manual hit).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = secret && authHeader === `Bearer ${secret}`;

  if (!isCron) {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Optional overrides via query string (?scoreLimit=15&sinceHours=48&ingest=0).
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const result = await runRefresh({
    ingest: sp.get("ingest") !== "0",
    sinceHours: num("sinceHours"),
    scoreLimit: num("scoreLimit") ?? 15,
    maxIngest: num("maxIngest"),
  });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
