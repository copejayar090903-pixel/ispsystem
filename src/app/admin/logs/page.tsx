"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/src/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Loader2, RefreshCw, ScrollText, AlertTriangle, CheckCircle2, CreditCard, UserPlus, UserCog, Wifi, WifiOff, Settings } from "lucide-react";

type LogEntry = {
  id: string;
  event_type: string;
  pppoe_username: string | null;
  customer_name: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EVENT_TYPES = [
  { value: "all",              label: "All Events" },
  { value: "auto_expired",     label: "Auto Expired" },
  { value: "payment",          label: "Payments" },
  { value: "customer_created", label: "New Customers" },
  { value: "customer_updated", label: "Updated" },
  { value: "sync_complete",    label: "Sync" },
  { value: "sync_error",       label: "Errors" },
  { value: "disconnect",       label: "Disconnects" },
];

function eventIcon(type: string) {
  switch (type) {
    case "auto_expired":     return <AlertTriangle className="h-3.5 w-3.5" />;
    case "payment":          return <CreditCard className="h-3.5 w-3.5" />;
    case "customer_created": return <UserPlus className="h-3.5 w-3.5" />;
    case "customer_updated": return <UserCog className="h-3.5 w-3.5" />;
    case "sync_complete":    return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "sync_error":       return <AlertTriangle className="h-3.5 w-3.5" />;
    case "disconnect":       return <WifiOff className="h-3.5 w-3.5" />;
    case "enable":           return <Wifi className="h-3.5 w-3.5" />;
    case "disable":          return <WifiOff className="h-3.5 w-3.5" />;
    default:                 return <Settings className="h-3.5 w-3.5" />;
  }
}

function eventBadgeClass(type: string) {
  switch (type) {
    case "auto_expired": return "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300";
    case "sync_error":   return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
    case "payment":      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
    case "customer_created": return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
    case "sync_complete": return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    default:             return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function LogsPage() {
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/logs?limit=200" : `/api/logs?limit=200&type=${filter}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void fetchLogs(), 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  return (
    <>
      <PageHeader
        title="Activity Logs"
        description="Real-time record of all system events — auto-expirations, payments, syncs, and customer changes."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); void fetchLogs(); }}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((et) => (
          <button
            key={et.value}
            onClick={() => setFilter(et.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === et.value
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {et.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Event Log
            </CardTitle>
            <CardDescription>{total} total events</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
              <ScrollText className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No log entries yet.</p>
              <p className="text-xs">Events will appear here after the background worker runs or actions are performed.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition"
                >
                  {/* Timestamp */}
                  <span className="shrink-0 w-36 text-xs font-mono text-slate-400 dark:text-slate-500 pt-0.5 tabular-nums">
                    {formatTimestamp(log.created_at)}
                  </span>

                  {/* Badge */}
                  <span className={`flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${eventBadgeClass(log.event_type)}`}>
                    {eventIcon(log.event_type)}
                    {log.event_type.replace(/_/g, " ")}
                  </span>

                  {/* Description */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">{log.description}</p>
                    {log.pppoe_username && (
                      <p className="mt-0.5 text-xs text-slate-400 font-mono">{log.pppoe_username}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
