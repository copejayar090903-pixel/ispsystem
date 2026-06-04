"use client";

import { Cpu, HardDrive, RefreshCw, Router, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

type MikrotikStatus = {
  connected: boolean;
  error?: string;
  identity?: { name?: string };
  resource?: { uptime?: string; version?: string; "cpu-load"?: string; "free-memory"?: string; "total-memory"?: string; "board-name"?: string };
  sessions?: Array<{ ".id": string; name?: string; user?: string; address?: string; uptime?: string; "caller-id"?: string }>;
  profiles?: Array<{ ".id": string; name: string; "rate-limit"?: string }>;
};

export default function MikrotikPage() {
  const [data, setData] = useState<MikrotikStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/mikrotik/status", { cache: "no-store" });
      const payload = await response.json();
      setData(payload);
      if (!response.ok) throw new Error(payload.error ?? "Cannot connect to MikroTik. Check ZeroTier connection.");
      toast.success("MikroTik connection test successful.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cannot connect to MikroTik. Check ZeroTier connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line no-void
    void loadStatus();
  }, []);

  const resource = data?.resource;
  const sessions = data?.sessions ?? [];
  const profiles = data?.profiles ?? [];

  return (
    <>
      <PageHeader title="MikroTik" description="Router identity, resources, active PPPoE sessions, profile inventory, and sync controls." actions={<><Button variant="outline" onClick={() => void loadStatus()}><RefreshCw className="h-4 w-4" /> Test Connection</Button><Button onClick={() => toast.success("PPPoE sync queued.")}><Wifi className="h-4 w-4" /> Sync PPPoE</Button></>} />
      {loading ? <Skeleton className="h-36 w-full" /> : <section className="grid gap-4 md:grid-cols-4"><Metric icon={Router} label="Router" value={data?.identity?.name ?? "Unknown"} meta={data?.connected ? "Connected" : data?.error ?? "Offline"} /><Metric icon={Cpu} label="CPU Load" value={`${resource?.["cpu-load"] ?? "0"}%`} meta={resource?.["board-name"] ?? "MikroTik hEX"} /><Metric icon={HardDrive} label="Memory" value={formatMemory(resource?.["free-memory"], resource?.["total-memory"])} meta="Free / total" /><Metric icon={Wifi} label="Active PPPoE" value={sessions.length.toString()} meta={`${profiles.length} profiles loaded`} /></section>}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Active PPPoE Sessions</CardTitle><CardDescription>Live sessions from /ppp/active.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>IP</TableHead><TableHead>Uptime</TableHead><TableHead>Caller ID</TableHead></TableRow></TableHeader><TableBody>{sessions.length ? sessions.map((session) => <TableRow key={session[".id"]}><TableCell className="font-medium">{session.name ?? session.user}</TableCell><TableCell>{session.address ?? "-"}</TableCell><TableCell>{session.uptime ?? "-"}</TableCell><TableCell>{session["caller-id"] ?? "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="text-center text-slate-500">No active sessions.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>PPPoE Profiles</CardTitle><CardDescription>Profiles from /ppp/profile for plan mapping.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Rate Limit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{profiles.length ? profiles.map((profile) => <TableRow key={profile[".id"]}><TableCell className="font-medium">{profile.name}</TableCell><TableCell>{profile["rate-limit"] ?? "-"}</TableCell><TableCell><StatusBadge status="active" /></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="text-center text-slate-500">No profiles found.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      </section>
    </>
  );
}

function Metric({ icon: Icon, label, value, meta }: { icon: typeof Router; label: string; value: string; meta: string }) {
  return <Card className="p-5"><Icon className="h-5 w-5 text-blue-500" /><p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta}</p></Card>;
}

function formatMemory(free?: string, total?: string) {
  if (!free || !total) return "-";
  const freeMb = Math.round(Number(free) / 1024 / 1024);
  const totalMb = Math.round(Number(total) / 1024 / 1024);
  return `${freeMb}MB / ${totalMb}MB`;
}
