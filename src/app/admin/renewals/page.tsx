"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  FileImage,
  RefreshCw,
  Search,
  XCircle,
  ExternalLink,
  Eye,
  Clock,
  User,
  ShieldCheck,
  CreditCard,
  Wifi,
  Receipt,
  Download,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency } from "@/src/lib/utils";
import { Skeleton } from "@/src/components/ui/skeleton";

type PaymentSubmission = {
  id: string;
  customer_id: string;
  billing_id: string;
  method: string;
  reference_number: string | null;
  amount_paid: number;
  proof_url: string | null;
  status: "pending" | "approved" | "verified" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  customers?: {
    id: string;
    full_name: string;
    account_number: string;
    pppoe_username: string;
    plans?: {
      plan_name: string;
      speed: string;
      monthly_fee: number;
    } | null;
  };
  bills?: {
    id: string;
    billing_year: number;
    billing_month: number;
    amount_due: number;
    status: string;
  };
};

export default function RenewalsPage() {
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [activeProofUrl, setActiveProofUrl] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadSubmissions() {
    setLoading(true);
    try {
      const response = await fetch("/api/payments", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to fetch renewal submissions.");
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load renewal submissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, []);

  const handleApprove = async (paymentId: string) => {
    setProcessingId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: "d67e10ef-5a3d-4c33-8a30-84db158c54b2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed.");
      toast.success(data.message || "Renewal confirmed! Customer activated and receipt verified.");
      void loadSubmissions();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve renewal submission.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    const reason = prompt("Enter a rejection reason for this renewal:", "Incorrect reference number or invalid receipt");
    if (reason === null) return;
    setProcessingId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, adminId: "d67e10ef-5a3d-4c33-8a30-84db158c54b2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed.");
      toast.success(data.message || "Renewal submission marked as rejected.");
      void loadSubmissions();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject renewal submission.");
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = useMemo(() => {
    return submissions.filter((item) => {
      // Status filter
      if (statusFilter === "pending" && item.status !== "pending") return false;
      if (statusFilter === "approved" && item.status !== "approved" && item.status !== "verified") return false;
      if (statusFilter === "rejected" && item.status !== "rejected") return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const customer = item.customers?.full_name?.toLowerCase() ?? "";
      const account = item.customers?.account_number?.toLowerCase() ?? "";
      const pppoe = item.customers?.pppoe_username?.toLowerCase() ?? "";
      const ref = item.reference_number?.toLowerCase() ?? "";
      return customer.includes(q) || account.includes(q) || pppoe.includes(q) || ref.includes(q);
    });
  }, [submissions, statusFilter, search]);

  const counts = useMemo(() => {
    const pending = submissions.filter((s) => s.status === "pending").length;
    const approved = submissions.filter((s) => s.status === "approved" || s.status === "verified").length;
    const rejected = submissions.filter((s) => s.status === "rejected").length;
    return { total: submissions.length, pending, approved, rejected };
  }, [submissions]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Portal"
        title="Customer Renewal Submissions"
        description="Verify submitted GCash and Maya renewal payments, inspect proof screenshots, and confirm customer account extensions."
        actions={
          <Button
            onClick={() => void loadSubmissions()}
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Submissions
            </CardTitle>
            <Receipt className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{counts.total}</div>
            <p className="text-[11px] text-slate-400 mt-1">All recorded renewal transactions</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-200/60 dark:border-amber-500/20 bg-amber-50/30 dark:bg-amber-500/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Pending Review
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{counts.pending}</div>
            <p className="text-[11px] text-amber-700/70 dark:text-amber-300/70 mt-1">Requires confirmation</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Confirmed / Approved
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{counts.approved}</div>
            <p className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70 mt-1">Active renewed accounts</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-rose-200/60 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
              Rejected
            </CardTitle>
            <XCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{counts.rejected}</div>
            <p className="text-[11px] text-rose-700/70 dark:text-rose-300/70 mt-1">Invalid or mismatch</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search customer, account #, PPPoE, or ref no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="rounded-xl text-xs h-9 px-3.5"
          >
            All ({counts.total})
          </Button>
          <Button
            variant={statusFilter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("pending")}
            className={`rounded-xl text-xs h-9 px-3.5 ${
              statusFilter === "pending"
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300"
            }`}
          >
            Pending ({counts.pending})
          </Button>
          <Button
            variant={statusFilter === "approved" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("approved")}
            className="rounded-xl text-xs h-9 px-3.5"
          >
            Approved ({counts.approved})
          </Button>
          <Button
            variant={statusFilter === "rejected" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("rejected")}
            className="rounded-xl text-xs h-9 px-3.5"
          >
            Rejected ({counts.rejected})
          </Button>
        </div>
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 dark:border-slate-800 py-12 text-center">
          <CardContent className="space-y-3">
            <Receipt className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
              No renewal submissions found
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {search || statusFilter !== "all"
                ? "Try clearing your search or filters to see more submissions."
                : "When customers submit their GCash or Maya payment receipt for renewal, they will appear here for verification."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3.5">
          {filtered.map((item) => {
            const isPending = item.status === "pending";
            const isApproved = item.status === "approved" || item.status === "verified";
            const isRejected = item.status === "rejected";

            const submittedDate = new Date(item.submitted_at).toLocaleString("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
            });

            return (
              <Card
                key={item.id}
                className={`rounded-2xl transition-all duration-200 overflow-hidden ${
                  isPending
                    ? "border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Customer & Account Info */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        isPending
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : isApproved
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      <User className="h-5 w-5" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {item.customers?.full_name || "Unknown Customer"}
                        </span>
                        <Badge
                          variant="muted"
                          className="font-mono text-[11px]"
                        >
                          Acct: {item.customers?.account_number || "—"}
                        </Badge>
                        <Badge
                          variant={isPending ? "warning" : isApproved ? "success" : "danger"}
                          className="text-[10px] font-semibold uppercase tracking-wider"
                        >
                          {item.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Wifi className="h-3 w-3 text-slate-400" />
                          {item.customers?.pppoe_username || "No PPPoE user"}
                        </span>
                        <span>•</span>
                        <span>
                          Plan:{" "}
                          <strong className="text-slate-700 dark:text-slate-300">
                            {item.customers?.plans?.plan_name || "Current Plan"}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="text-slate-400">Submitted: {submittedDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Payment Amount & Ref */}
                  <div className="flex items-center gap-6 lg:border-l lg:border-r border-slate-100 dark:border-slate-800 lg:px-6">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Amount Paid
                      </span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">
                        {formatCurrency(Number(item.amount_paid))}
                      </span>
                      <span className="text-[10px] capitalize text-slate-400 block">
                        via {item.method}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Reference No.
                      </span>
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 select-all block">
                        {item.reference_number || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Right: Proof Receipt Thumbnail & Review Actions */}
                  <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap justify-end">
                    {item.proof_url ? (
                      <button
                        onClick={() => setActiveProofUrl(item.proof_url)}
                        className="group relative h-12 w-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 flex-shrink-0 transition-transform hover:scale-105"
                        title="Click to view full receipt"
                      >
                        <img
                          src={item.proof_url}
                          alt="Receipt proof"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="h-4 w-4 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-[10px] text-center font-medium leading-tight p-1 flex-shrink-0">
                        No image
                      </div>
                    )}

                    {isPending ? (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        <Button
                          size="sm"
                          onClick={() => void handleApprove(item.id)}
                          disabled={processingId === item.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl h-9 px-3 gap-1 shadow-sm"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm &amp; Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReject(item.id)}
                          disabled={processingId === item.id}
                          className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 text-xs rounded-xl h-9 px-3 gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {item.proof_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveProofUrl(item.proof_url)}
                            className="text-xs rounded-xl h-9 px-2.5 gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> View Receipt
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox Receipt Preview Modal */}
      {activeProofUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActiveProofUrl(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-4 bg-slate-950 flex items-center justify-between border-b border-slate-800 text-white">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Receipt className="h-4 w-4 text-blue-400" />
                Submitted Payment Receipt Proof
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activeProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                  title="Open full size in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setActiveProofUrl(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal image */}
            <div className="p-4 flex items-center justify-center bg-slate-950/80 max-h-[75vh] overflow-auto">
              <img
                src={activeProofUrl}
                alt="Receipt Full Preview"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-md"
              />
            </div>

            {/* Modal footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
              <span>Inspect GCash / Maya reference number and total amount carefully</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveProofUrl(null)}
                className="h-8 rounded-lg text-xs border-slate-700 text-slate-300"
              >
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
