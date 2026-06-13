import { NextResponse } from "next/server";
import {
  getActivePPPoESessions,
  getSystemResource,
  getRouterIdentity,
  getInterfaceStats,
  MikrotikError,
  type SystemResource,
  type RouterIdentity,
} from "@/src/lib/mikrotik";

export const runtime = "nodejs";

/**
 * GET /api/mikrotik/realtime
 *
 * Returns live MikroTik data every 1 second:
 * - Active PPPoE session count & list
 * - System resource (CPU, RAM, uptime)
 * - Router identity
 * - Interface stats (rx-byte / tx-byte counters)
 *
 * Traffic throughput is calculated client-side by diffing consecutive byte counters.
 */
export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const [sessions, rawResource, rawIdentity, ifaces] = await Promise.all([
      getActivePPPoESessions().catch(() => []),
      getSystemResource().catch(() => ({} as SystemResource)),
      getRouterIdentity().catch(() => ({} as RouterIdentity)),
      getInterfaceStats().catch(() => []),
    ]);

    const resource = rawResource as SystemResource;
    const identity = rawIdentity as RouterIdentity;

    const cpuLoad    = Number(resource["cpu-load"]    ?? 0);
    const freeMemory = Number(resource["free-memory"] ?? 0);
    const totalMemory= Number(resource["total-memory"]?? 0);
    const usedMemory = totalMemory - freeMemory;
    const memoryUsedPct = totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

    // Map interface stats — include all running, non-disabled interfaces
    const interfaceStats = ifaces
      .filter((iface) => iface.running === "true" && iface.disabled === "false")
      .map((iface) => ({
        name:     iface.name,
        type:     iface.type,
        rxBytes:  Number(iface["rx-byte"]   ?? 0),
        txBytes:  Number(iface["tx-byte"]   ?? 0),
        rxPackets:Number(iface["rx-packet"] ?? 0),
        txPackets:Number(iface["tx-packet"] ?? 0),
      }));

    // Aggregate totals across all running interfaces
    const totalRxBytes = interfaceStats.reduce((s, i) => s + i.rxBytes, 0);
    const totalTxBytes = interfaceStats.reduce((s, i) => s + i.txBytes, 0);

    return NextResponse.json({
      ok: true,
      timestamp,
      router: {
        name:      identity.name       ?? "MikroTik",
        version:   resource.version    ?? "Unknown",
        uptime:    resource.uptime     ?? "Unknown",
        boardName: resource["board-name"] ?? "Unknown",
        platform:  resource.platform   ?? "Unknown",
      },
      sessions: {
        active: sessions.length,
        list: sessions.slice(0, 50).map((s) => ({
          user:     s.name ?? s.user ?? "unknown",
          address:  s.address   ?? "—",
          uptime:   s.uptime    ?? "—",
          callerId: s["caller-id"] ?? "—",
        })),
      },
      system: {
        cpuLoad,
        memoryUsedPct,
        freeMemoryMb:  Math.round(freeMemory  / 1024 / 1024),
        totalMemoryMb: Math.round(totalMemory / 1024 / 1024),
        usedMemoryMb:  Math.round(usedMemory  / 1024 / 1024),
      },
      traffic: {
        // Cumulative byte counters — client diffs these to get throughput
        totalRxBytes,
        totalTxBytes,
        interfaces: interfaceStats,
      },
    });
  } catch (error: any) {
    const isMikrotikError = error instanceof MikrotikError;
    console.error("[MikroTik Realtime Route Error]:", error);

    return NextResponse.json(
      {
        ok: false,
        timestamp,
        error:  error instanceof Error ? error.message : "Failed to connect to MikroTik.",
        code: isMikrotikError ? error.code : "UNKNOWN",
      },
      { status: 503 }
    );
  }
}
