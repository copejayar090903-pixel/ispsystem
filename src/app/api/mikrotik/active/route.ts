import { NextResponse } from "next/server";
import { getActivePPPoESessions, MikrotikError } from "@/src/lib/mikrotik";

// Force Next.js dev compilation trigger
export const runtime = "nodejs";

export async function GET() {
  try {
    const sessions = await getActivePPPoESessions();

    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof MikrotikError) {
      const status = error.code === "LOGIN_FAILED" ? 401 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Failed to fetch active PPPoE sessions." }, { status: 500 });
  }
}
