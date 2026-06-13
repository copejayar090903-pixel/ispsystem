"use client";

import { CreditCard, FileImage, Search, UploadCloud, Wifi, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { formatCurrency } from "@/src/lib/utils";

type CustomerPlan = {
  plan_name: string;
  speed: string;
  monthly_fee: number;
};

type CustomerData = {
  id: string;
  account_number: string;
  full_name: string;
  pppoe_username: string;
  status: string;
  plans?: CustomerPlan;
};

type CurrentBill = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_due: number;
  status: "paid" | "unpaid" | "overdue" | "suspended";
};

export default function CustomerPortalPage() {
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [found, setFound] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [currentBill, setCurrentBill] = useState<CurrentBill | null>(null);

  // Payment Form States
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const handleLookup = async () => {
    if (!accountNumber.trim()) {
      toast.error("Please enter your account number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber: accountNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Account not found.");
      }
      setCustomerData(data.customer);
      setCurrentBill(data.currentBill);
      setFound(true);
      toast.success("Account found successfully.");
    } catch (err: any) {
      toast.error(err.message || "Account lookup failed.");
      setFound(false);
      setCustomerData(null);
      setCurrentBill(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!customerData) return;
    if (!paymentMethod) {
      toast.error("Please select a payment method.");
      return;
    }
    if (!amountPaid || Number(amountPaid) <= 0) {
      toast.error("Please enter the amount paid.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/payment-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: customerData.account_number,
          method: paymentMethod,
          referenceNumber: referenceNumber || null,
          amountPaid: Number(amountPaid),
          proofUrl: proofUrl || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=150", // default placeholder for MVP
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Submission failed.");
      }
      toast.success(data.message || "Payment proof submitted for verification.");
      
      // Reset form fields
      setReferenceNumber("");
      setAmountPaid("");
      setProofUrl("");

      // Reload account to show updated pending payment / status if relevant
      await handleLookup();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment proof.");
    } finally {
      setSubmitting(false);
    }
  };

  const getMonthName = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("en-US", { month: "long", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_34rem),linear-gradient(180deg,#f8fafc,#eef6ff)] px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-12">
      <section className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="inline-flex rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            No login required
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Check your ISP bill with your account number.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            View balance, due date, service status, payment instructions, and upload proof of payment securely.
          </p>
          <Card className="mt-8 max-w-xl bg-white/85 backdrop-blur dark:bg-slate-950/85">
            <CardHeader>
              <CardTitle>Account Lookup</CardTitle>
              <CardDescription>Enter the account number shown on your bill or receipt.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                placeholder="e.g. 997707322"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLookup();
                }}
              />
              <Button onClick={() => void handleLookup()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Check Bill
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/90 shadow-2xl shadow-blue-900/10 backdrop-blur dark:bg-slate-950/90">
          <CardHeader className="border-b border-slate-100 dark:border-slate-900">
            <CardTitle>Billing Summary</CardTitle>
            <CardDescription>
              {found && customerData ? `Billing period for ${customerData.full_name}` : "Search an account number to show details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {found && customerData ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info label="Customer Name" value={customerData.full_name} />
                  <Info label="Account Number" value={customerData.account_number} />
                  <Info label="Plan Name" value={customerData.plans?.plan_name ?? "No Plan"} />
                  <Info label="PPPoE Username" value={customerData.pppoe_username} />
                  
                  {currentBill ? (
                    <>
                      <Info label="Due Date" value={currentBill.due_date} />
                      <Info label="Amount Due" value={formatCurrency(currentBill.amount_due)} />
                      <div className="sm:col-span-2 flex flex-col gap-1 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Billing Period</span>
                        <span className="font-semibold text-slate-950 dark:text-white">
                          {currentBill.billing_period_start} to {currentBill.billing_period_end}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2 p-4 text-center border border-dashed rounded-2xl text-slate-400">
                      No active invoice generated for this account yet.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {currentBill && <StatusBadge status={currentBill.status} />}
                  <StatusBadge status={customerData.status} />
                </div>

                {currentBill && currentBill.status !== "paid" && (
                  <>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                      <p className="flex items-center gap-2 text-sm font-semibold text-blue-950 dark:text-blue-100">
                        <CreditCard className="h-4 w-4" /> Payment Instructions
                      </p>
                      <p className="mt-2 text-sm leading-6 text-blue-700 dark:text-blue-300">
                        Pay via GCash, Maya, bank transfer, or cash. Upload proof and reference number below for admin verification.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500">Payment Gateway</label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:border-slate-800"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                        >
                          <option value="gcash">GCash</option>
                          <option value="maya">Maya</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="cash">Cash</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500">Reference Number</label>
                        <Input
                          placeholder="Ref / Transaction ID"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-slate-500">Amount Paid (₱)</label>
                        <Input
                          type="number"
                          placeholder={currentBill.amount_due.toString()}
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-slate-500">Proof of Payment URL (Optional)</label>
                        <Input
                          placeholder="e.g. Image URL or attachment link"
                          value={proofUrl}
                          onChange={(e) => setProofUrl(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button className="w-full" onClick={() => void handleSubmitPayment()} disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                        </>
                      ) : (
                        <>
                          <FileImage className="h-4 w-4 mr-2" /> Submit Payment Proof
                        </>
                      )}
                    </Button>
                  </>
                )}

                {currentBill && currentBill.status === "paid" && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 p-4 rounded-2xl text-sm font-semibold text-center">
                    This bill has been paid and verified. Thank you!
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
                <Wifi className="mb-4 h-12 w-12 text-blue-500 animate-pulse" />
                <p className="font-medium text-slate-700 dark:text-slate-200">Your bill appears here</p>
                <p className="mt-1 text-sm">No password needed. Use account number only.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
