import { NextResponse } from "next/server";
import { disconnectPPPoE, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { username } = (await request.json()) as { username?: string };

    if (!username) {
      return NextResponse.json({ error: "PPPoE account not found." }, { status: 404 });
    }

    const result = await disconnectPPPoE(username);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MikrotikError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "LOGIN_FAILED" ? 401 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Failed to disconnect PPPoE session." }, { status: 500 });
  }
}
