import { NextResponse } from "next/server";
import { getActivePPPoESessions, getPPPoEProfiles, getRouterIdentity, getSystemResource, MikrotikError } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [identity, resource, sessions, profiles] = await Promise.all([
      getRouterIdentity(),
      getSystemResource(),
      getActivePPPoESessions(),
      getPPPoEProfiles(),
    ]);

    return NextResponse.json({ connected: true, identity, resource, sessions, profiles });
  } catch (error) {
    console.error("[MikroTik Status Route Error]:", error);
    if (error instanceof MikrotikError) {
      const status = error.code === "LOGIN_FAILED" ? 401 : 503;
      return NextResponse.json({ connected: false, error: error.message }, { status });
    }

    return NextResponse.json({ connected: false, error: "Cannot connect to MikroTik. Check VPN connection." }, { status: 500 });
  }
}
