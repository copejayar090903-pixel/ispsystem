"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Loader2, RefreshCw, Wifi, WifiOff, Server, Network, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type RouterNode = {
  name: string; online: boolean; version: string | null;
  uptime: string | null; cpuLoad: string | null;
  freeMemory: string | null; totalMemory: string | null;
};
type IfaceNode = {
  id: string; name: string; type: string;
  running: boolean; disabled: boolean;
  rxBytes: number; txBytes: number;
};
type ClientNode = {
  id: string; username: string; fullName: string; profile: string;
  online: boolean; expired: boolean; disabled: boolean;
  ipAddress: string | null; uptime: string | null; callerId: string | null;
  dueDate: string | null; planName: string | null; status: string;
  ifaceId: string | null;
};
type TopologyData = { router: RouterNode; interfaces: IfaceNode[]; clients: ClientNode[] };

// ─── Layout constants ────────────────────────────────────────────────────────
const ROUTER_X    = 600;
const ROUTER_Y    = 80;
const ROUTER_R    = 48;
const IFACE_Y     = 230;
const CLIENT_Y    = 420;
const NODE_R      = 32;
const CLIENT_R    = 26;

// ─── Colour helpers ───────────────────────────────────────────────────────────
function statusColor(node: ClientNode) {
  if (!node.online || node.disabled) return { fill: "#ef4444", stroke: "#b91c1c", text: "#fff" }; // red
  if (node.expired)                  return { fill: "#f59e0b", stroke: "#d97706", text: "#fff" }; // amber
  return                               { fill: "#10b981", stroke: "#059669", text: "#fff" };       // green
}

function ifaceColor(iface: IfaceNode) {
  if (iface.disabled || !iface.running) return { fill: "#94a3b8", stroke: "#64748b", text: "#fff" };
  return { fill: "#3b82f6", stroke: "#2563eb", text: "#fff" };
}

function fmtBytes(b: number) {
  if (b < 1024)        return `${b} B`;
  if (b < 1024 ** 2)   return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3)   return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return                      `${(b / 1024 ** 3).toFixed(2)} GB`;
}

