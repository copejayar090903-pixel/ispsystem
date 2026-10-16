"use client";

import { useState, useEffect, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, FileImage, Plus, ReceiptText, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { formatCurrency } from "@/src/lib/utils";
import { Skeleton } from "@/src/components/ui/skeleton";

type Payment = {
  id: string;
  customer_id: string;
  billing_id: string;
  method: string;
  reference_number: string | null;
  amount_paid: number;
  proof_url: string | null;
  status: "pending" | "verified" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  customers?: {
    id: string;
    full_name: string;
    account_number: string;
    pppoe_username: string;
  };
  bills?: {
    id: string;
    billing_year: number;
    billing_month: number;
    amount_due: number;
  };
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAccountHistory, setSelectedAccountHistory] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBills, setHistoryBills] = useState<any[]>([]);
  const [historyCustomer, setHistoryCustomer] = useState<any | null>(null);

  async function loadPayments() {
    setLoading(true);
    try {
      const response = await fetch("/api/payments", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to fetch payments.");
      setPayments(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load payment list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPayments();
  }, []);

  useEffect(() => {
    if (!selectedAccountHistory) {
      setHistoryBills([]);
      setHistoryCustomer(null);
      return;
    }

    async function fetchHistory() {
      setHistoryLoading(true);
      try {
        const response = await fetch("/api/portal/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNumber: selectedAccountHistory }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to fetch history");
        setHistoryBills(data.paymentHistory || []);
        setHistoryCustomer(data.customer || null);
      } catch (err: any) {
        toast.error(err.message || "Failed to load customer history");
        setSelectedAccountHistory(null);
      } finally {
        setHistoryLoading(false);
      }
    }

    void fetchHistory();
  }, [selectedAccountHistory]);

  const handleApprove = async (paymentId: string) => {
    try {
      const res = await fetch(`/api/payments/${paymentId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: "d67e10ef-5a3d-4c33-8a30-84db158c54b2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed.");
      toast.success(data.message || "Payment verified and approved!");
      void loadPayments();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve payment.");
    }
  };

  const handleReject = async (paymentId: string) => {
    const reason = prompt("Please enter a rejection reason:", "Incorrect reference number");
    if (reason === null) return;
    try {
      const res = await fetch(`/api/payments/${paymentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, adminId: "d67e10ef-5a3d-4c33-8a30-84db158c54b2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed.");
      toast.success(data.message || "Payment rejected.");
      void loadPayments();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject payment.");
    }
  };

  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Payment ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold select-all text-slate-500">
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
        id: "history",
        header: "History",
        cell: ({ row }) => {
          const accNum = row.original.customers?.account_number;
          if (!accNum) return "—";
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedAccountHistory(accNum)}
              className="h-8 px-2.5 text-xs text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/20"
            >
              View History
            </Button>
          );
        },
      },
      {
        id: "billingPeriod",
        header: "Bill Period",
        cell: ({ row }) => {
          const b = row.original.bills;
          if (!b) return "-";
          return `${monthNames[b.billing_month]} ${b.billing_year}`;
        },
      },
      {
        accessorKey: "amount_paid",
        header: "Amount Paid",
        cell: ({ row }) => formatCurrency(Number(row.original.amount_paid)),
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => <span className="capitalize font-medium">{row.original.method}</span>,
      },
      {
        accessorKey: "reference_number",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold select-all">
            {row.original.reference_number ?? "N/A"}
          </span>
        ),
      },
      {
        accessorKey: "proof_url",
        header: "Receipt",
        cell: ({ row }) => {
          const url = row.original.proof_url;
          if (!url) return <span className="text-slate-400 text-xs">No receipt</span>;
          return (
            <button
              onClick={() => window.open(url, "_blank")}
              className="group flex items-center gap-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition-colors"
              title="Click to view full receipt"
            >
              <img
                src={url}
                alt="Receipt"
                className="h-10 w-10 object-cover bg-slate-100 dark:bg-slate-800"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="pr-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
                View Receipt
              </span>
            </button>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "submitted_at",
        header: "Submitted",
        cell: ({ row }) => new Date(row.original.submitted_at).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" }),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          if (row.original.status !== "pending") {
            return <span className="text-xs text-slate-400 italic">Processed</span>;
          }
          return (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/20"
                onClick={() => void handleApprove(row.original.id)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20"
                onClick={() => void handleReject(row.original.id)}
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Reject
              </Button>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="Review customer payment submissions, verify transaction references, and trigger account reconnection."
        actions={
          <Button variant="outline" onClick={() => void loadPayments()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />
      
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Payment Submissions</CardTitle>
            <CardDescription>
              Verifying a payment automatically marks the corresponding bill paid, logs the transaction, and reenables the customer's PPPoE connection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={payments}
              searchPlaceholder="Search payments by reference or name..."
            />
          </CardContent>
        </Card>
      )}

      {/* Slide-out Customer History Drawer */}
      {selectedAccountHistory && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200" aria-modal="true" role="dialog">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedAccountHistory(null)}
          />

          {/* Drawer Wrapper */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-950 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 transition-transform duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold leading-tight text-slate-950 dark:text-white">
                    Payment History
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {historyCustomer ? historyCustomer.full_name : "Loading..."}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setSelectedAccountHistory(null)}>
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <span className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                  <p className="text-xs text-slate-500">Loading history...</p>
                </div>
              ) : historyBills.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">No payments found for this customer.</p>
              ) : (
                <div className="space-y-4">
                  {historyCustomer && (
                    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Account Number:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{historyCustomer.account_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">PPPoE Username:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{historyCustomer.pppoe_username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Plan:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{historyCustomer.plans?.plan_name ?? "—"}</span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-3">
                    {historyBills.map((bill) => {
                      const verifiedPayment = bill.payments?.find((p: any) => p.status === "verified") ?? bill.payments?.[0];
                      const start = bill.paid_at || bill.billing_period_start;
                      const end = bill.due_date;
                      return (
                        <div key={bill.id} className="border border-slate-100 dark:border-slate-800/60 rounded-2xl p-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors space-y-2.5">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                {new Date(start).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}
                                {" – "}
                                {new Date(end).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Bill ID: {bill.id.substring(0,8).toUpperCase()}...</p>
                            </div>
                            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {formatCurrency(Number(bill.amount_due))}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/40">
                            <span className="text-slate-400">
                              Paid: {bill.paid_at ? new Date(bill.paid_at).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—"}
                            </span>
                            {verifiedPayment && (
                              <span className="capitalize font-semibold text-slate-500 dark:text-slate-400">
                                {verifiedPayment.method} {verifiedPayment.reference_number ? `(${verifiedPayment.reference_number})` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
