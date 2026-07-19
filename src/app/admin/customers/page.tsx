"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, Download, Eye, MoreHorizontal, Plus, Wifi, WifiOff, X, Loader2, Unplug, CreditCard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input, Textarea } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";

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

type ActivePPPoESession = {
  ".id": string;
  name?: string;
  user?: string;
  service?: string;
  address?: string;
  uptime?: string;
  "session-id"?: string;
  "caller-id"?: string;
};

type Plan = {
  id: string;
  plan_name: string;
  speed: string;
};

type Customer = {
  id: string;
  accountNumber: string;
  fullName: string;
  contactNumber: string;
  email: string;
  pppoeUsername: string;
  plan: string;
  dueDate: string;
  installationDate?: string;
  status: string;
  address: string;
  uptime?: string;
  ipAddress?: string;
  callerId?: string;
  paidThisMonth?: boolean;
};

const customerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  contactNumber: z.string().min(6, "Contact number is required"),
  email: z.string().email("Use a valid email").optional().or(z.literal("")),
  pppoeUsername: z.string().min(2, "PPPoE username is required"),
  pppoePassword: z.string().optional(),
  plan: z.string().min(1, "Plan is required"),
  address: z.string().optional(),
  installationDate: z.string().min(1, "Installed date is required"),
  dueDate: z.string().min(1, "Due date is required"),
});

type CustomerForm = z.infer<typeof customerSchema>;

