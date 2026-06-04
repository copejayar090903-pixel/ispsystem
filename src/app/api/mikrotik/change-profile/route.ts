import { NextResponse } from "next/server";
import { changePPPoEProfile, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { username, profile } = (await request.json()) as { username?: string; profile?: string };

    if (!username || !profile) {
      return NextResponse.json({ error: "Username and profile are required." }, { status: 400 });
    }

    const result = await changePPPoEProfile(username, profile);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MikrotikError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "LOGIN_FAILED" ? 401 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: "Failed to change PPPoE profile." }, { status: 500 });
  }
}
