"use client";

import { useState, useEffect, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FilePlus,
  Info,
  Mail,
  MailCheck,
  MailX,
  Printer,
  Receipt,
  Search,
  Send,
  Settings2,
  TrendingUp,
  X,
  CreditCard,
  User,
  Activity,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { formatCurrency } from "@/src/lib/utils";

type Bill = {
  id: string;
  customer_id: string;
  billing_year: number;
  billing_month: number;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_due: number;
  status: "paid" | "unpaid" | "overdue" | "suspended";
  paid_at: string | null;
  suspended_at: string | null;
  created_at: string;
  reminder_sent_at: string | null;
  sms_reminder_sent_at?: string | null;
  customers?: {
    full_name: string;
    account_number: string;
    email?: string | null;
    contact_number?: string | null;
    pppoe_username: string;
    status: string;
    plans?: {
      plan_name: string;
      speed: string;
      monthly_fee: number;
    };
  };
  payments?: Array<{
    id: string;
    method: string;
    reference_number: string | null;
    amount_paid: number;
    status: string;
    submitted_at: string;
    reviewed_at: string;
  }>;
};

type Analytics = {
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  collectionEfficiencyRate: number;
  averageLatencyDays: number;
  methods: {
    gcash: number;
    maya: number;
    bank_transfer: number;
    cash: number;
  };
  monthlyCollectionEfficiency: Record<string, { invoiced: number; collected: number; rate: number }>;
  monthlyRevenueTrend: Array<{ month: string; revenue: number }>;
};

type ReminderScheduleConfig = {
  enabled: boolean;
  hour: number;
  minute: number;
  daysBeforeDue: number;
  channels: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const DEFAULT_SCHEDULE: ReminderScheduleConfig = {
  enabled: false,
  hour: 8,
  minute: 0,
  daysBeforeDue: 3,
  channels: ["email", "sms"],
  lastRunAt: null,
  nextRunAt: null,
};

export default function BillingPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  // Track which bill is currently having a reminder sent (by bill id)
  const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);
  // Confirmation modal state: holds the bill to confirm before sending
  const [confirmBill, setConfirmBill] = useState<Bill | null>(null);
  const [sendEmailChannel, setSendEmailChannel] = useState(true);
  const [sendSmsChannel, setSendSmsChannel] = useState(true);

  // ── Auto-Reminder Schedule State ────────────────────────────────────────────
  const [scheduleConfig, setScheduleConfig] = useState<ReminderScheduleConfig>(DEFAULT_SCHEDULE);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  // Local editable copy (only saved when user clicks Save)
  const [editSchedule, setEditSchedule] = useState<ReminderScheduleConfig>(DEFAULT_SCHEDULE);

  useEffect(() => {
    if (confirmBill) {
      setSendEmailChannel(!!confirmBill.customers?.email);
      setSendSmsChannel(!!confirmBill.customers?.contact_number && confirmBill.customers?.contact_number !== "-");
    }
  }, [confirmBill]);

  async function loadBillingData() {
    setLoading(true);
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to fetch billings.");
      setBills(payload.bills);
      setAnalytics(payload.analytics);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load billing history.");
    } finally {
      setLoading(false);
    }
  }

  async function loadScheduleConfig() {
    setScheduleLoading(true);
    try {
      const res = await fetch("/api/billing/reminders/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load schedule.");
      setScheduleConfig(data.config);
      setEditSchedule(data.config);
    } catch {
      // Non-fatal — use defaults silently
    } finally {
      setScheduleLoading(false);
    }
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    try {
      const res = await fetch("/api/billing/reminders/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSchedule),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setScheduleConfig(data.config);
      setEditSchedule(data.config);
      toast.success(
        data.config.enabled
          ? `✅ Auto-reminders enabled — daily at ${String(data.config.hour).padStart(2, "0")}:${String(data.config.minute).padStart(2, "0")} PHT, ${data.config.daysBeforeDue} day(s) before due.`
          : "Auto-reminders disabled."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save schedule.");
    } finally {
      setScheduleSaving(false);
    }
  }

  /** Opens the confirmation modal — actual send happens in confirmAndSend() */
  function handleSendReminderForBill(bill: Bill) {
    const hasEmail = !!bill.customers?.email;
    const hasPhone = !!bill.customers?.contact_number && bill.customers?.contact_number !== "-";
    if (!hasEmail && !hasPhone) {
      toast.error(`Neither email nor phone number is on file for ${bill.customers?.full_name ?? "this customer"}. Please update their profile first.`);
      return;
    }
    setConfirmBill(bill);
  }

  /** Called when the user clicks "Send" inside the confirmation modal */
  async function confirmAndSend() {
    if (!confirmBill) return;
    const bill = confirmBill;

    const selectedChannels: string[] = [];
    if (sendEmailChannel) selectedChannels.push("email");
    if (sendSmsChannel) selectedChannels.push("sms");

    if (selectedChannels.length === 0) {
      toast.error("Please select at least one notification channel.");
      return;
    }

    setConfirmBill(null);
    setSendingReminderFor(bill.id);
    try {
      const response = await fetch(`/api/billing/reminders/${bill.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: selectedChannels }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to send reminder.");

      let msg = "✅ Reminders sent:";
      if (payload.emailSent) msg += " Email";
      if (payload.smsSent) msg += (payload.emailSent ? " &" : "") + " SMS";
      toast.success(msg);

      // Optimistically update the bill in state
      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id
            ? {
                ...b,
                reminder_sent_at: payload.emailSent ? payload.sentAt : b.reminder_sent_at,
                sms_reminder_sent_at: payload.smsSent ? payload.sentAt : b.sms_reminder_sent_at,
              }
            : b
        )
      );
      if (selectedBill?.id === bill.id) {
        setSelectedBill((prev) =>
          prev
            ? {
                ...prev,
                reminder_sent_at: payload.emailSent ? payload.sentAt : prev.reminder_sent_at,
                sms_reminder_sent_at: payload.smsSent ? payload.sentAt : prev.sms_reminder_sent_at,
              }
            : prev
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reminders.");
    } finally {
      setSendingReminderFor(null);
    }
  }

  async function handleSendReminders() {
    setSendingReminders(true);
    try {
      const response = await fetch("/api/billing/reminders", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to send reminders.");

      const emailSent = payload.email?.sent ?? 0;
      const smsSent = payload.sms?.sent ?? 0;
      const emailErrors = payload.email?.errorCount ?? 0;
      const smsErrors = payload.sms?.errorCount ?? 0;

      if (emailSent === 0 && smsSent === 0) {
        toast.info("No unpaid bills due in 3 days — no reminders sent.");
      } else {
        toast.success(
          `✅ Reminders sent: ${emailSent} via Email, ${smsSent} via SMS.` +
          (emailErrors > 0 || smsErrors > 0 ? ` Errors: ${emailErrors + smsErrors}.` : "")
        );
        void loadBillingData();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send billing reminders.");
    } finally {
      setSendingReminders(false);
    }
  }

  async function handleGenerateBills() {
    setGenerating(true);
    try {
      const response = await fetch("/api/billing/generate", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Generation job failed.");
      toast.success(payload.message ?? "Monthly billing invoices successfully generated.");
      void loadBillingData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate monthly bills.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    void loadBillingData();
    void loadScheduleConfig();
  }, []);

  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Table columns definition
  const columns = useMemo<ColumnDef<Bill>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Billing ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold select-all text-slate-500 dark:text-slate-400">
            {row.original.id.substring(0, 8).toUpperCase()}...
          </span>
        ),
      },
      {
        id: "accountNumber",
        header: "Account #",
        accessorFn: (row) => row.customers?.account_number ?? "-",
      },
      {
        id: "customerName",
        header: "Customer",
        accessorFn: (row) => row.customers?.full_name ?? "-",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{row.original.customers?.full_name ?? "-"}</span>
            <span className="text-[10px] font-mono text-slate-400">{row.original.customers?.pppoe_username ?? "-"}</span>
          </div>
        ),
      },
      {
        id: "plan",
        header: "Plan Package",
        accessorFn: (row) => row.customers?.plans?.plan_name ?? "-",
      },
      {
        accessorKey: "amount_due",
        header: "Amount Due",
        cell: ({ row }) => formatCurrency(Number(row.original.amount_due)),
      },
      {
        id: "billingPeriod",
        header: "Billing Period",
        cell: ({ row }) => {
          const b = row.original;
          const fmt = (d: string | null) =>
            d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }) : "—";
          const start = b.status === "paid" && b.paid_at ? b.paid_at : b.billing_period_start;
          const end   = b.due_date;
          return (
            <div className="flex flex-col text-xs leading-tight">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{fmt(start)}</span>
              <span className="text-slate-400">→ {fmt(end)}</span>
            </div>
          );
        },
      },
      {
        id: "datePaid",
        header: "Date Paid",
        accessorFn: (row) => row.paid_at ? row.paid_at.split("T")[0] : "-",
        cell: ({ row }) => (
          <span className={row.original.status === "paid" ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400 dark:text-slate-600"}>
            {row.original.paid_at ? row.original.paid_at.split("T")[0] : "-"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "reminders",
        header: "Reminders",
        cell: ({ row }) => {
          const bill = row.original;
          const emailSent = bill.reminder_sent_at;
          const smsSent = bill.sms_reminder_sent_at;
          const hasEmail = !!bill.customers?.email;
          const hasPhone = !!bill.customers?.contact_number && bill.customers?.contact_number !== "-";
          const isSending = sendingReminderFor === bill.id;
          const isPaid = bill.status === "paid";

          return (
            <div className="flex items-center gap-2.5">
              <div className="flex flex-col gap-1 shrink-0">
                {/* Email indicator */}
                {emailSent ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5"
                    title={`Email sent: ${new Date(emailSent).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`}
                  >
                    <MailCheck className="h-2.5 w-2.5" />
                    Email
                  </span>
                ) : hasEmail ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-2 py-0.5">
                    <MailX className="h-2.5 w-2.5" /> Email
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-full px-2 py-0.5">
                    <MailX className="h-2.5 w-2.5" /> No Email
                  </span>
                )}

                {/* SMS indicator */}
                {smsSent ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5"
                    title={`SMS sent: ${new Date(smsSent).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`}
                  >
                    <MessageSquare className="h-2.5 w-2.5 text-sky-600 dark:text-sky-400" />
                    SMS
                  </span>
                ) : hasPhone ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-2 py-0.5">
                    <MessageSquare className="h-2.5 w-2.5 text-slate-400 dark:text-slate-600" /> SMS
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-full px-2 py-0.5">
                    <MessageSquare className="h-2.5 w-2.5 text-amber-500" /> No Phone
                  </span>
                )}
              </div>

              {!isPaid && (
                <button
                  title={(!hasEmail && !hasPhone) ? "No email or phone on file" : "Send reminders"}
                  disabled={isSending || (!hasEmail && !hasPhone)}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSendReminderForBill(bill);
                  }}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  {isSending ? (
                    <span className="h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBill(row.original);
            }}
          >
            Details
          </Button>
        ),
      },
    ],
    [sendingReminderFor]
  );

  // Status summaries counting
  const paidCount = bills.filter((b) => b.status === "paid").length;
  const unpaidCount = bills.filter((b) => b.status === "unpaid").length;
  const overdueCount = bills.filter((b) => b.status === "overdue").length;
  const suspendedCount = bills.filter((b) => b.status === "suspended").length;

  // Render Horizontal Method distribution bar
  const renderMethodBar = () => {
    if (!analytics) return null;
    const { gcash, maya, bank_transfer, cash } = analytics.methods;
    const total = gcash + maya + bank_transfer + cash;
    if (total === 0) return <p className="text-xs text-slate-500 text-center py-4">No verified payment distribution data.</p>;

    const pc = (val: number) => Math.round((val / total) * 100);
    const shares = [
      { name: "GCash", value: gcash, pct: pc(gcash), color: "bg-blue-500" },
      { name: "Maya", value: maya, pct: pc(maya), color: "bg-emerald-500" },
      { name: "Bank Transfer", value: bank_transfer, pct: pc(bank_transfer), color: "bg-amber-500" },
      { name: "Cash", value: cash, pct: pc(cash), color: "bg-slate-500" },
    ].filter((s) => s.value > 0);

    return (
      <div className="space-y-4 mt-2">
        <div className="h-3.5 rounded-full overflow-hidden flex w-full">
          {shares.map((share) => (
            <div
              key={share.name}
              className={`${share.color} h-full transition-all`}
              style={{ width: `${share.pct}%` }}
              title={`${share.name}: ${share.pct}% (${share.value} payments)`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
          {shares.map((share) => (
            <div key={share.name} className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${share.color}`} />
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                {share.name}: <span className="font-bold text-slate-900 dark:text-slate-200">{share.pct}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Reminders & Details"
        description="Live customer subscription status tracking, due-date alert dispatch controls, and collection turnaround health."
        actions={
          <>
            <Button variant="outline" onClick={() => { void loadBillingData(); void loadScheduleConfig(); }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSendReminders()}
              disabled={sendingReminders || loading}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              <Send className={`h-4 w-4 ${sendingReminders ? "animate-pulse" : ""}`} />
              {sendingReminders ? "Sending..." : "Send Now"}
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </section>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Status Metric Grid */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Active Subscriptions" value={paidCount} status="paid" />
            <Summary label="Pending Due" value={unpaidCount} status="unpaid" />
            <Summary label="Overdue Accounts" value={overdueCount} status="overdue" />
            <Summary label="Suspended Accounts" value={suspendedCount} status="suspended" />
          </section>

          {/* Data Analysis and Insights Panels */}
          {analytics && (
            <section className="grid gap-6 xl:grid-cols-3">
              {/* Financial Performance Card */}
              <Card className="xl:col-span-2">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/40 dark:border-slate-800/40">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Collection Efficiency & Revenue Analysis
                  </CardTitle>
                  <CardDescription>turnaround rates, paid revenues, and outstanding billing balances</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Indicators Grid */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-xs text-slate-500">Collection Efficiency</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                          {analytics.collectionEfficiencyRate}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">TARGET: 95%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${analytics.collectionEfficiencyRate}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-xs text-slate-500">Average Turnaround</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
                          {analytics.averageLatencyDays}
                        </span>
                        <span className="text-sm font-medium text-slate-500">days</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Average time customers take to pay bills
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-xs text-slate-500">Outstanding Receivable</span>
                      <span className="text-2xl font-extrabold mt-2 text-rose-500">
                        {formatCurrency(analytics.outstandingBalance)}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3 text-rose-500" /> Revenue locked in unpaid/overdue bills
                      </p>
                    </div>
                  </div>

                  {/* Monthly Efficiency breakdowns */}
                  <div className="border-t border-slate-200 dark:border-slate-800/50 pt-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                      Monthly Efficiency breakdowns
                    </h4>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Month</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Total Billed</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Total Collected</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400 text-right">Efficiency Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.keys(analytics.monthlyCollectionEfficiency).map((month) => {
                            const item = analytics.monthlyCollectionEfficiency[month];
                            return (
                              <TableRow key={month} className="hover:bg-transparent">
                                <TableCell className="py-2.5 font-medium">{month}</TableCell>
                                <TableCell className="py-2.5">{formatCurrency(item.invoiced)}</TableCell>
                                <TableCell className="py-2.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                  {formatCurrency(item.collected)}
                                </TableCell>
                                <TableCell className="py-2.5 text-right font-bold text-slate-900 dark:text-slate-200">
                                  {item.rate}%
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Channels Card */}
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/40 dark:border-slate-800/40">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-blue-500" />
                      Payment Channels Distribution
                    </CardTitle>
                    <CardDescription>GCash, Maya, Bank, and Cash customer share</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {renderMethodBar()}
                  </CardContent>
                </div>

                <div className="p-6 border-t border-slate-200/50 dark:border-slate-800/50 bg-slate-50/20 dark:bg-slate-900/10">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Revenue Growth History (Paid)
                  </h4>
                  <div className="space-y-2.5">
                    {analytics.monthlyRevenueTrend.map((trend) => (
                      <div key={trend.month} className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">{trend.month}</span>
                        <div className="flex items-center gap-3 flex-1 px-4">
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 flex-1 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${(trend.revenue / 20000) * 100}%` }} // normalized to max expected 20k for demo
                            />
                          </div>
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(trend.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* ── Auto-Reminder Schedule Panel ─────────────────────────────── */}
          <Card className="border-2 border-dashed border-violet-200 dark:border-violet-800/50 bg-violet-50/30 dark:bg-violet-950/10">
            <div
              className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
              onClick={() => setScheduleExpanded((p) => !p)}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Auto-Reminder Schedule</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {scheduleConfig.enabled
                      ? `● Enabled — runs daily at ${String(scheduleConfig.hour).padStart(2, "0")}:${String(scheduleConfig.minute).padStart(2, "0")} PHT, ${scheduleConfig.daysBeforeDue} day(s) before due`
                      : "○ Disabled — reminders are manual only"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {scheduleConfig.enabled && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-full px-2.5 py-1">
                    <Zap className="h-2.5 w-2.5" /> AUTO
                  </span>
                )}
                {scheduleExpanded
                  ? <ChevronUp className="h-4 w-4 text-slate-400" />
                  : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </div>
            </div>

            {scheduleExpanded && (
              <div className="border-t border-violet-200/60 dark:border-violet-800/40 px-6 pb-6 pt-4">
                {scheduleLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="h-4 w-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    Loading schedule...
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Enable toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        role="switch"
                        aria-checked={editSchedule.enabled}
                        onClick={() => setEditSchedule((p) => ({ ...p, enabled: !p.enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          editSchedule.enabled
                            ? "bg-violet-600"
                            : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            editSchedule.enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {editSchedule.enabled ? "Auto-send enabled" : "Auto-send disabled"}
                      </span>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {/* Time */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Send Time (PHT)</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="schedule-hour"
                            type="number"
                            min={0} max={23}
                            value={editSchedule.hour}
                            onChange={(e) => setEditSchedule((p) => ({ ...p, hour: Math.min(23, Math.max(0, Number(e.target.value))) }))}
                            className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <span className="text-slate-400 font-bold">:</span>
                          <input
                            id="schedule-minute"
                            type="number"
                            min={0} max={59}
                            value={editSchedule.minute}
                            onChange={(e) => setEditSchedule((p) => ({ ...p, minute: Math.min(59, Math.max(0, Number(e.target.value))) }))}
                            className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                        </div>
                      </div>

                      {/* Days before due */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Days Before Due</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="schedule-days"
                            type="number"
                            min={1} max={30}
                            value={editSchedule.daysBeforeDue}
                            onChange={(e) => setEditSchedule((p) => ({ ...p, daysBeforeDue: Math.min(30, Math.max(1, Number(e.target.value))) }))}
                            className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <span className="text-xs text-slate-500">days</span>
                        </div>
                      </div>

                      {/* Channels */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Channels</label>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editSchedule.channels.includes("email")}
                              onChange={(e) => setEditSchedule((p) => ({
                                ...p,
                                channels: e.target.checked
                                  ? [...new Set([...p.channels, "email"])]
                                  : p.channels.filter((c) => c !== "email"),
                              }))}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-violet-600 focus:ring-violet-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 text-slate-400" /> Email
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editSchedule.channels.includes("sms")}
                              onChange={(e) => setEditSchedule((p) => ({
                                ...p,
                                channels: e.target.checked
                                  ? [...new Set([...p.channels, "sms"])]
                                  : p.channels.filter((c) => c !== "sms"),
                              }))}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-violet-600 focus:ring-violet-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                              <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> SMS
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Last/next run info */}
                    {(scheduleConfig.lastRunAt) && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5">
                        <Info className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        <span>
                          Last auto-run:{" "}
                          <strong className="text-slate-700 dark:text-slate-300">
                            {new Date(scheduleConfig.lastRunAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                          </strong>
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                        disabled={scheduleSaving || editSchedule.channels.length === 0}
                        onClick={() => void saveSchedule()}
                      >
                        {scheduleSaving ? (
                          <span className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Settings2 className="h-4 w-4" />
                        )}
                        {scheduleSaving ? "Saving..." : "Save Schedule"}
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                        disabled={sendingReminders}
                        onClick={() => void handleSendReminders()}
                      >
                        <Send className={`h-4 w-4 ${sendingReminders ? "animate-pulse" : ""}`} />
                        {sendingReminders ? "Sending..." : "Run Now"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Billing Records Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Due Dates & Reminders</CardTitle>
              <CardDescription>
                Live subscriber due-date registry. Click 'Details' to view payment history logs, PPPoE status, and dispatch reminders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={bills}
                searchPlaceholder="Search customers..."
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Slide-out Customer Details Drawer */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end" aria-modal="true" role="dialog">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedBill(null)}
          />

          {/* Drawer Wrapper */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-950 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 transition-transform duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold leading-tight text-slate-950 dark:text-white">
                    Invoice Details
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {selectedBill.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedBill.status} />
                <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedBill(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Financial Breakdowns */}
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Monthly Amount Billed</span>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {formatCurrency(Number(selectedBill.amount_due))}
                  </span>
                </div>
                <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-slate-400">Billing Period</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedBill.status === "paid" && selectedBill.paid_at
                        ? new Date(selectedBill.paid_at).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })
                        : new Date(selectedBill.billing_period_start).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}{" "}
                      to{" "}
                      {new Date(selectedBill.due_date).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400">Due Date</span>
                    <span className="font-semibold text-rose-500">
                      {selectedBill.due_date}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Particulars */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  Customer Information
                </h3>
                <div className="bg-white dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-3">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400">Full Name</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedBill.customers?.full_name ?? "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400">Account Number</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedBill.customers?.account_number ?? "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400">PPPoE Username</span>
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{selectedBill.customers?.pppoe_username ?? "-"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Billing Plan</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedBill.customers?.plans?.plan_name ?? "-"} ({selectedBill.customers?.plans?.speed ?? "-"})
                    </span>
                  </div>
                </div>
              </div>

              {/* Reminders Status */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-slate-500" />
                  Notifications & Reminders
                </h3>
                <div className="bg-white dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-3">
                  {/* Email row */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedBill.customers?.email ?? <span className="text-amber-500 italic">No email</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900 pb-2">
                    <span className="text-slate-400">Email Status</span>
                    {selectedBill.reminder_sent_at ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <MailCheck className="h-3.5 w-3.5" />
                        Sent: {new Date(selectedBill.reminder_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <MailX className="h-3.5 w-3.5" /> Not sent
                      </span>
                    )}
                  </div>

                  {/* SMS row */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900 pt-1">
                    <span className="text-slate-400 flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> SMS (httpSMS)</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedBill.customers?.contact_number && selectedBill.customers.contact_number !== "-" ? (
                        selectedBill.customers.contact_number
                      ) : (
                        <span className="text-amber-500 italic">No contact number</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 pt-1">
                    <span className="text-slate-400">SMS Status</span>
                    {selectedBill.sms_reminder_sent_at ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-sky-600 dark:text-sky-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Sent: {new Date(selectedBill.sms_reminder_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> Not sent
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Reconciliation Logs */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                  Payment Reconciliation History
                </h3>
                {selectedBill.status === "paid" ? (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-xs space-y-3">
                    {selectedBill.payments && selectedBill.payments.length > 0 ? (
                      (() => {
                        const pay = selectedBill.payments.find((p) => p.status === "verified") || selectedBill.payments[0];
                        
                        // Payment speed details
                        let timingMessage = "Paid on time";
                        const dueTime = new Date(selectedBill.due_date).getTime();
                        const paidTime = new Date(pay.submitted_at).getTime();
                        const daysDiff = Math.round((paidTime - dueTime) / (1000 * 60 * 60 * 24));
                        if (daysDiff < 0) {
                          timingMessage = `Paid ${Math.abs(daysDiff)} days BEFORE due date`;
                        } else if (daysDiff > 0) {
                          timingMessage = `Paid ${daysDiff} days OVERDUE`;
                        }

                        return (
                          <>
                            <div className="flex justify-between py-1 border-b border-emerald-500/10">
                              <span className="text-slate-400">Receipt Amount</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(pay.amount_paid)}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-500/10">
                              <span className="text-slate-400">Payment Gateway</span>
                              <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{pay.method}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-500/10">
                              <span className="text-slate-400">Reference Number</span>
                              <span className="font-mono font-semibold select-all text-slate-800 dark:text-slate-200">{pay.reference_number ?? "N/A"}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-500/10">
                              <span className="text-slate-400">Submission Date</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(pay.submitted_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-500/10">
                              <span className="text-slate-400">Turnaround Speed</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{timingMessage}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-slate-400">Verification Audit</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {new Date(pay.reviewed_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                              </span>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <p className="text-slate-500 py-1">Reconciliation marked paid manually (no transaction receipts).</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/40 rounded-2xl p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <Clock className="h-5 w-5 text-slate-400" />
                    <span>No verified payment transaction logs registered for this bill yet.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-200/80 px-6 py-4 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center gap-2">
                {selectedBill.status !== "paid" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendingReminderFor === selectedBill.id || (!selectedBill.customers?.email && (!selectedBill.customers?.contact_number || selectedBill.customers?.contact_number === "-"))}
                    title={(!selectedBill.customers?.email && (!selectedBill.customers?.contact_number || selectedBill.customers?.contact_number === "-")) ? "No email or phone on file" : "Send reminders"}
                    onClick={() => void handleSendReminderForBill(selectedBill)}
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                  >
                    {sendingReminderFor === selectedBill.id ? (
                      <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sendingReminderFor === selectedBill.id
                      ? "Sending..."
                      : "Send Reminders"}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toast.success("PDF invoice download queued.")}>
                  <Printer className="h-4 w-4 mr-2" /> Invoice PDF
                </Button>
                {selectedBill.status !== "paid" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.success(`Due date extension queued for ${selectedBill.customers?.full_name}`);
                    }}
                  >
                    <CalendarClock className="h-4 w-4 mr-2" /> Extend Due Date
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ─── Email & SMS Reminder Confirmation Modal ───────────────── */}
      {confirmBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmBill(null)}
          />

          {/* Modal card */}
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200/80 dark:ring-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Send className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 id="confirm-modal-title" className="text-base font-bold text-white">
                      Send Billing Reminder
                    </h2>
                    <p className="text-xs text-blue-100 mt-0.5">Select reminder channels</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmBill(null)}
                  className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Previously-sent info note (neutral, not a warning) */}
              {(confirmBill.reminder_sent_at || confirmBill.sms_reminder_sent_at) && (
                <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
                  <div>
                    <span className="font-semibold block text-slate-700 dark:text-slate-300">Previously sent:</span>
                    {confirmBill.reminder_sent_at && (
                      <span className="block mt-0.5">
                        • Email: <strong>{new Date(confirmBill.reminder_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong>
                      </span>
                    )}
                    {confirmBill.sms_reminder_sent_at && (
                      <span className="block mt-0.5">
                        • SMS: <strong>{new Date(confirmBill.sms_reminder_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Customer details */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 font-bold uppercase tracking-wider text-slate-400">
                  Customer Details
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-slate-500">Name</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {confirmBill.customers?.full_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-slate-500">Account #</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {confirmBill.customers?.account_number ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-slate-500">Amount Due</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(Number(confirmBill.amount_due))}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {confirmBill.due_date}
                    </span>
                  </div>
                </div>
              </div>

              {/* Channel Selector */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 font-bold uppercase tracking-wider text-slate-400">
                  Choose Channels to Send
                </div>
                <div className="p-4 space-y-4">
                  {/* Email Channel */}
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendEmailChannel}
                      disabled={!confirmBill.customers?.email}
                      onChange={(e) => setSendEmailChannel(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-500" /> Email Notification
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        {confirmBill.customers?.email ? (
                          `Deliver to: ${confirmBill.customers.email}`
                        ) : (
                          <span className="text-amber-500 italic">No email address on file</span>
                        )}
                      </span>
                    </div>
                  </label>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-2" />

                  {/* SMS Channel */}
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendSmsChannel}
                      disabled={!confirmBill.customers?.contact_number || confirmBill.customers?.contact_number === "-"}
                      onChange={(e) => setSendSmsChannel(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-500" /> SMS Notification (httpSMS)
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        {confirmBill.customers?.contact_number && confirmBill.customers.contact_number !== "-" ? (
                          `Deliver to: ${confirmBill.customers.contact_number}`
                        ) : (
                          <span className="text-amber-500 italic">No contact number on file</span>
                        )}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmBill(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => void confirmAndSend()}
                disabled={!sendEmailChannel && !sendSmsChannel}
              >
                <Send className="h-4 w-4" />
                Send Reminder(s)
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Summary({ label, value, status }: { label: string; value: number; status: string }) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <Badge variant={status === "paid" ? "success" : status === "unpaid" ? "warning" : "danger"}>
          {status}
        </Badge>
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-tight">{value}</p>
    </Card>
  );
}
