import { NextResponse } from "next/server";
import { disablePPPoE, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

function mikrotikErrorResponse(error: unknown) {
  if (error instanceof MikrotikError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "LOGIN_FAILED" ? 401 : 503;

    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ error: "Failed to disable PPPoE account." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const { username } = (await request.json()) as { username?: string };

    if (!username) {
      return NextResponse.json({ error: "PPPoE account not found." }, { status: 404 });
    }

    const result = await disablePPPoE(username);

    return NextResponse.json(result);
  } catch (error) {
    return mikrotikErrorResponse(error);
  }
}