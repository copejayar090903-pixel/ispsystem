"use client";

import { useState, useEffect, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  Clock,
  Download,
  FilePlus,
  Mail,
  MailCheck,
  MailX,
  Printer,
  Receipt,
  Search,
  Send,
  TrendingUp,
  X,
  CreditCard,
  User,
  Activity,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
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
  customers?: {
    full_name: string;
    account_number: string;
    email?: string | null;
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

  /** Opens the confirmation modal — actual send happens in confirmAndSend() */
  function handleSendReminderForBill(bill: Bill) {
    if (!bill.customers?.email) {
      toast.error(`No email on file for ${bill.customers?.full_name ?? "this customer"}. Please update their profile first.`);
      return;
    }
    setConfirmBill(bill);
  }

  /** Called when the user clicks "Send" inside the confirmation modal */
  async function confirmAndSend() {
    if (!confirmBill) return;
    const bill = confirmBill;
    setConfirmBill(null);
    setSendingReminderFor(bill.id);
    try {
      const response = await fetch(`/api/billing/reminders/${bill.id}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to send reminder.");
      toast.success(`✅ Reminder sent to ${payload.email}`);
      // Optimistically update the bill in state
      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id ? { ...b, reminder_sent_at: payload.sentAt } : b
        )
      );
      if (selectedBill?.id === bill.id) {
        setSelectedBill((prev) => prev ? { ...prev, reminder_sent_at: payload.sentAt } : prev);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reminder email.");
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
      if (payload.sent === 0 && payload.skipped === 0) {
        toast.info(payload.message ?? "No bills are due in 3 days — no reminders sent.");
      } else if (payload.errorCount > 0) {
        toast.warning(
          `Reminders processed: ${payload.sent} sent, ${payload.skipped} skipped, ${payload.errorCount} failed.`
        );
      } else {
        toast.success(
          `✅ ${payload.sent} billing reminder${payload.sent === 1 ? "" : "s"} sent successfully!` +
          (payload.skipped > 0 ? ` (${payload.skipped} skipped — no email on file)` : "")
        );
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
        id: "billingMonth",
        header: "Period Month",
        accessorFn: (row) => `${monthNames[row.billing_month]} ${row.billing_year}`,
      },
      {
        accessorKey: "due_date",
        header: "Due Date",
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
        id: "emailReminder",
        header: "Email Reminder",
        cell: ({ row }) => {
          const bill = row.original;
          const sentAt = bill.reminder_sent_at;
          const hasEmail = !!bill.customers?.email;
          const isSending = sendingReminderFor === bill.id;
          const isPaid = bill.status === "paid";

          return (
            <div className="flex items-center gap-2">
              {sentAt ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5"
                  title={`Reminder sent: ${new Date(sentAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`}
                >
                  <MailCheck className="h-3 w-3" />
                  Sent
                </span>
              ) : hasEmail ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-600">
                  <MailX className="h-3 w-3" /> Not sent
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                  <MailX className="h-3 w-3" /> No email
                </span>
              )}
              {!isPaid && (
                <button
                  title={!hasEmail ? "No email address on file" : sentAt ? "Re-send reminder" : "Send reminder"}
                  disabled={isSending || !hasEmail}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSendReminderForBill(bill);
                  }}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
        title="Billing"
        description="Live customer monthly invoice controls, payment turn-around analytics, and cash flow efficiency diagnostics."
        actions={
          <>
            <Button variant="outline" onClick={() => void loadBillingData()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSendReminders()}
              disabled={sendingReminders || loading}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              <Mail className={`h-4 w-4 ${sendingReminders ? "animate-pulse" : ""}`} />
              {sendingReminders ? "Sending..." : "Send Reminders"}
            </Button>
            <Button onClick={() => void handleGenerateBills()} disabled={generating || loading} className="gap-2">
              <FilePlus className="h-4 w-4" />
              {generating ? "Generating..." : "Generate Bills"}
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
            <Summary label="Paid Invoices" value={paidCount} status="paid" />
            <Summary label="Unpaid Bills" value={unpaidCount} status="unpaid" />
            <Summary label="Overdue Bills" value={overdueCount} status="overdue" />
            <Summary label="Suspended Bills" value={suspendedCount} status="suspended" />
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

          {/* Billing Records Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Billing Records</CardTitle>
              <CardDescription>
                Live database invoice registry. Click 'Details' to view monthly payment receipts and customer PPPoE credentials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={bills}
                searchPlaceholder="Search billing records..."
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Slide-out Invoice Details Drawer */}
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
                      {selectedBill.billing_period_start} to {selectedBill.billing_period_end}
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

              {/* Email Reminder Status */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  Email Reminder
                </h3>
                <div className="bg-white dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-3">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-900">
                    <span className="text-slate-400">Customer Email</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedBill.customers?.email ?? <span className="text-amber-500 italic">No email on file</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Last Reminder Sent</span>
                    {selectedBill.reminder_sent_at ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <MailCheck className="h-3.5 w-3.5" />
                        {new Date(selectedBill.reminder_sent_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <MailX className="h-3.5 w-3.5" />
                        Not sent yet
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
                    disabled={sendingReminderFor === selectedBill.id || !selectedBill.customers?.email}
                    title={!selectedBill.customers?.email ? "No email on file" : selectedBill.reminder_sent_at ? "Re-send reminder email" : "Send reminder email"}
                    onClick={() => void handleSendReminderForBill(selectedBill)}
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                  >
                    {sendingReminderFor === selectedBill.id ? (
                      <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : selectedBill.reminder_sent_at ? (
                      <MailCheck className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {sendingReminderFor === selectedBill.id
                      ? "Sending..."
                      : selectedBill.reminder_sent_at
                      ? "Re-send Reminder"
                      : "Send Reminder"}
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
      {/* ─── Email Reminder Confirmation Modal ───────────────── */}
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
                    <Mail className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 id="confirm-modal-title" className="text-base font-bold text-white">
                      Send Billing Reminder
                    </h2>
                    <p className="text-xs text-blue-100 mt-0.5">Review before sending</p>
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
            <div className="px-6 py-5 space-y-4">
              {/* Already sent warning */}
              {confirmBill.reminder_sent_at && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    A reminder was already sent on{" "}
                    <strong>
                      {new Date(confirmBill.reminder_sent_at).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </strong>
                    . Sending again will re-notify the customer.
                  </span>
                </div>
              )}

              {/* Customer details */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Recipient
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Customer</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {confirmBill.customers?.full_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Account #</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {confirmBill.customers?.account_number ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Email</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {confirmBill.customers?.email ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Plan</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {confirmBill.customers?.plans?.plan_name ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bill details */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Bill Details
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Amount Due</span>
                    <span className="font-bold text-lg text-slate-900 dark:text-white leading-none">
                      {formatCurrency(Number(confirmBill.amount_due))}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {confirmBill.due_date}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-500">Status</span>
                    <StatusBadge status={confirmBill.status} />
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400 text-center">
                An email with full payment instructions will be delivered to{" "}
                <strong className="text-slate-600 dark:text-slate-300">{confirmBill.customers?.email}</strong>.
              </p>
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
              >
                <Send className="h-4 w-4" />
                Send Email
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
