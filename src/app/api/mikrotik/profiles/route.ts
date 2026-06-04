import { NextResponse } from "next/server";
import { getPPPoEProfiles, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

function mikrotikErrorResponse(error: unknown) {
  if (error instanceof MikrotikError) {
    const status = error.code === "LOGIN_FAILED" ? 401 : 503;

    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ error: "Failed to fetch PPPoE profiles." }, { status: 500 });
}

export async function GET() {
  try {
    const profiles = await getPPPoEProfiles();

    return NextResponse.json({ profiles });
  } catch (error) {
    return mikrotikErrorResponse(error);
  }
}