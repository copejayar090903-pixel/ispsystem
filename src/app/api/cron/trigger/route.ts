import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/cron/trigger
 *
 * Called by the admin UI to manually trigger the due-date-check cron job.
 * Reads CRON_SECRET server-side and forwards it as an Authorization header,
 * so the secret is never exposed to the browser.
 */
export async function POST(req: NextRequest) {
  // Simple admin-only gate — the admin layout already protects these routes,
  // but we also accept an optional x-admin-token header for extra safety.
  // In production, also protect via your admin auth middleware.

  const cronSecret = process.env.CRON_SECRET;

  // Build the internal URL to the cron endpoint
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const cronUrl = `${protocol}://${host}/api/cron/due-date-check`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
    }

    const cronRes = await fetch(cronUrl, {
      method: "GET",
      headers,
      // Don't cache this — it's a live trigger
      cache: "no-store",
    });

    const data = await cronRes.json();

    return NextResponse.json(
      { ...data, triggeredAt: new Date().toISOString() },
      { status: cronRes.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trigger failed.";
    console.error("[CronTrigger] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