// ─── Tooltip component ────────────────────────────────────────────────────────
function Tooltip({ x, y, w, children }: { x: number; y: number; w: number; children: React.ReactNode }) {
  return (
    <foreignObject x={x} y={y} width={w} height={220} style={{ overflow: "visible" }}>
      <div
        style={{ pointerEvents: "none" }}
        className="w-52 rounded-2xl border border-slate-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/95 shadow-2xl backdrop-blur-xl p-3 text-xs"
      >
        {children}
      </div>
    </foreignObject>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TopologyPage() {
  const router           = useRouter();
  const [data, setData]  = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ type: "router" | "iface" | "client"; id: string } | null>(null);
  const svgRef           = useRef<SVGSVGElement>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/topology", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load topology");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  // ── Compute layout ──────────────────────────────────────────────────────────
  const ifaces  = data?.interfaces ?? [];
  const clients = data?.clients    ?? [];

  // Distribute interfaces evenly across SVG width
  const SVG_W   = 1200;
  const ifaceGap = SVG_W / (ifaces.length + 1);
  const ifacePositions: Record<string, { x: number; y: number }> = {};
  ifaces.forEach((iface, i) => {
    ifacePositions[iface.id] = { x: ifaceGap * (i + 1), y: IFACE_Y };
  });

  // Group clients by interface
  const clientsByIface: Record<string, ClientNode[]> = {};
  for (const c of clients) {
    const key = c.ifaceId ?? (ifaces[0]?.id ?? "unassigned");
    if (!clientsByIface[key]) clientsByIface[key] = [];
    clientsByIface[key].push(c);
  }
  // Unassigned clients go to first iface or a fallback column
  if (clients.length > 0 && ifaces.length === 0) {
    clientsByIface["unassigned"] = clients;
    ifacePositions["unassigned"] = { x: SVG_W / 2, y: IFACE_Y };
  }

  const clientPositions: Record<string, { x: number; y: number }> = {};
  for (const [ifaceId, group] of Object.entries(clientsByIface)) {
    const base = ifacePositions[ifaceId]?.x ?? SVG_W / 2;
    const step = Math.min(80, (SVG_W - 80) / Math.max(group.length, 1));
    const totalW = (group.length - 1) * step;
    group.forEach((c, i) => {
      clientPositions[c.id] = { x: base - totalW / 2 + i * step, y: CLIENT_Y + (i % 2) * 50 };
    });
  }

  const SVG_H = CLIENT_Y + 200;

  const hoveredClient = hovered?.type === "client" ? clients.find(c => c.id === hovered.id) : null;
  const hoveredIface  = hovered?.type === "iface"  ? ifaces.find(i => i.id === hovered.id)  : null;

  return (
    <>
      <PageHeader
        title="Network Topology"
        description="Live map of your MikroTik router, interfaces, VLANs, and PPPoE subscriber connections."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void fetchData(); }} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
        {[
          { color: "bg-emerald-500", label: "Online" },
          { color: "bg-amber-500",   label: "Expired / Overdue" },
          { color: "bg-rose-500",    label: "Offline / Disabled" },
          { color: "bg-blue-500",    label: "Interface / VLAN" },
          { color: "bg-slate-400",   label: "Interface Down" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${color}`} /> {label}
          </span>
        ))}
      </div>

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Router",      value: data.router.name,                     icon: <Server className="h-4 w-4 text-blue-500" /> },
            { label: "Interfaces",  value: `${ifaces.filter(i => i.running).length}/${ifaces.length} up`, icon: <Network className="h-4 w-4 text-blue-400" /> },
            { label: "Online PPPoE",value: `${clients.filter(c => c.online).length}/${clients.length}`, icon: <Wifi className="h-4 w-4 text-emerald-500" /> },
            { label: "Offline/Expired", value: `${clients.filter(c => !c.online || c.expired).length}`, icon: <WifiOff className="h-4 w-4 text-rose-500" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              {icon}
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Could not reach MikroTik router</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/50 shadow-sm">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            height={SVG_H}
            className="select-none"
            style={{ fontFamily: "inherit", minWidth: 700 }}
          >
            {/* ── Grid background ─────────────────────────────────── */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-slate-100 dark:text-slate-800" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#grid)" />

            {/* ── Router → Interface lines ─────────────────────────── */}
            {ifaces.map((iface) => {
              const ip = ifacePositions[iface.id];
              if (!ip) return null;
              const isHoveredIface = hovered?.id === iface.id;
              return (
                <line key={`r-${iface.id}`}
                  x1={ROUTER_X} y1={ROUTER_Y + ROUTER_R}
                  x2={ip.x} y2={ip.y - NODE_R}
                  stroke={iface.disabled || !iface.running ? "#94a3b8" : isHoveredIface ? "#3b82f6" : "#cbd5e1"}
                  strokeWidth={isHoveredIface ? 2.5 : 1.5}
                  strokeDasharray={iface.disabled ? "6 4" : undefined}
                />
              );
            })}

            {/* ── Interface → Client lines ─────────────────────────── */}
            {clients.map((client) => {
              const cp = clientPositions[client.id];
              const ifaceId = client.ifaceId ?? (ifaces[0]?.id ?? "unassigned");
              const ip = ifacePositions[ifaceId];
              if (!cp || !ip) return null;
              const col = statusColor(client);
              const isHov = hovered?.id === client.id;
              return (
                <line key={`l-${client.id}`}
                  x1={ip.x} y1={ip.y + NODE_R}
                  x2={cp.x} y2={cp.y - CLIENT_R}
                  stroke={isHov ? col.fill : (!client.online ? "#fca5a5" : "#cbd5e1")}
                  strokeWidth={isHov ? 2.5 : 1.5}
                  strokeDasharray={!client.online ? "5 3" : undefined}
                  opacity={!client.online ? 0.6 : 1}
                />
              );
            })}

            {/* ── Router node ──────────────────────────────────────── */}
            <g
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered({ type: "router", id: "router" })}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={ROUTER_X} cy={ROUTER_Y} r={ROUTER_R + 8}
                fill={data?.router.online ? "rgba(59,130,246,0.12)" : "rgba(239,68,68,0.12)"}
                className="animate-pulse"
              />
              <circle
                cx={ROUTER_X} cy={ROUTER_Y} r={ROUTER_R}
                fill={data?.router.online ? "#1d4ed8" : "#b91c1c"}
                stroke={data?.router.online ? "#93c5fd" : "#fca5a5"}
                strokeWidth={2}
              />
              <text x={ROUTER_X} y={ROUTER_Y + 5} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="700">
                {data?.router.name?.slice(0, 10) ?? "Router"}
              </text>
              <text x={ROUTER_X} y={ROUTER_Y + 20} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9}>
                {data?.router.online ? `CPU ${data.router.cpuLoad ?? "?"}%` : "OFFLINE"}
              </text>
            </g>

            {/* Router tooltip */}
            {hovered?.type === "router" && data && (
              <Tooltip x={ROUTER_X - 104} y={ROUTER_Y + ROUTER_R + 12} w={208}>
                <p className="font-bold text-slate-900 dark:text-white mb-2">{data.router.name}</p>
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between"><span>Status</span><span className={data.router.online ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{data.router.online ? "Online" : "Offline"}</span></div>
                  {data.router.version  && <div className="flex justify-between"><span>Version</span><span className="font-mono text-xs">{data.router.version}</span></div>}
                  {data.router.uptime   && <div className="flex justify-between"><span>Uptime</span><span>{data.router.uptime}</span></div>}
                  {data.router.cpuLoad  && <div className="flex justify-between"><span>CPU</span><span>{data.router.cpuLoad}%</span></div>}
                </div>
              </Tooltip>
            )}

            {/* ── Interface nodes ───────────────────────────────────── */}
            {ifaces.map((iface) => {
              const pos = ifacePositions[iface.id];
              if (!pos) return null;
              const col = ifaceColor(iface);
              const isHov = hovered?.id === iface.id;
              return (
                <g key={iface.id}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered({ type: "iface", id: iface.id })}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHov && <circle cx={pos.x} cy={pos.y} r={NODE_R + 6} fill="rgba(59,130,246,0.15)" />}
                  <circle
                    cx={pos.x} cy={pos.y} r={NODE_R}
                    fill={col.fill} stroke={col.stroke} strokeWidth={1.5}
                  />
                  <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="600">
                    {iface.name.length > 10 ? iface.name.slice(0, 10) + "…" : iface.name}
                  </text>
                  {/* Status dot */}
                  <circle cx={pos.x + NODE_R - 6} cy={pos.y - NODE_R + 6}
                    r={6} fill={iface.running && !iface.disabled ? "#10b981" : "#ef4444"}
                    stroke="#fff" strokeWidth={1.5}
                  />
                </g>
              );
            })}

            {/* Interface tooltip */}
            {hoveredIface && (() => {
              const pos = ifacePositions[hoveredIface.id];
              if (!pos) return null;
              return (
                <Tooltip x={pos.x - 104} y={pos.y + NODE_R + 8} w={208}>
                  <p className="font-bold text-slate-900 dark:text-white mb-2">{hoveredIface.name}</p>
                  <div className="space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between"><span>Type</span><span className="font-mono">{hoveredIface.type}</span></div>
                    <div className="flex justify-between"><span>Status</span><span className={hoveredIface.running && !hoveredIface.disabled ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{hoveredIface.running && !hoveredIface.disabled ? "Running" : "Down"}</span></div>
                    <div className="flex justify-between"><span>RX</span><span>{fmtBytes(hoveredIface.rxBytes)}</span></div>
                    <div className="flex justify-between"><span>TX</span><span>{fmtBytes(hoveredIface.txBytes)}</span></div>
                    <div className="flex justify-between"><span>Clients</span><span>{(clientsByIface[hoveredIface.id] ?? []).length}</span></div>
                  </div>
                </Tooltip>
              );
            })()}

            {/* ── Client nodes ─────────────────────────────────────── */}
            {clients.map((client) => {
              const pos = clientPositions[client.id];
              if (!pos) return null;
              const col = statusColor(client);
              const isHov = hovered?.id === client.id;
              return (
                <g key={client.id}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered({ type: "client", id: client.id })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => router.push("/admin/customers")}
                >
                  {isHov && <circle cx={pos.x} cy={pos.y} r={CLIENT_R + 6} fill={`${col.fill}25`} />}
                  <circle
                    cx={pos.x} cy={pos.y} r={CLIENT_R}
                    fill={col.fill} stroke={col.stroke} strokeWidth={1.5}
                    opacity={!client.online && !client.expired ? 0.7 : 1}
                  />
                  {/* Username label */}
                  <text x={pos.x} y={pos.y + 3} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="600"
                    style={{ maxWidth: CLIENT_R * 2 }}>
                    {client.username.length > 10 ? client.username.slice(0, 9) + "…" : client.username}
                  </text>
                  {/* Status dot */}
                  <circle
                    cx={pos.x + CLIENT_R - 5} cy={pos.y - CLIENT_R + 5}
                    r={5} fill={client.online && !client.expired ? "#10b981" : "#ef4444"}
                    stroke="#fff" strokeWidth={1.5}
                  />
                  {/* Offline X overlay */}
                  {!client.online && (
                    <text x={pos.x} y={pos.y - CLIENT_R - 6} textAnchor="middle" fill="#ef4444" fontSize={8} fontWeight="700">
                      ✕ offline
                    </text>
                  )}
                </g>
              );
            })}

            {/* Client tooltip */}
            {hoveredClient && (() => {
              const pos = clientPositions[hoveredClient.id];
              if (!pos) return null;
              const tooltipX = Math.min(pos.x - 104, SVG_W - 218);
              const tooltipY = pos.y - CLIENT_R - 180;
              return (
                <Tooltip x={tooltipX} y={Math.max(8, tooltipY)} w={208}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-slate-900 dark:text-white truncate flex-1 mr-2">{hoveredClient.fullName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      hoveredClient.online && !hoveredClient.expired
                        ? "bg-emerald-100 text-emerald-700"
                        : hoveredClient.expired
                          ? "bg-amber-100 text-amber-700"
                          : "bg-rose-100 text-rose-700"
                    }`}>
                      {hoveredClient.online && !hoveredClient.expired ? "Online" : hoveredClient.expired ? "Expired" : "Offline"}
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between"><span>Username</span><span className="font-mono text-xs">{hoveredClient.username}</span></div>
                    {hoveredClient.ipAddress && <div className="flex justify-between"><span>IP</span><span className="font-mono text-xs">{hoveredClient.ipAddress}</span></div>}
                    {hoveredClient.uptime    && <div className="flex justify-between"><span>Uptime</span><span>{hoveredClient.uptime}</span></div>}
                    {hoveredClient.planName  && <div className="flex justify-between"><span>Plan</span><span>{hoveredClient.planName}</span></div>}
                    {hoveredClient.dueDate   && <div className="flex justify-between"><span>Due</span><span>{new Date(hoveredClient.dueDate).toLocaleDateString()}</span></div>}
                    {hoveredClient.callerId  && <div className="flex justify-between"><span>MAC</span><span className="font-mono text-xs">{hoveredClient.callerId.split(";")[0]}</span></div>}
                  </div>
                  <p className="mt-2 text-xs text-blue-500 hover:underline cursor-pointer">Click to open customer record →</p>
                </Tooltip>
              );
            })()}
          </svg>
        </div>
      )}
    </>
  );
}
