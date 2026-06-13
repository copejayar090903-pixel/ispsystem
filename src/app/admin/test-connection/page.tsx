"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Laptop,
  Network,
  RefreshCw,
  Router,
  Server,
  Settings,
  UserCheck,
  UserX,
  Wifi,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";

type DiagnosticsResult = {
  db: {
    connected: boolean;
    latencyMs: number;
    stats: {
      customers: number;
      plans: number;
      bills: number;
      payments: number;
    };
    error: string | null;
  };
  mikrotik: {
    connected: boolean;
    latencyMs: number;
    identity?: { name?: string };
    resource?: {
      uptime?: string;
      version?: string;
      "cpu-load"?: string;
      "free-memory"?: string;
      "total-memory"?: string;
      "board-name"?: string;
    };
    activeSessionsCount: number;
    profilesCount: number;
    secretsCount: number;
    error: string | null;
  };
  anomalies: {
    missingInMikrotik: Array<{
      customerId: string;
      name: string;
      pppoe_username: string;
      expectedProfile: string;
      status: string;
    }>;
    orphanedInMikrotik: Array<{
      id: string;
      name: string;
      profile: string;
      comment: string;
      disabled: boolean;
    }>;
    statusMismatches: Array<{
      customerId: string;
      name: string;
      pppoe_username: string;
      dbStatus: string;
      routerDisabled: boolean;
      details: string;
    }>;
    profileMismatches: Array<{
      customerId: string;
      name: string;
      pppoe_username: string;
      dbProfile: string;
      routerProfile: string;
      details: string;
    }>;
  };
};

