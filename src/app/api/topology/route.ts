import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import {
  getPPPoESecrets,
  getActivePPPoESessions,
  getInterfaceStats,
  getRouterIdentity,
  getSystemResource,
} from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // ── Fetch DB customers ────────────────────────────────────────────────────
    const { data: dbCustomers } = await supabase
      .from("customers")
      .select("id, pppoe_username, full_name, status, due_date, plans(plan_name, speed)");

    // ── Fetch MikroTik data ───────────────────────────────────────────────────
    let secrets: any[]        = [];
    let activeSessions: any[] = [];
    let interfaces: any[]     = [];
    let identity: any         = {};
    let resources: any        = {};
    let routerOnline          = true;

    try {
      [secrets, activeSessions, interfaces, identity, resources] = await Promise.all([
        getPPPoESecrets(),
        getActivePPPoESessions(),
        getInterfaceStats(),
        getRouterIdentity(),
        getSystemResource(),
      ]);
    } catch (err) {
      routerOnline = false;
    }

    // ── Build active session index ────────────────────────────────────────────
    const activeIndex = new Map<string, any>();
    for (const s of activeSessions) {
      const user = s.user ?? s.name ?? "";
      if (user) activeIndex.set(user, s);
    }

    // ── Interface nodes (Only VLAN 200 and VLAN 624)
    const isTargetVlan = (name: string) => {
      const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return norm === "vlan200" || norm === "vlan624" || norm === "200" || norm === "624";
    };

    const ifaceNodes = interfaces
      .filter((iface: any) => {
        const name: string = iface.name ?? "";
        return isTargetVlan(name);
      })
      .map((iface: any) => ({
        id:       `iface:${iface.name}`,
        name:     iface.name,
        type:     iface.type ?? "ether",
        running:  iface.running === "true",
        disabled: iface.disabled === "true",
        rxBytes:  Number(iface["rx-byte"] ?? 0),
        txBytes:  Number(iface["tx-byte"] ?? 0),
      }));

    // ── Pre-map all interfaces with IDs for guessInterface
    const allIfaceNodes = interfaces.map((iface: any) => ({
      id:       `iface:${iface.name}`,
      name:     iface.name,
      type:     iface.type ?? "ether",
      running:  iface.running === "true",
      disabled: iface.disabled === "true",
    }));

    // ── PPPoE client nodes ────────────────────────────────────────────────────
    // Use secrets as the authoritative list; join with active sessions + DB
    const clientNodes = secrets
      .map((secret: any) => {
        const username  = secret.name;
        const session   = activeIndex.get(username);
        const dbRecord  = (dbCustomers ?? []).find((c: any) => c.pppoe_username === username);
        const isOnline  = !!session;
        const isExpired = secret.profile === "Expired-Profile";
        const isDisabled= secret.disabled === "true";

        // Determine which interface/VLAN this client is on using all interfaces
        const callerIface = session?.["caller-id"]
          ? guessInterface(session["caller-id"], allIfaceNodes)
          : null;

        return {
          id:            `client:${username}`,
          username,
          fullName:      dbRecord?.full_name ?? secret.comment?.trim() ?? username,
          profile:       secret.profile ?? "default",
          online:        isOnline && !isExpired && !isDisabled,
          expired:       isExpired,
          disabled:      isDisabled,
          ipAddress:     session?.address ?? null,
          uptime:        session?.uptime ?? null,
          callerId:      session?.["caller-id"] ?? null,
          dueDate:       dbRecord?.due_date ?? null,
          planName:      (dbRecord?.plans as any)?.plan_name ?? secret.profile ?? null,
          status:        dbRecord?.status ?? (isExpired ? "unpaid" : isDisabled ? "inactive" : isOnline ? "active" : "offline"),
          ifaceId:       callerIface,
        };
      })
      // If client is online, only show if they are on target VLANs.
      // If client is offline, they default to first target VLAN (VLAN 200/624) to be shown as offline.
      .filter((client: any) => {
        if (!client.online) {
          // Keep offline clients but place them on the first available target VLAN
          client.ifaceId = ifaceNodes[0]?.id ?? null;
          return client.ifaceId !== null;
        }
        // Online clients must match target VLAN
        const ifaceName = client.ifaceId?.replace("iface:", "") ?? "";
        return isTargetVlan(ifaceName);
      });

    return NextResponse.json({
      router: {
        name:     identity.name ?? "MikroTik Router",
        online:   routerOnline,
        version:  resources.version ?? null,
        uptime:   resources.uptime ?? null,
        cpuLoad:  resources["cpu-load"] ?? null,
        freeMemory:  resources["free-memory"] ?? null,
        totalMemory: resources["total-memory"] ?? null,
      },
      interfaces: ifaceNodes,
      clients:    clientNodes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build topology." },
      { status: 500 }
    );
  }
}

/** Try to guess which interface a PPPoE client connected through by their caller-id (MAC) */
function guessInterface(callerId: string, ifaces: any[]): string | null {
  // Caller-id format on MikroTik is usually "MAC;iface" or just MAC
  const parts = callerId.split(";");
  if (parts.length >= 2) {
    const ifaceName = parts[1]?.trim();
    const match = ifaces.find((i: any) => i.name === ifaceName);
    if (match) return match.id;
  }
  // Fall back: find a VLAN or ether interface
  const vlan = ifaces.find((i: any) => i.type === "vlan");
  if (vlan) return vlan.id;
  const ether = ifaces.find((i: any) => i.type === "ether" && i.running);
  if (ether) return ether.id;
  return ifaces[0]?.id ?? null;
}
