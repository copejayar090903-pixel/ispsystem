"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Pencil, RefreshCw, Router, Save, Unplug, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input, Textarea } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// Supabase customer row (only fields we care about)
type DbCustomer = {
  id: string;
  pppoe_username: string;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  account_number: string;
  address: string | null;
  plan_id: string | null;
  status: string;
  installation_date: string | null;
  due_date: string | null;
  plans?: { plan_name: string; speed: string } | null;
};

type ConnectionState = "checking" | "connected" | "error";

// ─── Schema ───────────────────────────────────────────────────────────────────

const editSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  password: z.string().optional(),
  profile:  z.string().optional(),
  comment:  z.string().optional(),
  email:    z.string().email("Enter a valid email address").optional().or(z.literal("")),
});

type EditForm = z.infer<typeof editSchema>;

// ─── Field wrapper (same as customers modal) ──────────────────────────────────

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${className ?? ""}`}>
      {label}
      {children}
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PPPoEPage() {
  const [accounts, setAccounts]                   = useState<PPPoESecret[]>([]);
  const [profiles, setProfiles]                   = useState<PPPoEProfile[]>([]);
  const [plans, setPlans]                         = useState<any[]>([]);
  const [dbCustomers, setDbCustomers]             = useState<DbCustomer[]>([]);
  const [selectedProfiles, setSelectedProfiles]   = useState<Record<string, string>>({});
  const [loading, setLoading]                     = useState(true);
  const [workingUser, setWorkingUser]             = useState<string | null>(null);
  const [connectionState, setConnectionState]     = useState<ConnectionState>("checking");
  const [connectionMessage, setConnectionMessage] = useState("Checking MikroTik API connection...");

  // Edit modal
  const [editingAccount, setEditingAccount] = useState<PPPoESecret | null>(null);
  const [showPassword, setShowPassword]     = useState(false);

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { username: "", password: "", profile: "", comment: "", email: "" },
  });

  const disabledCount = useMemo(() => accounts.filter((a) => a.disabled === "true").length, [accounts]);
  const enabledCount  = accounts.length - disabledCount;

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    setConnectionState("checking");
    setConnectionMessage("Checking MikroTik API connection...");
    try {
      const [accountsRes, profilesRes, plansRes, customersRes] = await Promise.all([
        fetch("/api/mikrotik/pppoe",    { cache: "no-store" }),
        fetch("/api/mikrotik/profiles", { cache: "no-store" }),
        fetch("/api/plans",             { cache: "no-store" }),
        fetch("/api/customers",         { cache: "no-store" }),
      ]);
      const [accountsData, profilesData, plansData, customersData] = await Promise.all([
        accountsRes.json(),
        profilesRes.json(),
        plansRes.json(),
        customersRes.json(),
      ]);

      if (!accountsRes.ok)  throw new Error(accountsData.error  ?? "Cannot connect to MikroTik.");
      if (!profilesRes.ok)  throw new Error(profilesData.error  ?? "Failed to load PPPoE profiles.");
      if (!plansRes.ok)     throw new Error(plansData.error     ?? "Failed to load plans.");
      // customers failure is non-fatal (email column will just be blank)

      const loaded: PPPoESecret[] = accountsData.accounts ?? [];
      setAccounts(loaded);
      setProfiles(profilesData.profiles ?? []);
      setPlans(plansData.plans ?? []);
      setDbCustomers(customersRes.ok ? (customersData.customers ?? []) : []);
      setSelectedProfiles(Object.fromEntries(loaded.map((a) => [a.name, a.profile ?? ""])));
      setConnectionState("connected");
      setConnectionMessage("Connected to MikroTik through the server-side RouterOS API.");
    } catch (error) {
      setConnectionState("error");
      const msg = error instanceof Error ? error.message : "Cannot connect to MikroTik. Check VPN connection.";
      setConnectionMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  // ── Quick actions ─────────────────────────────────────────────────────────

  async function runAction(
    username: string,
    endpoint: string,
    success: string,
    body: Record<string, string> = { username },
  ) {
    setWorkingUser(username);
    try {
      const res  = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "MikroTik action failed.");
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
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number:    "auto",
          full_name:         account.comment?.trim() || account.name,
          contact_number:    "-",
          email:             null,
          pppoe_username:    account.name,
          plan_id:           selectedPlan?.id || null,
          status:            account.disabled === "true" ? "inactive" : account.profile === "Expired-Profile" ? "unpaid" : "active",
          address:           account.comment || null,
          installation_date: new Date().toISOString().split("T")[0],
          due_date:          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sync customer.");
      toast.success(`${account.name} synced to Supabase.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync customer.");
    } finally {
      setWorkingUser(null);
    }
  }

  // ── Edit modal ────────────────────────────────────────────────────────────

  function openEdit(account: PPPoESecret) {
    setEditingAccount(account);
    setShowPassword(false);
    // Look up matching customer record to pre-fill email
    const customer = dbCustomers.find((c) => c.pppoe_username === account.name);
    form.reset({
      username: account.name,
      password: "",
      profile:  account.profile ?? "",
      comment:  account.comment ?? "",
      email:    customer?.email ?? "",
    });
  }

  async function onSubmit(values: EditForm) {
    if (!editingAccount) return;

    const customer = dbCustomers.find((c) => c.pppoe_username === editingAccount.name);

    try {
      // 1 ── Update MikroTik secret (username, password, profile, comment)
      const mikrotikPayload: Record<string, string | undefined> = {
        username: editingAccount.name,
        newName:  values.username.trim() !== editingAccount.name    ? values.username.trim() : undefined,
        password: values.password?.trim()                            ? values.password.trim() : undefined,
        profile:  values.profile && values.profile !== (editingAccount.profile ?? "") ? values.profile : undefined,
        comment:  values.comment !== (editingAccount.comment ?? "") ? values.comment         : undefined,
      };

      const mikrotikRes = await fetch("/api/mikrotik/pppoe-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mikrotikPayload),
      });
      const mikrotikData = await mikrotikRes.json();
      if (!mikrotikRes.ok) throw new Error(mikrotikData.error ?? "Failed to update MikroTik secret.");

      // 2 ── Upsert Supabase customer record (email + comment as full_name)
      const customerPayload = {
        // If existing customer record, pass id so it does an update
        id:               customer?.id,
        pppoe_username:   values.username.trim() !== editingAccount.name ? values.username.trim() : editingAccount.name,
        account_number:   customer?.account_number ?? "auto",
        full_name:        values.comment?.trim()   || customer?.full_name || editingAccount.name,
        email:            values.email?.trim()     || null,
        contact_number:   customer?.contact_number || "-",
        plan_id:          customer?.plan_id        || null,
        status:           customer?.status         || "active",
        address:          customer?.address        || null,
        installation_date:customer?.installation_date || new Date().toISOString().split("T")[0],
        due_date:         customer?.due_date       || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const customerRes = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerPayload),
      });
      const customerData = await customerRes.json();
      if (!customerRes.ok) throw new Error(customerData.error ?? "Failed to update customer email.");

      toast.success(`${editingAccount.name} updated successfully.`);
      setEditingAccount(null);
      form.reset();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save changes.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="PPPoE Accounts"
        description="Live PPPoE secrets from MikroTik RouterOS. Enable, disable, disconnect, edit, sync, or change profiles securely via API."
        actions={<Button onClick={() => void loadData()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <ConnectionCard state={connectionState} message={connectionMessage} />
        <Metric label="Total Secrets" value={accounts.length.toString()} />
        <Metric label="Enabled"  value={enabledCount.toString()}  tone="text-emerald-600" />
        <Metric label="Disabled" value={disabledCount.toString()} tone="text-rose-600" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>RouterOS /ppp/secret</CardTitle>
          <CardDescription>
            Click <strong>Edit</strong> on any row to update the PPPoE secret and subscriber email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
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
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => {
                      const disabled  = account.disabled === "true";
                      const busy      = workingUser === account.name;
                      const customer  = dbCustomers.find((c) => c.pppoe_username === account.name);
                      return (
                        <TableRow key={account[".id"]}>
                          <TableCell className="font-medium text-slate-950 dark:text-white font-mono">{account.name}</TableCell>
                          <TableCell>{account.service || "pppoe"}</TableCell>
                          <TableCell className="min-w-52">
                            <Select
                              value={selectedProfiles[account.name] ?? account.profile ?? ""}
                              onChange={(e) => setSelectedProfiles({ ...selectedProfiles, [account.name]: e.target.value })}
                              disabled={busy}
                            >
                              <option value="">Select profile</option>
                              {profiles.map((p) => <option key={p[".id"]} value={p.name}>{p.name}</option>)}
                            </Select>
                          </TableCell>
                          <TableCell>{account["local-address"] || "-"}</TableCell>
                          <TableCell>{account["remote-address"] || "-"}</TableCell>
                          <TableCell><StatusBadge status={disabled ? "disabled" : "active"} /></TableCell>
                          {/* Email from Supabase */}
                          <TableCell className="text-slate-500 text-xs">
                            {customer?.email
                              ? <span className="text-emerald-600 dark:text-emerald-400">{customer.email}</span>
                              : <span className="italic text-slate-400">no email</span>
                            }
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-[480px] justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => openEdit(account)}
                                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Button>
                              <Button variant="outline" size="sm" disabled={busy || !disabled} onClick={() => void runAction(account.name, "/api/mikrotik/enable", `${account.name} enabled.`)}>
                                <Wifi className="h-3.5 w-3.5" /> Enable
                              </Button>
                              <Button variant="destructive" size="sm" disabled={busy || disabled} onClick={() => void runAction(account.name, "/api/mikrotik/disable", `${account.name} disabled.`)}>
                                <WifiOff className="h-3.5 w-3.5" /> Disable
                              </Button>
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(account.name, "/api/mikrotik/disconnect", `${account.name} disconnected.`)}>
                                <Unplug className="h-3.5 w-3.5" /> Disconnect
                              </Button>
                              <Button variant="outline" size="sm" disabled={busy || !selectedProfiles[account.name]} onClick={() => void runAction(account.name, "/api/mikrotik/change-profile", `${account.name} profile changed.`, { username: account.name, profile: selectedProfiles[account.name] })}>
                                <Save className="h-3.5 w-3.5" /> Profile
                              </Button>
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

      {/* ─── Edit Modal ─── */}
      {editingAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Edit PPPoE Account</CardTitle>
                <CardDescription>
                  Update the username, password, profile, email, or comment for this PPPoE secret.
                  Changes apply immediately on RouterOS and are saved to the subscriber database.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setEditingAccount(null); form.reset(); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">

                {/* Account ID — read-only */}
                <Field label="Account ID (read-only)">
                  <Input
                    value={editingAccount[".id"]}
                    disabled
                    className="bg-slate-100 dark:bg-slate-900 font-mono text-xs"
                  />
                </Field>

                {/* Username */}
                <Field label="PPPoE Username" error={form.formState.errors.username?.message}>
                  <Input
                    {...form.register("username")}
                    placeholder="pppoe-username"
                    className="font-mono"
                  />
                </Field>

                {/* Password */}
                <Field label="New Password" error={form.formState.errors.password?.message}>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      {...form.register("password")}
                      placeholder="Leave blank to keep current"
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                {/* Profile */}
                <Field label="Assigned Profile" error={form.formState.errors.profile?.message}>
                  <Select {...form.register("profile")}>
                    <option value="">Select profile</option>
                    {profiles.map((p) => (
                      <option key={p[".id"]} value={p.name}>{p.name}</option>
                    ))}
                  </Select>
                </Field>

                {/* Email — saved to Supabase customer record */}
                <Field label="Email" error={form.formState.errors.email?.message}>
                  <Input
                    type="email"
                    {...form.register("email")}
                    placeholder="subscriber@example.com"
                  />
                </Field>

                {/* Comment / Full Name — full width */}
                <Field
                  label="Comment / Full Name"
                  error={form.formState.errors.comment?.message}
                  className="md:col-span-2"
                >
                  <Textarea
                    {...form.register("comment")}
                    placeholder="Subscriber full name or note"
                    rows={3}
                  />
                </Field>

                {/* Footer */}
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setEditingAccount(null); form.reset(); }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Saving..." : "Save Account"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

// ─── Helper components ─────────────────────────────────────────────────────────

function ConnectionCard({ state, message }: { state: ConnectionState; message: string }) {
  const status = state === "connected" ? "online" : state === "error" ? "offline" : "pending";
  return (
    <Card className="md:col-span-1">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>MikroTik Status</CardDescription>
            <CardTitle className="mt-2 text-lg">
              {state === "connected" ? "Connected" : state === "error" ? "Connection issue" : "Checking"}
            </CardTitle>
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