const calculateRemainingDays = (dueDateStr: string) => {
  if (!dueDateStr || dueDateStr === "-") return "-";
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  
  const diffTime = dueDate.getTime() - today.getTime();
  if (diffTime < 0) {
    const diffDays = Math.ceil(Math.abs(diffTime) / (1000 * 60 * 60 * 24));
    return `${diffDays} days overdue`;
  }
  
  const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
  if (diffHours < 24) {
    if (diffHours <= 1) return "1 hour left";
    return `${diffHours} hours left`;
  }
  
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays} days left`;
};

function formatToDatetimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === "-") {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return formatLocalDateToDatetimeLocal(d);
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const fallback = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return formatLocalDateToDatetimeLocal(fallback);
  }
  return formatLocalDateToDatetimeLocal(d);
}

function formatLocalDateToDatetimeLocal(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatToReadableDatetime(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === "-") return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const pad = (num: number) => String(num).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default function CustomersPage() {
  const [secrets, setSecrets] = useState<PPPoESecret[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActivePPPoESession[]>([]);
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [routerError, setRouterError] = useState<string | null>(null);

  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      fullName: "",
      contactNumber: "",
      email: "",
      pppoeUsername: "",
      pppoePassword: "",
      plan: "",
      address: "",
      installationDate: "",
      dueDate: "",
    },
  });

  async function loadData() {
    setLoading(true);
    setRouterError(null);
    try {
      // 1. Fetch database records first (must succeed)
      const [customersRes, plansRes] = await Promise.all([
        fetch("/api/customers", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
      ]);

      const customersData = await customersRes.json();
      const plansData = await plansRes.json();

      if (!customersRes.ok) throw new Error(customersData.error ?? "Failed to fetch customers.");
      if (!plansRes.ok) throw new Error(plansData.error ?? "Failed to fetch plans.");

      setDbCustomers(customersData.customers ?? []);
      setPlans(plansData.plans ?? []);

      // 2. Fetch MikroTik records (gracefully handle failure / timeout)
      try {
        const [secretsRes, activeRes] = await Promise.all([
          fetch("/api/mikrotik/pppoe", { cache: "no-store" }),
          fetch("/api/mikrotik/active", { cache: "no-store" }),
        ]);

        if (secretsRes.ok) {
          const secretsData = await secretsRes.json();
          setSecrets(secretsData.accounts ?? []);
        } else {
          const secretsData = await secretsRes.json();
          setRouterError(secretsData.error ?? "Failed to fetch secrets.");
        }

        if (activeRes.ok) {
          const activeData = await activeRes.json();
          setActiveSessions(activeData.sessions ?? []);
        } else {
          const activeData = await activeRes.json();
          setRouterError((prev) => prev || (activeData.error ?? "Failed to fetch active sessions."));
        }
      } catch (err) {
        console.error("MikroTik fetch failed:", err);
        setRouterError(err instanceof Error ? err.message : "Failed to connect to MikroTik router.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load customers data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Auto-sync active connections that do not exist in the database yet
  useEffect(() => {
    if (loading || activeSessions.length === 0 || secrets.length === 0) return;

    async function autoSync() {
      // 1. Sync new customers
      const unsynced = activeSessions.filter((session) => {
        const username = session.user || session.name || "";
        return !dbCustomers.some((c) => c.pppoe_username === username);
      });

      let didUpdate = false;

      if (unsynced.length > 0) {
        for (const session of unsynced) {
          const username = session.user || session.name || "";
          const secret = secrets.find((s) => s.name === username);
          const selectedPlan = plans.find((p) => p.speed === secret?.profile);

          try {
            const payload = {
              account_number: "auto",
              full_name: secret?.comment?.trim() || username,
              contact_number: "-",
              email: null,
              pppoe_username: username,
              plan_id: selectedPlan?.id || null,
              status: secret?.disabled === "true"
                ? "inactive"
                : secret?.profile === "Expired-Profile"
                  ? "unpaid"
                  : "active",
              address: secret?.comment || null,
              installation_date: new Date().toISOString().split("T")[0],
              due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            };

            const res = await fetch("/api/customers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (res.ok) {
              didUpdate = true;
            }
          } catch (e) {
            console.error("Auto-sync failed for username:", username, e);
          }
        }
      }

      // 2. Sync status of existing customers if they are on Expired-Profile or moved away from it
      const statusMismatches = dbCustomers.filter((customer) => {
        const secret = secrets.find((s) => s.name === customer.pppoe_username);
        if (!secret) return false;

        const shouldBeUnpaid = secret.profile === "Expired-Profile";
        if (shouldBeUnpaid && customer.status !== "unpaid") {
          return true;
        }
        if (!shouldBeUnpaid && customer.status === "unpaid") {
          return true;
        }
        return false;
      });

      if (statusMismatches.length > 0) {
        for (const customer of statusMismatches) {
          const secret = secrets.find((s) => s.name === customer.pppoe_username);
          const shouldBeUnpaid = secret?.profile === "Expired-Profile";

          try {
            const payload = {
              id: customer.id,
              account_number: customer.account_number,
              full_name: customer.full_name,
              contact_number: customer.contact_number,
              email: customer.email,
              pppoe_username: customer.pppoe_username,
              plan_id: customer.plan_id,
              status: shouldBeUnpaid ? "unpaid" : "active",
              address: customer.address,
              installation_date: customer.installation_date,
              due_date: customer.due_date,
            };

            const res = await fetch("/api/customers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (res.ok) {
              didUpdate = true;
            }
          } catch (e) {
            console.error("Failed to update status for customer:", customer.pppoe_username, e);
          }
        }
      }

      if (didUpdate) {
        // Reload database customers to update UI
        const custRes = await fetch("/api/customers", { cache: "no-store" });
        if (custRes.ok) {
          const data = await custRes.json();
          setDbCustomers(data.customers ?? []);
        }
      }

      // 3. Auto-expire customers whose due date has passed
      const overdueActiveCustomers = dbCustomers.filter((customer) => {
        if (!customer.due_date) return false;

        // Find if they are currently active on MikroTik and not already expired
        const secret = secrets.find((s) => s.name === customer.pppoe_username);
        if (!secret || secret.profile === "Expired-Profile" || secret.disabled === "true") return false;

        // Check if due date is today or past
        const dueDate = new Date(customer.due_date);
        const today = new Date();

        return dueDate.getTime() <= today.getTime();
      });

      let didUpdateAfterExpire = false;
      if (overdueActiveCustomers.length > 0) {
        const expiredPlan = plans.find((p) => p.speed === "Expired-Profile");
        for (const customer of overdueActiveCustomers) {
          try {
            console.log(`Auto-expiring customer ${customer.pppoe_username} (due date was ${customer.due_date})`);
            const res = await fetch("/api/mikrotik/change-profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: customer.pppoe_username,
                profile: "Expired-Profile",
              }),
            });

            if (res.ok) {
              // Kick active connection so they reconnect under Expired-Profile immediately
              try {
                await fetch("/api/mikrotik/disconnect", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username: customer.pppoe_username }),
                });
              } catch (err) {
                console.error("Failed to disconnect user on expiration:", err);
              }

              // Mark the customer status as unpaid and their plan to Expired-Profile in Supabase
              const payload = {
                id: customer.id,
                account_number: customer.account_number,
                full_name: customer.full_name,
                contact_number: customer.contact_number,
                email: customer.email,
                pppoe_username: customer.pppoe_username,
                plan_id: expiredPlan?.id || customer.plan_id,
                status: "unpaid",
                address: customer.address,
                installation_date: customer.installation_date,
                due_date: customer.due_date,
              };

              const dbRes = await fetch("/api/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (dbRes.ok) {
                didUpdateAfterExpire = true;
              }
            }
          } catch (e) {
            console.error("Auto-expiration failed for customer:", customer.pppoe_username, e);
          }
        }
      }

      if (didUpdateAfterExpire) {
        const custRes = await fetch("/api/customers", { cache: "no-store" });
        if (custRes.ok) {
          const data = await custRes.json();
          setDbCustomers(data.customers ?? []);
        }
      }
    }

    void autoSync();
  }, [activeSessions, dbCustomers, secrets, plans, loading]);

  const activeCustomers = useMemo(() => {
    if (secrets.length === 0 || activeSessions.length === 0) {
      // Fallback: If router is offline, show all database customers so they can still be managed/paid
      return dbCustomers.map((customer) => {
        return {
          id: customer.id,
          accountNumber: customer.account_number || "NOT_SYNCED",
          fullName: customer.full_name || "-",
          contactNumber: customer.contact_number || "-",
          email: customer.email || "-",
          pppoeUsername: customer.pppoe_username,
          plan: customer.plans?.plan_name || "default",
          dueDate: customer.due_date || "-",
          installationDate: customer.installation_date || "-",
          status: customer.status || "active",
          address: customer.address || "-",
          uptime: "Router Offline",
          ipAddress: "-",
          callerId: "-",
          paidThisMonth: customer.paid_this_month || false,
        };
      });
    }

    return activeSessions.map((session) => {
      const username = session.user || session.name || "";
      const secret = secrets.find((s) => s.name === username);
      const customer = dbCustomers.find((c) => c.pppoe_username === username);

      return {
        id: customer?.id || username,
        accountNumber: customer?.account_number || "NOT_SYNCED",
        fullName: customer?.full_name || secret?.comment || username,
        contactNumber: customer?.contact_number || "-",
        email: customer?.email || "-",
        pppoeUsername: username,
        plan: customer?.plans?.plan_name || secret?.profile || "default",
        dueDate: customer?.due_date || "-",
        installationDate: customer?.installation_date || "-",
        status: secret?.disabled === "true"
          ? "disabled"
          : secret?.profile === "Expired-Profile"
            ? "unpaid"
            : customer?.status || "active",
        address: customer?.address || secret?.comment || "-",
        uptime: session.uptime || "-",
        ipAddress: session.address || "-",
        callerId: session["caller-id"] || "-",
        paidThisMonth: customer?.paid_this_month || false,
      };
    });
  }, [activeSessions, secrets, dbCustomers]);

  // Sync selectedCustomer reference when activeCustomers list updates
  useEffect(() => {
    if (activeCustomers.length > 0) {
      if (!selectedCustomer) {
        setSelectedCustomer(activeCustomers[0]);
      } else {
        const updated = activeCustomers.find((c) => c.pppoeUsername === selectedCustomer.pppoeUsername);
        if (updated) {
          setSelectedCustomer(updated);
        } else {
          setSelectedCustomer(activeCustomers[0]);
        }
      }
    } else {
      setSelectedCustomer(null);
    }
  }, [activeCustomers, selectedCustomer]);

  async function handleStatusAction(username: string, endpoint: string, successMessage: string) {
    setActionBusy(username);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "MikroTik action failed.");
      toast.success(successMessage);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MikroTik action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handlePayAction(username: string) {
    setActionBusy(username);
    try {
      const res = await fetch("/api/customers/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to process payment.");
      if (data.warning) {
        toast.warning(data.warning, { duration: 6000 });
      } else {
        toast.success(`Payment verified! ${username} plan restored and status set to active.`);
      }
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process payment.");
    } finally {
      setActionBusy(null);
    }
  }

  function handleEdit(customer: Customer) {
    setEditingCustomer(customer);
    form.reset({
      fullName: customer.fullName,
      contactNumber: customer.contactNumber === "-" ? "" : customer.contactNumber,
      email: customer.email === "-" ? "" : customer.email,
      pppoeUsername: customer.pppoeUsername,
      pppoePassword: "",
      plan: plans.find((p) => p.plan_name === customer.plan || p.speed === customer.plan)?.plan_name || "",
      address: customer.address === "-" ? "" : customer.address,
      installationDate: customer.installationDate || new Date().toISOString().split("T")[0],
      dueDate: formatToDatetimeLocal(customer.dueDate),
    });
    setModalOpen(true);
  }

  async function onSubmit(values: CustomerForm) {
    if (!editingCustomer && !values.pppoePassword) {
      toast.error("PPPoE Password is required for new customers.");
      return;
    }

    try {
      const selectedPlan = plans.find((p) => p.plan_name === values.plan);
      const payload = {
        id: editingCustomer?.id || undefined,
        account_number: editingCustomer?.accountNumber || "auto",
        full_name: values.fullName,
        contact_number: values.contactNumber,
        email: values.email || null,
        pppoe_username: values.pppoeUsername,
        pppoe_password: values.pppoePassword || undefined,
        plan_id: selectedPlan?.id || null,
        status: "active",
        address: values.address || null,
        installation_date: values.installationDate,
        due_date: values.dueDate ? new Date(values.dueDate).toISOString() : null,
      };

      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save customer.");

      toast.success(editingCustomer ? "Customer updated successfully." : "Customer saved to database.");
      setModalOpen(false);
      setEditingCustomer(null);
      form.reset();
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save customer.");
    }
  }

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: "accountNumber",
        header: "Account #",
        cell: ({ row }) => <span className="font-medium text-slate-950 dark:text-white">{row.original.accountNumber}</span>,
        meta: { className: "hidden sm:table-cell" },
      },
      { accessorKey: "fullName", header: "Customer" },
      { 
        accessorKey: "contactNumber", 
        header: "Contact",
        meta: { className: "hidden md:table-cell" },
      },
      { 
        accessorKey: "pppoeUsername", 
        header: "PPPoE Username",
        meta: { className: "hidden lg:table-cell" },
      },
      { accessorKey: "plan", header: "Plan" },
      { 
        accessorKey: "uptime", 
        header: "Uptime",
        meta: { className: "hidden xl:table-cell" },
      },
      {
         id: "remainingDays",
         header: "Remaining Days",
         cell: ({ row }) => {
           if (row.original.paidThisMonth) {
             return (
               <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:text-emerald-300 border-none">
                 ✓ Paid
               </Badge>
             );
           }
           const days = calculateRemainingDays(row.original.dueDate);
           const isOverdue = days.includes("overdue");
           return (
             <span className={isOverdue ? "font-semibold text-rose-600" : days === "Today" ? "font-semibold text-amber-600" : "text-slate-600 dark:text-slate-300"}>
               {days}
             </span>
           );
         }
       },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedCustomer(row.original); setIsMobileDetailOpen(true); }}>
              <Eye className="mr-1 h-4 w-4" /> Profile
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
              Edit
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={actionBusy === row.original.pppoeUsername || row.original.paidThisMonth}
              onClick={() => void handlePayAction(row.original.pppoeUsername)}
              title={row.original.paidThisMonth ? "Already paid this month" : "Mark as paid"}
            >
              {actionBusy === row.original.pppoeUsername ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              {row.original.paidThisMonth ? "✓ Paid" : "Paid"}
            </Button>
          </div>
        ),
      },
    ],
    [activeCustomers, plans, actionBusy],
  );

  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage subscriber records with active connections on the MikroTik PPPoE server."
        actions={
          <>
            <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
              Refresh Connections
            </Button>
            <Button onClick={() => { setEditingCustomer(null); form.reset({ fullName: "", contactNumber: "", email: "", pppoeUsername: "", pppoePassword: "", plan: "", address: "", installationDate: new Date().toISOString().split("T")[0], dueDate: formatToDatetimeLocal(null) }); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          </>
        }
      />

      {routerError && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300 animate-in fade-in duration-300">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <h5 className="font-semibold text-amber-900 dark:text-amber-200">MikroTik Router Offline</h5>
            <p className="mt-1 text-sm leading-relaxed text-amber-800/90 dark:text-amber-300/90">
              The billing system cannot reach the MikroTik router. Please verify that your VPN connection is active and that the router is online.
            </p>
            <p className="mt-2 text-xs font-mono text-amber-750 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-950/40 px-2 py-1 rounded w-fit">
              Details: {routerError}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="w-full">
          <Card>
            <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Active PPPoE Connections ({activeCustomers.length})</CardTitle>
                <CardDescription>Showing only subscribers with active RouterOS PPPoE sessions.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={activeCustomers} searchPlaceholder="Search active connections..." />
            </CardContent>
          </Card>
        </div>
      )}

      {isMobileDetailOpen && selectedCustomer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setIsMobileDetailOpen(false)} />
          <Card className="relative z-10 w-full max-w-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 animate-in slide-in-from-bottom duration-300">
            <CardHeader className="flex-row items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-900">
              <div>
                <CardTitle>Connection Profile</CardTitle>
                <CardDescription>Live connection stats and database info.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedCustomer.status} />
                <Button variant="ghost" size="icon" onClick={() => setIsMobileDetailOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-slate-950 dark:text-white">{selectedCustomer.fullName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedCustomer.accountNumber}</p>
                </div>
                <div className="grid gap-2.5 text-sm max-h-[40vh] overflow-y-auto pr-1">
                  <Info label="Plan Profile" value={selectedCustomer.plan} />
                  <Info label="PPPoE User" value={selectedCustomer.pppoeUsername} />
                  <Info label="IP Address" value={selectedCustomer.ipAddress ?? "-"} />
                  <Info label="MAC Address" value={selectedCustomer.callerId ?? "-"} />
                  <Info label="Session Uptime" value={selectedCustomer.uptime ?? "-"} />
                  <Info label="Contact Phone" value={selectedCustomer.contactNumber} />
                  <Info label="Installation Address" value={selectedCustomer.address} />
                  <Info label="Installed Date" value={selectedCustomer.installationDate ?? "-"} />
                  <Info label="Due Date" value={formatToReadableDatetime(selectedCustomer.dueDate)} />
                  <Info 
                    label="Paid This Month" 
                    value={selectedCustomer.paidThisMonth ? "Yes (✓ Paid)" : "No"} 
                    valueClassName={selectedCustomer.paidThisMonth ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-medium"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-900">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy === selectedCustomer.pppoeUsername || selectedCustomer.status === "active"}
                    onClick={() => void handleStatusAction(selectedCustomer.pppoeUsername, "/api/mikrotik/enable", `${selectedCustomer.pppoeUsername} enabled.`)}
                    className="w-full justify-center"
                  >
                    <Wifi className="mr-1.5 h-4 w-4" /> Enable
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={actionBusy === selectedCustomer.pppoeUsername || selectedCustomer.status === "disabled"}
                    onClick={() => void handleStatusAction(selectedCustomer.pppoeUsername, "/api/mikrotik/disable", `${selectedCustomer.pppoeUsername} disabled.`)}
                    className="w-full justify-center"
                  >
                    <WifiOff className="mr-1.5 h-4 w-4" /> Disable
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy === selectedCustomer.pppoeUsername}
                    onClick={() => void handleStatusAction(selectedCustomer.pppoeUsername, "/api/mikrotik/disconnect", `${selectedCustomer.pppoeUsername} disconnected.`)}
                    className="w-full justify-center"
                  >
                    <Unplug className="mr-1.5 h-4 w-4" /> Kick
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={actionBusy === selectedCustomer.pppoeUsername}
                    onClick={() => void handlePayAction(selectedCustomer.pppoeUsername)}
                  >
                    <CreditCard className="mr-1.5 h-4 w-4" /> Paid
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</CardTitle>
                <CardDescription>Create or update customer records with their PPPoE username.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setModalOpen(false); setEditingCustomer(null); }}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
                {editingCustomer && (
                  <Field label="Account Number">
                    <Input value={editingCustomer.accountNumber} disabled className="bg-slate-100 dark:bg-slate-900" />
                  </Field>
                )}
                <Field label="Full Name" error={form.formState.errors.fullName?.message}><Input {...form.register("fullName")} placeholder="Customer name" /></Field>
                <Field label="Contact Number" error={form.formState.errors.contactNumber?.message}><Input {...form.register("contactNumber")} placeholder="0917 000 0000" /></Field>
                <Field label="Email" error={form.formState.errors.email?.message}><Input {...form.register("email")} placeholder="customer@example.com" /></Field>
                <Field label="PPPoE Username" error={form.formState.errors.pppoeUsername?.message}><Input {...form.register("pppoeUsername")} placeholder="subscriber128" disabled={!!editingCustomer} /></Field>
                {!editingCustomer && (
                  <Field label="PPPoE Password" error={form.formState.errors.pppoePassword?.message}>
                    <Input type="password" {...form.register("pppoePassword")} placeholder="Password for PPPoE account" />
                  </Field>
                )}
                <Field label="Assigned Plan" error={form.formState.errors.plan?.message}>
                  <Select {...form.register("plan")}>
                    <option value="">Select internet plan</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.plan_name}>{plan.plan_name}</option>)}
                  </Select>
                </Field>
                <Field label="Installed Date" error={form.formState.errors.installationDate?.message}>
                  <Input type="date" {...form.register("installationDate")} />
                </Field>
                <Field label="Due Date" error={form.formState.errors.dueDate?.message}>
                  <Input type="datetime-local" {...form.register("dueDate")} />
                </Field>
                <Field label="Address" className="md:col-span-2" error={form.formState.errors.address?.message}><Textarea {...form.register("address")} placeholder="Installation address" /></Field>
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 md:col-span-2">
                  <Button type="button" variant="outline" onClick={() => { setModalOpen(false); setEditingCustomer(null); }}>Cancel</Button>
                  <Button type="submit">Save Customer</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-900">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-right font-medium ${valueClassName ?? "text-slate-950 dark:text-white"}`}>{value}</span>
    </div>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${className ?? ""}`}>
      {label}
      {children}
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}
