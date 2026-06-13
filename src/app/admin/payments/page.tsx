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
        header: "Proof",
        cell: ({ row }) => {
          const url = row.original.proof_url;
          if (!url) return <span className="text-slate-400">No image</span>;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(url, "_blank")}
            >
              <FileImage className="h-4 w-4 mr-1.5" /> View Proof
            </Button>
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
    </>
  );
}
