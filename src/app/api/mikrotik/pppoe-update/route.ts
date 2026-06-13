import { NextResponse } from "next/server";
import { updatePPPoESecretFields, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

/**
 * POST /api/mikrotik/pppoe-update
 * Body: { username, newName?, password?, comment?, profile? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      newName?: string;
      password?: string;
      comment?: string;
      profile?: string;
    };

    if (!body.username) {
      return NextResponse.json({ error: "username is required." }, { status: 400 });
    }

    const result = await updatePPPoESecretFields(body.username, {
      newName:  body.newName,
      password: body.password,
      comment:  body.comment,
      profile:  body.profile,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MikrotikError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "LOGIN_FAILED" ? 401 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Failed to update PPPoE secret." }, { status: 500 });
  }
}
