import { NextResponse } from "next/server";
import { connectMikrotik } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

/**
 * Debug endpoint — returns raw MikroTik /ppp/active/print response
 * so we can see exactly what field names and values are returned.
 * Visit: /api/mikrotik/debug-sessions
 */
export async function GET() {
  try {
    const conn = await connectMikrotik();

    // Raw print — no filters, get everything
    const raw = await conn.write("/ppp/active/print");

    await conn.close().catch(() => undefined);

    // Return the first session in full to inspect field names
    return NextResponse.json({
      count: (raw as any[]).length,
      firstSession: (raw as any[])[0] ?? null,
      allFields: (raw as any[])[0] ? Object.keys((raw as any[])[0]) : [],
      sessions: (raw as any[]).slice(0, 5), // First 5 for inspection
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    );
  }
}
