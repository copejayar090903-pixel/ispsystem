"use client";

import { RefreshCw, Router, Save, Unplug, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

type PPPoESecret = {
  ".id": string;
  name: string;
  service?: string;
  profile?: string;
  "local-address"?: string;
  "remote-address"?: string;
  disabled?: string;
  comment?: string;
};

type PPPoEProfile = {
  ".id": string;
  name: string;
  "rate-limit"?: string;
};

type ConnectionState = "checking" | "connected" | "error";

export default function PPPoEPage() {
  const [accounts, setAccounts] = useState<PPPoESecret[]>([]);
  const [profiles, setProfiles] = useState<PPPoEProfile[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingUser, setWorkingUser] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [connectionMessage, setConnectionMessage] = useState("Checking MikroTik API connection...");

  const disabledCount = useMemo(() => accounts.filter((account) => account.disabled === "true").length, [accounts]);
  const enabledCount = accounts.length - disabledCount;

  async function loadData() {
    setLoading(true);
    setConnectionState("checking");
    setConnectionMessage("Checking MikroTik API connection...");

    try {
      const [accountsResponse, profilesResponse, plansResponse] = await Promise.all([
        fetch("/api/mikrotik/pppoe", { cache: "no-store" }),
        fetch("/api/mikrotik/profiles", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
      ]);
      const [accountsData, profilesData, plansData] = await Promise.all([
        accountsResponse.json(),
        profilesResponse.json(),
        plansResponse.json(),
      ]);

      if (!accountsResponse.ok) throw new Error(accountsData.error ?? "Cannot connect to MikroTik. Check VPN connection.");
      if (!profilesResponse.ok) throw new Error(profilesData.error ?? "Failed to load MikroTik PPPoE profiles.");
      if (!plansResponse.ok) throw new Error(plansData.error ?? "Failed to load plans.");

      const loadedAccounts = accountsData.accounts ?? [];
      setAccounts(loadedAccounts);
      setProfiles(profilesData.profiles ?? []);
      setPlans(plansData.plans ?? []);
      setSelectedProfiles(Object.fromEntries(loadedAccounts.map((account: PPPoESecret) => [account.name, account.profile ?? ""])));
      setConnectionState("connected");
      setConnectionMessage("Connected to MikroTik through the server-side RouterOS API.");
    } catch (error) {
      setConnectionState("error");
      setConnectionMessage(error instanceof Error ? error.message : "Cannot connect to MikroTik. Check VPN connection.");
      toast.error(error instanceof Error ? error.message : "MikroTik request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line no-void
    void loadData();
  }, []);

  async function runAction(username: string, endpoint: string, success: string, body: Record<string, string> = { username }) {
    setWorkingUser(username);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "MikroTik action failed.");
      toast.success(success);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MikroTik action failed.");
    } finally {
      setWorkingUser(null);
    }
  }

  async function syncCustomer(account: PPPoESecret) {
    setWorkingUser(account.name);
    try {
      const selectedPlan = plans.find((p) => p.speed === account.profile);
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: "auto",
          full_name: account.comment?.trim() || account.name,
          contact_number: "-",
          email: null,
          pppoe_username: account.name,
          plan_id: selectedPlan?.id || null,
          status: account.disabled === "true"
            ? "inactive"
            : account.profile === "Expired-Profile"
              ? "unpaid"
              : "active",
          address: account.comment || null,
          installation_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to sync customer.");
      toast.success(`${account.name} synced to Supabase customers with generated account number.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync customer.");
    } finally {
      setWorkingUser(null);
    }
  }

  return (
    <>
      <PageHeader
        title="PPPoE Accounts"
        description="Live PPPoE secrets from MikroTik RouterOS. Enable, disable, disconnect, sync, or change profiles securely via API routes."
        actions={<Button onClick={() => void loadData()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <ConnectionCard state={connectionState} message={connectionMessage} />
        <Metric label="Total Secrets" value={accounts.length.toString()} />
        <Metric label="Enabled" value={enabledCount.toString()} tone="text-emerald-600" />
        <Metric label="Disabled" value={disabledCount.toString()} tone="text-rose-600" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>RouterOS /ppp/secret</CardTitle>
          <CardDescription>Profiles are fetched from /ppp/profile and available per-account.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PPPoE Username</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Local Address</TableHead>
                      <TableHead>Remote Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => {
                      const disabled = account.disabled === "true";
                      const busy = workingUser === account.name;
                      return (
                        <TableRow key={account[".id"]}>
                          <TableCell className="font-medium text-slate-950 dark:text-white">{account.name}</TableCell>
                          <TableCell>{account.service || "pppoe"}</TableCell>
                          <TableCell className="min-w-52">
                            <Select
                              value={selectedProfiles[account.name] ?? account.profile ?? ""}
                              onChange={(event) => setSelectedProfiles({ ...selectedProfiles, [account.name]: event.target.value })}
                              disabled={busy}
                            >
                              <option value="">Select profile</option>
                              {profiles.map((profile) => <option key={profile[".id"]} value={profile.name}>{profile.name}</option>)}
                            </Select>
                          </TableCell>
                          <TableCell>{account["local-address"] || "-"}</TableCell>
                          <TableCell>{account["remote-address"] || "-"}</TableCell>
                          <TableCell><StatusBadge status={disabled ? "disabled" : "active"} /></TableCell>
                          <TableCell className="min-w-48">{account.comment || "-"}</TableCell>
                          <TableCell>
                            <div className="flex min-w-96 justify-end gap-2">
                              <Button variant="outline" size="sm" disabled={busy || !disabled} onClick={() => void runAction(account.name, "/api/mikrotik/enable", `${account.name} enabled.`)}><Wifi className="h-4 w-4" /> Enable</Button>
                              <Button variant="destructive" size="sm" disabled={busy || disabled} onClick={() => void runAction(account.name, "/api/mikrotik/disable", `${account.name} disabled.`)}><WifiOff className="h-4 w-4" /> Disable</Button>
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(account.name, "/api/mikrotik/disconnect", `${account.name} disconnected.`)}><Unplug className="h-4 w-4" /> Disconnect</Button>
                              <Button variant="outline" size="sm" disabled={busy || !selectedProfiles[account.name]} onClick={() => void runAction(account.name, "/api/mikrotik/change-profile", `${account.name} profile changed.`, { username: account.name, profile: selectedProfiles[account.name] })}><Save className="h-4 w-4" /> Profile</Button>
                              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void syncCustomer(account)}>Sync</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ConnectionCard({ state, message }: { state: ConnectionState; message: string }) {
  const status = state === "connected" ? "online" : state === "error" ? "offline" : "pending";
  return (
    <Card className="md:col-span-1">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>MikroTik Status</CardDescription>
            <CardTitle className="mt-2 text-lg">{state === "connected" ? "Connected" : state === "error" ? "Connection issue" : "Checking"}</CardTitle>
          </div>
          <Router className="h-5 w-5 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <StatusBadge status={status} />
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{message}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "text-slate-950 dark:text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${tone}`}>{value}</p>
    </Card>
  );
}
