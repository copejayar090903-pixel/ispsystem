"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  RefreshCw,
  Router,
  Signal,
  Cpu,
  MemoryStick,
  Clock,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatCard } from "@/src/components/admin/stat-card";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { formatCurrency } from "@/src/lib/utils";

const chartColors = ["#2563eb", "#10b981", "#f59e0b", "#64748b"];

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardData = {
  stats: {
    totalCustomers: number;
    activeCustomers: number;
    disconnectedCustomers: number;
    overdueAccounts: number;
    pendingPayments: number;
    monthlyRevenue: number;
    onlinePppoe: number;
    offlinePppoe: number;
  };
  revenueData: Array<{ month: string; revenue: number; target: number }>;
  paidUnpaidData: Array<{ name: string; value: number }>;
  growthData: Array<{ month: string; customers: number }>;
  planDistributionData: Array<{ name: string; customers: number }>;
  activityItems: Array<{ title: string; detail: string; time: string; type: string }>;
};

type MikrotikSnapshot = {
  time: string;
  cpuLoad: number;
  memoryUsedPct: number;
  activeSessions: number;
  rxMbps: number;
  txMbps: number;
};

type MikrotikRealtimeData = {
  ok: boolean;
  timestamp: string;
  error?: string;
  code?: string;
  router?: {
    name: string;
    version: string;
    uptime: string;
    boardName: string;
    platform: string;
  };
  sessions?: {
    active: number;
    list: Array<{ user: string; address: string; uptime: string; callerId: string; bytesIn: number; bytesOut: number }>;
  };
  system?: {
    cpuLoad: number;
    memoryUsedPct: number;
    freeMemoryMb: number;
    totalMemoryMb: number;
    usedMemoryMb: number;
  };
  traffic?: {
    totalRxBytes: number;
    totalTxBytes: number;
    interfaces: Array<{ name: string; type: string; rxBytes: number; txBytes: number }>;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 3_000;  // 3 second realtime
const MAX_HISTORY_POINTS = 60;     // last 60 points (~3 min window)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // MikroTik realtime state
  const [mikrotik, setMikrotik]               = useState<MikrotikRealtimeData | null>(null);
  const [mikrotikHistory, setMikrotikHistory] = useState<MikrotikSnapshot[]>([]);
  const [mikrotikConnected, setMikrotikConnected] = useState<boolean | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Store previous cumulative byte counters to compute throughput
  const prevBytesRef = useRef<{ rxBytes: number; txBytes: number; ts: number } | null>(null);

  // ── Dashboard data ─────────────────────────────────────────────────────────
  async function loadDashboardData() {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/stats", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to load dashboard data.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard stats.");
    } finally {
      setLoading(false);
    }
  }

  // ── MikroTik polling ────────────────────────────────────────────────────────
  const pollMikrotik = useCallback(async () => {
    try {
      const res = await fetch("/api/mikrotik/realtime", { cache: "no-store" });
      const payload: MikrotikRealtimeData = await res.json();

      setMikrotik(payload);
      setMikrotikConnected(payload.ok);

      if (payload.ok && payload.system && payload.sessions) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const nowTs = now.getTime();

        // Compute traffic throughput from byte counter diffs
        const rxBytes = payload.traffic?.totalRxBytes ?? 0;
        const txBytes = payload.traffic?.totalTxBytes ?? 0;
        let rxMbps = 0;
        let txMbps = 0;

        if (prevBytesRef.current) {
          const dtMs  = nowTs - prevBytesRef.current.ts;
          if (dtMs > 0) {
            const dtSec = dtMs / 1000;
            rxMbps = ((rxBytes - prevBytesRef.current.rxBytes) * 8) / dtSec / 1_000_000;
            txMbps = ((txBytes - prevBytesRef.current.txBytes) * 8) / dtSec / 1_000_000;
            // Guard against counter resets or negative diffs
            rxMbps = Math.max(0, parseFloat(rxMbps.toFixed(2)));
            txMbps = Math.max(0, parseFloat(txMbps.toFixed(2)));
          }
        }
        prevBytesRef.current = { rxBytes, txBytes, ts: nowTs };

        setMikrotikHistory((prev) => {
          const next: MikrotikSnapshot = {
            time: timeLabel,
            cpuLoad: payload.system!.cpuLoad,
            memoryUsedPct: payload.system!.memoryUsedPct,
            activeSessions: payload.sessions!.active,
            rxMbps,
            txMbps,
          };
          return [...prev, next].slice(-MAX_HISTORY_POINTS);
        });
      }
    } catch {
      setMikrotikConnected(false);
      setMikrotik({ ok: false, timestamp: new Date().toISOString(), error: "Failed to reach MikroTik." });
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, []);

  useEffect(() => {
    void pollMikrotik();
    intervalRef.current = setInterval(() => void pollMikrotik(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollMikrotik]);

  // ── Derived stat cards ─────────────────────────────────────────────────────
  const dashboardStats = data
    ? [
        { label: "Total Customers", value: String(data.stats.totalCustomers), change: "Sync Live", tone: "blue" },
        { label: "Active Customers", value: String(data.stats.activeCustomers), change: "Active PPPoE Profiles", tone: "green" },
        { label: "Disconnected", value: String(data.stats.disconnectedCustomers), change: "Disabled Secrets", tone: "slate" },
        { label: "Overdue Accounts", value: String(data.stats.overdueAccounts), change: "Unpaid past due", tone: "amber" },
        { label: "Pending Payments", value: String(data.stats.pendingPayments), change: "Awaiting Admin Check", tone: "blue" },
        { label: "Monthly Revenue", value: formatCurrency(data.stats.monthlyRevenue), change: "Current calendar month", tone: "green" },
        { label: "Online PPPoE", value: String(data.stats.onlinePppoe), change: "Active sessions", tone: "green" },
        { label: "Offline PPPoE", value: String(data.stats.offlinePppoe), change: "Unreached sessions", tone: "slate" },
      ]
    : [];

  const maxPlanCustomers = data
    ? Math.max(...data.planDistributionData.map((d) => d.customers), 1)
    : 1;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A real-time command center for billing health, payments, PPPoE sessions, and MikroTik operations."
        actions={
          <>
            <Button variant="outline" onClick={() => void loadDashboardData()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
            <Button><Plus className="h-4 w-4" /> New Customer</Button>
          </>
        }
      />

      {loading || !data ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </section>
          <div className="grid gap-4 xl:grid-cols-3">
            <Skeleton className="h-96 xl:col-span-2 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboardStats.map((stat) => (
              <StatCard key={stat.label} {...stat} tone={stat.tone as "blue" | "green" | "amber" | "slate"} />
            ))}
          </section>

          {/* ── MikroTik Real-time Section ───────────────────────────── */}
          <section className="space-y-4">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Router className="h-5 w-5 text-blue-500" />
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">MikroTik Live Monitor</h2>
                <Badge
                  variant={mikrotikConnected === null ? "info" : mikrotikConnected ? "success" : "danger"}
                  className="gap-1 flex items-center text-[11px]"
                >
                  {mikrotikConnected === null ? (
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-pulse inline-block" />
                  ) : mikrotikConnected ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                  )}
                  {mikrotikConnected === null ? "Connecting..." : mikrotikConnected ? "Live" : "Offline"}
                </Badge>
                <span className="text-[11px] text-slate-400">
                  Polling every {POLL_INTERVAL_MS / 1000}s
                </span>
              </div>
              {mikrotik?.router && (
                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Router className="h-3.5 w-3.5" />
                    {mikrotik.router.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Up: {mikrotik.router.uptime}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">v{mikrotik.router.version}</span>
                </div>
              )}
            </div>

            {/* Connection error banner */}
            {mikrotikConnected === false && (
              <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 px-5 py-3.5 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  <strong>MikroTik Offline:</strong>{" "}
                  {mikrotik?.error ?? "Cannot reach router. Check VPN connection."}
                </span>
              </div>
            )}

            {/* Realtime metric cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Active Sessions */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Sessions</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mikrotik?.sessions?.active ?? "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <Wifi className="h-3 w-3" /> PPPoE online
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CPU Load */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">CPU Load</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mikrotik?.system?.cpuLoad ?? "—"}{mikrotik?.system ? "%" : ""}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 w-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            (mikrotik?.system?.cpuLoad ?? 0) > 80
                              ? "bg-red-500"
                              : (mikrotik?.system?.cpuLoad ?? 0) > 50
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${mikrotik?.system?.cpuLoad ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 ml-3">
                      <Cpu className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Memory */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Memory Used</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mikrotik?.system?.memoryUsedPct ?? "—"}{mikrotik?.system ? "%" : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 font-medium">
                        {mikrotik?.system
                          ? `${mikrotik.system.usedMemoryMb} / ${mikrotik.system.totalMemoryMb} MB`
                          : "Connecting..."}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 ml-3">
                      <MemoryStick className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Uptime */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Router Uptime</p>
                      <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                        {mikrotik?.router?.uptime ?? "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 font-medium">
                        {mikrotik?.router?.boardName ?? "MikroTik"}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Traffic metric cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Download RX */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Download (RX)</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mikrotikHistory.length > 0
                          ? `${mikrotikHistory[mikrotikHistory.length - 1].rxMbps.toFixed(2)}`
                          : "—"}
                        {mikrotikHistory.length > 0 && <span className="text-base font-semibold text-slate-400 ml-1">Mbps</span>}
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <ArrowDown className="h-3 w-3" /> Incoming traffic
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <ArrowDown className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upload TX */}
              <Card className="relative overflow-hidden">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Upload (TX)</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mikrotikHistory.length > 0
                          ? `${mikrotikHistory[mikrotikHistory.length - 1].txMbps.toFixed(2)}`
                          : "—"}
                        {mikrotikHistory.length > 0 && <span className="text-base font-semibold text-slate-400 ml-1">Mbps</span>}
                      </p>
                      <p className="mt-1 text-[11px] text-orange-500 dark:text-orange-400 font-medium flex items-center gap-1">
                        <ArrowUp className="h-3 w-3" /> Outgoing traffic
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <ArrowUp className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {/* CPU & Memory line chart */}
              <Card className="xl:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Signal className="h-4 w-4 text-blue-500" />
                        CPU & Memory — Live
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Rolling {MAX_HISTORY_POINTS * (POLL_INTERVAL_MS / 1000)}s window · refreshes every {POLL_INTERVAL_MS / 1000}s
                      </CardDescription>
                    </div>
                    <Badge variant="info" className="gap-1 flex items-center text-[11px]">
                      <Activity className="h-3 w-3 animate-pulse" /> Real-time
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="h-64">
                  {mikrotikHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Signal className="h-8 w-8 animate-pulse" />
                      <p className="text-xs">Collecting data...</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mikrotikHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <defs>
                          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f040" />
                        <XAxis
                          dataKey="time"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: "10px",
                            fontSize: "12px",
                            color: "#e2e8f0",
                          }}
                          formatter={(value: any, name: any) => [
                            `${value}%`,
                            name === "cpuLoad" ? "CPU Load" : "Memory Used",
                          ]}
                          labelStyle={{ color: "#94a3b8", fontSize: "11px" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cpuLoad"
                          name="cpuLoad"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4, fill: "#2563eb" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="memoryUsedPct"
                          name="memoryUsedPct"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4, fill: "#8b5cf6" }}
                          strokeDasharray="4 2"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-1 px-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="h-2.5 w-5 rounded-full bg-blue-500 inline-block" />
                      CPU Load
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="h-2.5 w-5 rounded-full bg-violet-500 inline-block opacity-70" style={{ background: "repeating-linear-gradient(90deg,#8b5cf6 0,#8b5cf6 4px,transparent 4px,transparent 6px)" }} />
                      Memory Used
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Active Sessions line chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-emerald-500" />
                    Active PPPoE Sessions
                  </CardTitle>
                  <CardDescription className="text-xs">Live session count over time</CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  {mikrotikHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Wifi className="h-8 w-8 animate-pulse" />
                      <p className="text-xs">Waiting for data...</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mikrotikHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <defs>
                          <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f040" />
                        <XAxis
                          dataKey="time"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: "10px",
                            fontSize: "12px",
                            color: "#e2e8f0",
                          }}
                          formatter={(value: any) => [value, "Active Sessions"]}
                          labelStyle={{ color: "#94a3b8", fontSize: "11px" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="activeSessions"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="url(#sessGrad)"
                          dot={false}
                          activeDot={{ r: 4, fill: "#10b981" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Traffic Throughput Chart — full width */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ArrowDown className="h-4 w-4 text-emerald-500" />
                      Network Traffic — Live Throughput
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Rolling 60s window · computed from interface byte counter diffs
                    </CardDescription>
                  </div>
                  <Badge variant="info" className="gap-1 flex items-center text-[11px]">
                    <Activity className="h-3 w-3 animate-pulse" /> 1s refresh
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="h-52">
                {mikrotikHistory.length < 2 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Signal className="h-8 w-8 animate-pulse" />
                    <p className="text-xs">Collecting traffic data...</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mikrotikHistory} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#f97316" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f040" />
                      <XAxis
                        dataKey="time"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 9, fill: "#94a3b8" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={(v) => `${v} Mb`}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #1e293b",
                          borderRadius: "10px",
                          fontSize: "12px",
                          color: "#e2e8f0",
                        }}
                        formatter={(value: any, name: any) => [
                          `${Number(value).toFixed(2)} Mbps`,
                          name === "rxMbps" ? "↓ Download" : "↑ Upload",
                        ]}
                        labelStyle={{ color: "#94a3b8", fontSize: "11px" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="rxMbps"
                        name="rxMbps"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#rxGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#10b981" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="txMbps"
                        name="txMbps"
                        stroke="#f97316"
                        strokeWidth={2}
                        fill="url(#txGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#f97316" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                <div className="flex items-center gap-4 mt-1 px-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="h-2.5 w-5 rounded-full bg-emerald-500 inline-block" />
                    ↓ Download (RX)
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="h-2.5 w-5 rounded-full bg-orange-500 inline-block" />
                    ↑ Upload (TX)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Per-Client Traffic Table */}
            {mikrotik?.ok && (mikrotik.sessions?.list.length ?? 0) > 0 && (() => {
              const sessions = [...(mikrotik.sessions?.list ?? [])]
                .sort((a, b) => (b.bytesIn + b.bytesOut) - (a.bytesIn + a.bytesOut));
              const maxTotal = Math.max(...sessions.map(s => s.bytesIn + s.bytesOut), 1);

              return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Activity className="h-4 w-4 text-blue-500" />
                          Per-Client Traffic Usage
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {mikrotik.sessions!.active} active PPPoE clients · cumulative session data · sorted by usage
                        </CardDescription>
                      </div>
                      <Badge variant="success" className="gap-1 text-[11px]">
                        <Wifi className="h-3 w-3" /> {mikrotik.sessions!.active} online
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">#</th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Username</th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px] hidden sm:table-cell">IP Address</th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px] hidden md:table-cell">Uptime</th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">
                              <span className="flex items-center gap-1"><ArrowDown className="h-3 w-3 text-emerald-500" />Download (RX)</span>
                            </th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px]">
                              <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3 text-orange-500" />Upload (TX)</span>
                            </th>
                            <th className="text-left py-2 px-2 text-slate-400 font-semibold uppercase tracking-wide text-[10px] hidden lg:table-cell">Usage Bar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((session, i) => {
                            const total = session.bytesIn + session.bytesOut;
                            const pct = Math.round((total / maxTotal) * 100);
                            const rxPct = total > 0 ? Math.round((session.bytesIn / total) * 100) : 0;
                            return (
                              <tr
                                key={`${session.user}-${i}`}
                                className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                              >
                                <td className="py-2.5 px-2 text-slate-400 font-mono">{i + 1}</td>
                                <td className="py-2.5 px-2">
                                  <span className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
                                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{session.user}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 font-mono text-slate-500 hidden sm:table-cell">{session.address}</td>
                                <td className="py-2.5 px-2 text-slate-500 hidden md:table-cell">{session.uptime}</td>
                                <td className="py-2.5 px-2">
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatBytes(session.bytesIn)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2">
                                  <span className="font-semibold text-orange-500 dark:text-orange-400">
                                    {formatBytes(session.bytesOut)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 hidden lg:table-cell min-w-[120px]">
                                  <div className="relative h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                                      style={{ width: `${rxPct}%`, transition: "width 0.5s ease" }}
                                    />
                                    <div
                                      className="absolute inset-y-0 rounded-full bg-orange-400"
                                      style={{ left: `${rxPct}%`, width: `${100 - rxPct}%`, transition: "width 0.5s ease" }}
                                    />
                                  </div>
                                  <div className="text-[9px] text-slate-400 mt-0.5 text-center">{formatBytes(total)} total</div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-4 mt-3 px-1">
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="h-2.5 w-5 rounded-full bg-emerald-400 inline-block" />
                        ↓ Download (RX)
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="h-2.5 w-5 rounded-full bg-orange-400 inline-block" />
                        ↑ Upload (TX)
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400">Sorted by total usage · refreshes every 3s</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </section>

          {/* ── Billing Charts Section ───────────────────────────────── */}
          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Monthly Revenue</CardTitle>
                <CardDescription>Collections compared with monthly targets.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueData}>
                    <defs>
                      <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₱${Number(value) / 1000}k`} />
                    <Tooltip formatter={(value) => [`₱${Number(value).toLocaleString("en-PH")}`, ""]} />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fill="url(#revenue)" />
                    <Area type="monotone" dataKey="target" stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paid vs Unpaid</CardTitle>
                <CardDescription>Current billing cycle status mix.</CardDescription>
              </CardHeader>
              <CardContent className="h-80 flex flex-col justify-between">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.paidUnpaidData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={4}>
                        {data.paidUnpaidData.map((entry, index) => (
                          <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500 dark:text-slate-400">
                  {data.paidUnpaidData.map((item, index) => (
                    <span key={item.name} className="flex flex-col items-center">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                        {item.name}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white mt-0.5">{item.value}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Customer Growth</CardTitle>
                <CardDescription>Subscriber count trend.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.growthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="customers" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
                <CardDescription>Active subscribers by internet package.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.planDistributionData.map((plan, index) => (
                  <div key={plan.name}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{plan.name}</span>
                      <span className="text-slate-500 dark:text-slate-400 font-bold">{plan.customers}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(plan.customers / maxPlanCustomers) * 100}%`,
                          backgroundColor: chartColors[index % chartColors.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Payments, sync logs, and account actions.</CardDescription>
                  </div>
                  <Badge variant="info" className="gap-1 flex items-center">
                    <Activity className="h-3 w-3 animate-pulse" /> Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.activityItems.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No recent system activities logged.</p>
                ) : (
                  data.activityItems.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="flex gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-900">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white leading-none">{item.title}</p>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{item.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