export default function ConnectionTestPage() {
  const [data, setData] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "missing" | "orphaned" | "status" | "profiles">("summary");

  async function runDiagnostics() {
    setLoading(true);
    try {
      const response = await fetch("/api/test-connection", { cache: "no-store" });
      const payload = await response.json();
      setData(payload);

      if (payload.db.connected && payload.mikrotik.connected) {
        const totalAnomalies =
          payload.anomalies.missingInMikrotik.length +
          payload.anomalies.orphanedInMikrotik.length +
          payload.anomalies.statusMismatches.length +
          payload.anomalies.profileMismatches.length;

        if (totalAnomalies === 0) {
          toast.success("All connections healthy and data is 100% synchronized!");
        } else {
          toast.warning(`Connections verified with ${totalAnomalies} synchronization anomalies detected.`);
        }
      } else {
        if (!payload.db.connected && !payload.mikrotik.connected) {
          toast.error("Critical Failure: Both Database and Router connections failed!");
        } else if (!payload.db.connected) {
          toast.error("Database Connection Failure: Check Supabase credentials.");
        } else {
          toast.error("Router Connection Failure: Check MikroTik API / VPN status.");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred while running diagnostics.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const db = data?.db;
  const mt = data?.mikrotik;
  const anomalies = data?.anomalies;

  const totalAnomaliesCount = anomalies
    ? anomalies.missingInMikrotik.length +
      anomalies.orphanedInMikrotik.length +
      anomalies.statusMismatches.length +
      anomalies.profileMismatches.length
    : 0;

  // CPU load and Memory formatting
  const cpuLoad = mt?.resource?.["cpu-load"] ? `${mt.resource["cpu-load"]}%` : "-";
  const getMemoryPercentage = () => {
    if (!mt?.resource?.["free-memory"] || !mt?.resource?.["total-memory"]) return 0;
    const free = Number(mt.resource["free-memory"]);
    const total = Number(mt.resource["total-memory"]);
    return Math.round(((total - free) / total) * 100);
  };
  const memoryFormatted = () => {
    if (!mt?.resource?.["free-memory"] || !mt?.resource?.["total-memory"]) return "-";
    const freeMb = Math.round(Number(mt.resource["free-memory"]) / 1024 / 1024);
    const totalMb = Math.round(Number(mt.resource["total-memory"]) / 1024 / 1024);
    return `${totalMb - freeMb}MB / ${totalMb}MB (${getMemoryPercentage()}%)`;
  };

  return (
    <>
      <PageHeader
        title="Connection Test"
        description="Verify system reachability, compute latency metrics, and test database to router configuration synchronisation."
        actions={
          <Button disabled={loading} onClick={() => void runDiagnostics()} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Running Tests..." : "Run Diagnostics"}
          </Button>
        }
      />

      {/* Network Topology Visualization */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/50 dark:border-slate-800/50">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-500" />
            Connection Topology Map
          </CardTitle>
          <CardDescription>Live routing paths and connection states</CardDescription>
        </CardHeader>
        <CardContent className="py-6 flex justify-center items-center">
          <div className="w-full max-w-2xl relative">
            <svg viewBox="0 0 600 180" className="w-full h-auto text-slate-300 dark:text-slate-700">
              <style>{`
                @keyframes dash {
                  to {
                    stroke-dashoffset: -20;
                  }
                }
                .animated-path-loading {
                  stroke-dasharray: 6 3;
                  animation: dash 1.2s linear infinite;
                }
              `}</style>
              
              {/* Paths */}
              {/* Browser -> Server */}
              <path
                d="M 80 90 L 220 90"
                stroke={loading ? "#3b82f6" : "#10b981"}
                strokeWidth="2"
                className={loading ? "animated-path-loading" : ""}
              />

              {/* Server -> Supabase DB */}
              <path
                d="M 280 70 C 320 35, 420 35, 480 50"
                fill="none"
                stroke={
                  loading
                    ? "#94a3b8"
                    : db?.connected
                    ? "#10b981"
                    : db?.error
                    ? "#ef4444"
                    : "#64748b"
                }
                strokeWidth="2"
                className={loading ? "animated-path-loading" : ""}
              />

              {/* Server -> MikroTik */}
              <path
                d="M 280 110 C 320 145, 420 145, 480 130"
                fill="none"
                stroke={
                  loading
                    ? "#94a3b8"
                    : mt?.connected
                    ? "#10b981"
                    : mt?.error
                    ? "#ef4444"
                    : "#64748b"
                }
                strokeWidth="2"
                className={loading ? "animated-path-loading" : ""}
              />

              {/* Browser Node */}
              <g transform="translate(40, 90)">
                <circle r="32" fill="currentColor" className="text-slate-100 dark:text-slate-900 border" stroke="currentColor" strokeWidth="2" />
                <foreignObject x="-20" y="-20" width="40" height="40">
                  <div className="flex items-center justify-center h-full text-slate-600 dark:text-slate-300">
                    <Laptop className="h-6 w-6" />
                  </div>
                </foreignObject>
                <text y="50" textAnchor="middle" className="text-[10px] font-semibold fill-slate-700 dark:fill-slate-300">ADMIN CONSOLE</text>
              </g>

              {/* Web Server Node */}
              <g transform="translate(250, 90)">
                <circle r="32" fill="currentColor" className="text-slate-100 dark:text-slate-900" stroke={loading ? "#3b82f6" : "#10b981"} strokeWidth="2" />
                <foreignObject x="-20" y="-20" width="40" height="40">
                  <div className="flex items-center justify-center h-full text-slate-700 dark:text-slate-200">
                    <Server className="h-6 w-6" />
                  </div>
                </foreignObject>
                <text y="50" textAnchor="middle" className="text-[10px] font-semibold fill-slate-700 dark:fill-slate-300">ISP SERVER API</text>
              </g>

              {/* Supabase DB Node */}
              <g transform="translate(520, 50)">
                <circle
                  r="32"
                  fill="currentColor"
                  className="text-slate-100 dark:text-slate-900"
                  stroke={
                    loading
                      ? "#94a3b8"
                      : db?.connected
                      ? "#10b981"
                      : db?.error
                      ? "#ef4444"
                      : "#64748b"
                  }
                  strokeWidth="2"
                />
                <foreignObject x="-20" y="-20" width="40" height="40">
                  <div className="flex items-center justify-center h-full text-slate-700 dark:text-slate-200">
                    <Database className="h-6 w-6" />
                  </div>
                </foreignObject>
                <text y="50" textAnchor="middle" className="text-[10px] font-semibold fill-slate-700 dark:fill-slate-300">SUPABASE DB</text>
                {db && (
                  <g transform="translate(18, -18)">
                    <circle r="8" fill={db.connected ? "#10b981" : "#ef4444"} />
                    <path
                      d={db.connected ? "M -3 0 L -1 2 L 3 -2" : "M -2 -2 L 2 2 M 2 -2 L -2 2"}
                      stroke="white"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </g>
                )}
              </g>

              {/* MikroTik Node */}
              <g transform="translate(520, 130)">
                <circle
                  r="32"
                  fill="currentColor"
                  className="text-slate-100 dark:text-slate-900"
                  stroke={
                    loading
                      ? "#94a3b8"
                      : mt?.connected
                      ? "#10b981"
                      : mt?.error
                      ? "#ef4444"
                      : "#64748b"
                  }
                  strokeWidth="2"
                />
                <foreignObject x="-20" y="-20" width="40" height="40">
                  <div className="flex items-center justify-center h-full text-slate-700 dark:text-slate-200">
                    <Router className="h-6 w-6" />
                  </div>
                </foreignObject>
                <text y="50" textAnchor="middle" className="text-[10px] font-semibold fill-slate-700 dark:fill-slate-300">MIKROTIK ROUTER</text>
                {mt && (
                  <g transform="translate(18, -18)">
                    <circle r="8" fill={mt.connected ? "#10b981" : "#ef4444"} />
                    <path
                      d={mt.connected ? "M -3 0 L -1 2 L 3 -2" : "M -2 -2 L 2 2 M 2 -2 L -2 2"}
                      stroke="white"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </g>
                )}
              </g>
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Connection States */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Supabase Database Connection Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>ISP Billing Database</CardTitle>
                  <CardDescription>Supabase PostgreSQL + Schema</CardDescription>
                </div>
              </div>
              {db ? (
                db.connected ? (
                  <Badge variant="success" className="gap-1.5"><CheckCircle2 className="h-3 w-3" /> ONLINE</Badge>
                ) : (
                  <Badge variant="danger" className="gap-1.5"><XCircle className="h-3 w-3" /> OFFLINE</Badge>
                )
              ) : (
                <Badge variant="muted" className="animate-pulse">TESTING...</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            {db ? (
              db.connected ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/40 dark:border-slate-800/40">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Response Speed</p>
                      <p className="text-xl font-bold flex items-center gap-1.5 mt-1">
                        <Clock className="h-4 w-4 text-emerald-500" />
                        {db.latencyMs} ms
                      </p>
                    </div>
                    <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/40 dark:border-slate-800/40">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Customers</p>
                      <p className="text-xl font-bold mt-1">{db.stats.customers}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800/60 pt-4">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Database Inventory Status
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-slate-50 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800/20">
                        <span className="block text-slate-400">Plans</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{db.stats.plans}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800/20">
                        <span className="block text-slate-400">Bills</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{db.stats.bills}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800/20">
                        <span className="block text-slate-400">Payments</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{db.stats.payments}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl p-4 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 space-y-2">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Connection failed</p>
                      <p className="text-xs mt-1 leading-relaxed break-words">{db.error}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-2xl animate-pulse" />
                <div className="h-24 bg-slate-100 dark:bg-slate-900 rounded-2xl animate-pulse" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* MikroTik Router Connection Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Router className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>MikroTik RouterOS</CardTitle>
                  <CardDescription>API via WireGuard/VPN</CardDescription>
                </div>
              </div>
              {mt ? (
                mt.connected ? (
                  <Badge variant="success" className="gap-1.5"><CheckCircle2 className="h-3 w-3" /> ONLINE</Badge>
                ) : (
                  <Badge variant="danger" className="gap-1.5"><XCircle className="h-3 w-3" /> OFFLINE</Badge>
                )
              ) : (
                <Badge variant="muted" className="animate-pulse">TESTING...</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            {mt ? (
              mt.connected ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/40 dark:border-slate-800/40">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Response Speed</p>
                      <p className="text-xl font-bold flex items-center gap-1.5 mt-1">
                        <Clock className="h-4 w-4 text-blue-500" />
                        {mt.latencyMs} ms
                      </p>
                    </div>
                    <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/40 dark:border-slate-800/40">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Router Name</p>
                      <p className="text-sm font-bold mt-1.5 truncate">{mt.identity?.name || "MikroTik"}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800/60 pt-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Router Health & PPPoE Inventory
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                        <span className="text-slate-400">Board Name</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{mt.resource?.["board-name"] || "-"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                        <span className="text-slate-400">RouterOS v.</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{mt.resource?.version || "-"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                        <span className="text-slate-400">CPU Load</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{cpuLoad}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                        <span className="text-slate-400">Active PPPoE</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{mt.activeSessionsCount} active</span>
                      </div>
                      <div className="col-span-2 flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                        <span className="text-slate-400">Memory</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{memoryFormatted()}</span>
                      </div>
                      <div className="flex justify-between py-1 col-span-2">
                        <span className="text-slate-400">PPPoE Accounts / Profiles</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{mt.secretsCount} accounts | {mt.profilesCount} profiles</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl p-4 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 space-y-2">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Router unreachable</p>
                      <p className="text-xs mt-1 leading-relaxed break-words">{mt.error}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded-2xl animate-pulse" />
                <div className="h-24 bg-slate-100 dark:bg-slate-900 rounded-2xl animate-pulse" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Synchronization Diagnostics & Reconcile Panel */}
      {db?.connected && mt?.connected && anomalies && (
        <Card className="shadow-md">
          <CardHeader className="border-b border-slate-200/50 dark:border-slate-800/50">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Database & Router Synchronisation Console
                </CardTitle>
                <CardDescription>
                  Checks alignment between billing customer records and PPPoE profiles on MikroTik
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Sync Anomalies:</span>
                {totalAnomaliesCount === 0 ? (
                  <Badge variant="success" className="gap-1 font-semibold"><CheckCircle2 className="h-3 w-3" /> 0 Issues</Badge>
                ) : (
                  <Badge variant="danger" className="gap-1 font-semibold"><AlertTriangle className="h-3 w-3" /> {totalAnomaliesCount} Mismatches</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Tabs Selector */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
              <button
                onClick={() => setActiveTab("summary")}
                className={`flex-1 min-w-[120px] py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 px-4 transition ${
                  activeTab === "summary"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Diagnostic Summary
              </button>
              <button
                onClick={() => setActiveTab("missing")}
                className={`py-3 min-w-[120px] text-xs font-semibold uppercase tracking-wider text-center border-b-2 px-4 transition flex items-center justify-center gap-1.5 ${
                  activeTab === "missing"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Missing in Router
                {anomalies.missingInMikrotik.length > 0 && (
                  <span className="h-4 w-4 text-[10px] rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center font-bold">
                    {anomalies.missingInMikrotik.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("orphaned")}
                className={`py-3 min-w-[120px] text-xs font-semibold uppercase tracking-wider text-center border-b-2 px-4 transition flex items-center justify-center gap-1.5 ${
                  activeTab === "orphaned"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Orphaned in Router
                {anomalies.orphanedInMikrotik.length > 0 && (
                  <span className="h-4 w-4 text-[10px] rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center font-bold">
                    {anomalies.orphanedInMikrotik.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("status")}
                className={`py-3 min-w-[120px] text-xs font-semibold uppercase tracking-wider text-center border-b-2 px-4 transition flex items-center justify-center gap-1.5 ${
                  activeTab === "status"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Status Discrepancies
                {anomalies.statusMismatches.length > 0 && (
                  <span className="h-4 w-4 text-[10px] rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center font-bold">
                    {anomalies.statusMismatches.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("profiles")}
                className={`py-3 min-w-[120px] text-xs font-semibold uppercase tracking-wider text-center border-b-2 px-4 transition flex items-center justify-center gap-1.5 ${
                  activeTab === "profiles"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Profile Mismatches
                {anomalies.profileMismatches.length > 0 && (
                  <span className="h-4 w-4 text-[10px] rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center font-bold">
                    {anomalies.profileMismatches.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6">
              {activeTab === "summary" && (
                <div className="space-y-6">
                  {totalAnomaliesCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                      <div className="h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Database and Router aligned</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                          Excellent! No discrepancies found. All billing accounts have corresponding, active, correctly-configured secrets on the MikroTik router.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 flex gap-3 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-semibold">Desynchronization Detected</h4>
                          <p className="text-xs leading-relaxed mt-1">
                            Your billing database and the router have drifted. Unsynchronized states can lead to service leakage (unpaid accounts enjoying internet access) or support calls (paid accounts missing secrets). Click on each tab to inspect specific items.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <AnomalySummaryMetric
                          icon={UserX}
                          title="Missing Secrets"
                          count={anomalies.missingInMikrotik.length}
                          color="text-red-500"
                          bg="bg-red-500/10"
                          onClick={() => setActiveTab("missing")}
                          description="Active accounts in DB missing in MikroTik."
                        />
                        <AnomalySummaryMetric
                          icon={UserCheck}
                          title="Orphaned Secrets"
                          count={anomalies.orphanedInMikrotik.length}
                          color="text-orange-500"
                          bg="bg-orange-500/10"
                          onClick={() => setActiveTab("orphaned")}
                          description="Router secrets without DB customers."
                        />
                        <AnomalySummaryMetric
                          icon={Settings}
                          title="Status Mismatches"
                          count={anomalies.statusMismatches.length}
                          color="text-amber-500"
                          bg="bg-amber-500/10"
                          onClick={() => setActiveTab("status")}
                          description="Disabled/suspended accounts mismatch."
                        />
                        <AnomalySummaryMetric
                          icon={Wifi}
                          title="Profile Mismatches"
                          count={anomalies.profileMismatches.length}
                          color="text-blue-500"
                          bg="bg-blue-500/10"
                          onClick={() => setActiveTab("profiles")}
                          description="Assigned speed profiles mismatch."
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Missing in Router Tab */}
              {activeTab === "missing" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Database Accounts Missing from Router</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        These customers exist in the ISP Billing database but do not have an active PPPoE secret on the MikroTik router.
                      </p>
                    </div>
                  </div>

                  {anomalies.missingInMikrotik.length === 0 ? (
                    <p className="text-center py-6 text-sm text-slate-500">No missing secrets found.</p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer Name</TableHead>
                            <TableHead>PPPoE Username</TableHead>
                            <TableHead>Expected Profile</TableHead>
                            <TableHead>DB Status</TableHead>
                            <TableHead className="text-right">Action Recommended</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {anomalies.missingInMikrotik.map((item) => (
                            <TableRow key={item.customerId}>
                              <TableCell className="font-semibold">{item.name}</TableCell>
                              <TableCell className="font-mono text-xs">{item.pppoe_username}</TableCell>
                              <TableCell>{item.expectedProfile}</TableCell>
                              <TableCell>
                                <StatusBadge status={item.status} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="muted" className="text-red-500 border-red-500/30 bg-red-500/5">
                                  Create Secret on Router
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Orphaned in Router Tab */}
              {activeTab === "orphaned" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Orphaned Router Secrets</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Secrets that exist on the MikroTik router but do not correspond to any customer in the ISP Billing database (potential rogue or leftover accounts).
                    </p>
                  </div>

                  {anomalies.orphanedInMikrotik.length === 0 ? (
                    <p className="text-center py-6 text-sm text-slate-500">No orphaned router secrets found.</p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Router Account Name</TableHead>
                            <TableHead>Profile</TableHead>
                            <TableHead>Comment</TableHead>
                            <TableHead>Router Status</TableHead>
                            <TableHead className="text-right">Action Recommended</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {anomalies.orphanedInMikrotik.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs font-semibold">{item.name}</TableCell>
                              <TableCell>{item.profile}</TableCell>
                              <TableCell className="text-slate-500">{item.comment || "-"}</TableCell>
                              <TableCell>
                                {item.disabled ? (
                                  <Badge variant="muted" className="text-slate-400">Disabled</Badge>
                                ) : (
                                  <Badge variant="success">Enabled</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="muted" className="text-orange-500 border-orange-500/30 bg-orange-500/5">
                                  Remove from Router
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Status Discrepancies Tab */}
              {activeTab === "status" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Status Discrepancies (Active / Suspended Drift)</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Accounts whose active/disabled status in the billing system differs from their actual status on the MikroTik router.
                    </p>
                  </div>

                  {anomalies.statusMismatches.length === 0 ? (
                    <p className="text-center py-6 text-sm text-slate-500">No status mismatches found.</p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>PPPoE Username</TableHead>
                            <TableHead>DB Status</TableHead>
                            <TableHead>Router Secret State</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead className="text-right">Action Recommended</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {anomalies.statusMismatches.map((item) => (
                            <TableRow key={item.customerId}>
                              <TableCell className="font-semibold">{item.name}</TableCell>
                              <TableCell className="font-mono text-xs">{item.pppoe_username}</TableCell>
                              <TableCell>
                                <StatusBadge status={item.dbStatus} />
                              </TableCell>
                              <TableCell>
                                {item.routerDisabled ? (
                                  <Badge variant="muted" className="text-slate-400">Disabled</Badge>
                                ) : (
                                  <Badge variant="success">Enabled</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-slate-500 text-xs">{item.details}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="muted" className="text-amber-500 border-amber-500/30 bg-amber-500/5">
                                  {item.routerDisabled ? "Enable Router Secret" : "Disable Router Secret"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Profile Mismatches Tab */}
              {activeTab === "profiles" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Speed Profile / Plan Mismatches</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Customers whose billing plan (speed profile) doesn't match the PPPoE profile active on the router (e.g. paying for 30Mbps but on a 50Mbps profile).
                    </p>
                  </div>

                  {anomalies.profileMismatches.length === 0 ? (
                    <p className="text-center py-6 text-sm text-slate-500">No profile mismatches found.</p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>PPPoE Username</TableHead>
                            <TableHead>DB Plan speed Profile</TableHead>
                            <TableHead>Router PPPoE Profile</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead className="text-right">Action Recommended</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {anomalies.profileMismatches.map((item) => (
                            <TableRow key={item.customerId}>
                              <TableCell className="font-semibold">{item.name}</TableCell>
                              <TableCell className="font-mono text-xs">{item.pppoe_username}</TableCell>
                              <TableCell className="font-semibold text-blue-600 dark:text-blue-400">{item.dbProfile}</TableCell>
                              <TableCell className="font-semibold text-orange-600 dark:text-orange-400">{item.routerProfile}</TableCell>
                              <TableCell className="text-slate-500 text-xs">{item.details}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="muted" className="text-blue-500 border-blue-500/30 bg-blue-500/5">
                                  Sync Profile to Router
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AnomalySummaryMetric({
  icon: Icon,
  title,
  count,
  color,
  bg,
  onClick,
  description,
}: {
  icon: typeof UserX;
  title: string;
  count: number;
  color: string;
  bg: string;
  onClick: () => void;
  description: string;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/40 rounded-2xl p-4 cursor-pointer hover:border-blue-500/40 dark:hover:border-blue-500/30 transition flex flex-col justify-between"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</span>
        <div className={`h-8 w-8 rounded-xl ${bg} ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-extrabold tracking-tight">{count}</p>
        <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{description}</p>
      </div>
      <button className={`flex items-center gap-1 text-[10px] font-bold ${color} uppercase tracking-wider mt-4`}>
        View Details <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
