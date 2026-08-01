"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileImage,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { formatCurrency } from "@/src/lib/utils";

type CustomerPlan = {
  id: string;
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

type PendingPayment = {
  id: string;
  status: string;
  submitted_at: string;
  amount_paid: number;
  method: string;
};

function getRemainingDays(dueDateStr: string): number {
  const now = new Date();
  const due = new Date(dueDateStr);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const GCASH_STEPS = [
  { step: 1, title: "Open GCash App", desc: 'Launch GCash on your phone and tap "Send Money" on the home screen.', icon: Smartphone },
  { step: 2, title: "Enter GCash Number", desc: "Input our official GCash number: 09XX-XXX-XXXX. Double-check before proceeding.", icon: Send },
  { step: 3, title: "Enter the Amount", desc: "Type the exact subscription amount shown in your selected plan. Add a note with your account number.", icon: CreditCard },
  { step: 4, title: "Confirm and Send", desc: "Review the details and tap Confirm. Save the transaction receipt shown on screen.", icon: CheckCircle2 },
  { step: 5, title: "Submit Reference Number", desc: "Copy the 13-digit GCash reference number and paste it in the form above, then tap Submit.", icon: BadgeCheck },
];

export default function CustomerPortalPage() {
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [found, setFound] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [currentBill, setCurrentBill] = useState<CurrentBill | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);

  // Regular payment
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  // Renewal
  const [showRenewal, setShowRenewal] = useState(false);
  const [plans, setPlans] = useState<CustomerPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CustomerPlan | null>(null);
  const [renewalName, setRenewalName] = useState("");
  const [renewalRef, setRenewalRef] = useState("");
  const [renewalSubmitting, setRenewalSubmitting] = useState(false);

  const isLocked =
    customerData?.status === "suspended" ||
    customerData?.status === "expired" ||
    currentBill?.status === "overdue" ||
    currentBill?.status === "suspended";

  const fetchPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await fetch("/api/plans");
      const data = await res.json();
      if (res.ok && data.plans) {
        setPlans(data.plans.filter((p: CustomerPlan) => p.speed !== "Expired-Profile"));
      }
    } catch {
      toast.error("Failed to load subscription plans.");
    } finally {
      setPlansLoading(false);
    }
  };

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
      if (!res.ok) throw new Error(data.error || "Account not found.");
      setCustomerData(data.customer);
      setCurrentBill(data.currentBill);
      setPendingPayment(data.pendingPayment ?? null);
      setFound(true);
      setShowRenewal(false);
      setSelectedPlan(null);
      setRenewalName("");
      setRenewalRef("");
      toast.success("Account found successfully.");
    } catch (err: any) {
      toast.error(err.message || "Account lookup failed.");
      setFound(false);
      setCustomerData(null);
      setCurrentBill(null);
      setPendingPayment(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!customerData) return;
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
          proofUrl: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed.");
      toast.success(data.message || "Payment proof submitted for verification.");
      setReferenceNumber("");
      setAmountPaid("");
      await handleLookup();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment proof.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenewalSubmit = async () => {
    if (!customerData) return;
    if (!selectedPlan) { toast.error("Please select a subscription plan."); return; }
    if (!renewalName.trim()) { toast.error("Please enter your name."); return; }
    if (!renewalRef.trim()) { toast.error("Please enter your GCash reference number."); return; }

    setRenewalSubmitting(true);
    try {
      const res = await fetch("/api/portal/payment-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: customerData.account_number,
          method: "gcash",
          referenceNumber: renewalRef.trim(),
          amountPaid: selectedPlan.monthly_fee,
          proofUrl: null,
          customerName: renewalName.trim(),
          planId: selectedPlan.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Renewal submission failed.");
      toast.success("Renewal request submitted! Our team will process it within 30 minutes.");
      setShowRenewal(false);
      setSelectedPlan(null);
      setRenewalName("");
      setRenewalRef("");
      await handleLookup();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit renewal.");
    } finally {
      setRenewalSubmitting(false);
    }
  };

  const handleShowRenewal = () => {
    setShowRenewal(true);
    // Pre-fill name from customer's account data
    if (customerData?.full_name) setRenewalName(customerData.full_name);
    void fetchPlans();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_34rem),linear-gradient(180deg,#f8fafc,#eef6ff)] px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-12">
      <section className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-start gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:pt-8">
        <div>
          <div className="inline-flex rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            No login required
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Check your ISP account &amp; subscription status.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            View your account details, remaining days, service status, and renew your subscription instantly with GCash.
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Check Account
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/90 shadow-2xl shadow-blue-900/10 backdrop-blur dark:bg-slate-950/90">
          <CardHeader className="border-b border-slate-100 dark:border-slate-900 flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Account Details</CardTitle>
              <CardDescription>
                {found && customerData ? `Account for ${customerData.full_name}` : "Search an account number to show details."}
              </CardDescription>
            </div>
            {found && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {!showRenewal && (
                  <Button
                    size="sm"
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 border-0"
                    onClick={handleShowRenewal}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Renew
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { setFound(false); setShowRenewal(false); }} className="rounded-xl">
                  Change
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-5 pt-6">

            {found && customerData ? (
              <>
                {/* LOCKED BANNER */}
                {isLocked && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 p-4 flex gap-3 items-start">
                    <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-bold text-rose-800 dark:text-rose-300">Account Locked / Suspended</p>
                      <p className="text-xs text-rose-700/80 dark:text-rose-400/80 leading-relaxed">
                        Your account is suspended due to an overdue balance or expired subscription. Use the <strong>Renew</strong> button above to restore your connection.
                      </p>
                    </div>
                  </div>
                )}

                {/* Pending payment banner */}
                {pendingPayment && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 flex gap-3 items-start">
                    <div className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-500">⏳</div>
                    <div className="space-y-0.5 flex-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Payment Pending Verification</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                        You have already submitted a payment of <strong>{formatCurrency(pendingPayment.amount_paid)}</strong> via <strong className="capitalize">{pendingPayment.method}</strong>. Our team is reviewing it. Verification usually takes up to 2 hours on business days.
                      </p>
                    </div>
                  </div>
                )}

                {/* Account info grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoTile label="Customer Name" value={customerData.full_name} />
                  <InfoTile label="Account Number" value={customerData.account_number} mono />

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Account Status</p>
                    <StatusBadge status={customerData.status} />
                  </div>

                  <InfoTile label="Plan" value={customerData.plans?.plan_name ?? "No Plan"} sub={customerData.plans?.speed ? `${customerData.plans.speed} speed` : undefined} />
                  <InfoTile label="PPPoE Username" value={customerData.pppoe_username} mono />

                  {currentBill ? (
                    <>
                      <InfoTile
                        label="Due Date"
                        value={new Date(currentBill.due_date).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                      />
                      <InfoTile label="Amount Due" value={formatCurrency(currentBill.amount_due)} />

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2">
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-2">
                          <CalendarDays className="h-3 w-3" /> Remaining Days
                        </p>
                        {(() => {
                          const days = getRemainingDays(currentBill.due_date);
                          return (
                            <p className={`font-bold text-sm ${days <= 3 ? "text-rose-500" : days <= 7 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {days > 0 ? `${days} day${days !== 1 ? "s" : ""} until due` : days === 0 ? "Due today" : `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`}
                            </p>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2 p-4 text-center border border-dashed rounded-2xl text-slate-400">
                      No active invoice generated for this account yet.
                    </div>
                  )}
                </div>

                {/* RENEWAL FLOW */}
                {showRenewal && (
                  <div className="border border-orange-200 dark:border-orange-500/30 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300">
                    <div className="bg-gradient-to-r from-orange-500/10 to-rose-500/10 dark:from-orange-500/15 dark:to-rose-500/15 px-5 py-4 border-b border-orange-200 dark:border-orange-500/30">
                      <p className="font-bold text-orange-900 dark:text-orange-200 flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" /> Renew Subscription
                      </p>
                      <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">Select your plan, fill in the form, and follow the GCash payment steps below.</p>
                    </div>

                    <div className="p-5 space-y-6 bg-white/60 dark:bg-slate-950/60">
                      {/* Step 1: Plan selection */}
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">1</span>
                          Choose a Plan
                        </label>
                        {plansLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {plans.length === 0 ? (
                              <p className="text-xs text-slate-400 col-span-2 text-center py-4">No plans available.</p>
                            ) : (
                              plans.map((plan) => (
                                <button
                                  key={plan.id}
                                  onClick={() => setSelectedPlan(plan)}
                                  className={`text-left p-3.5 rounded-2xl border-2 transition-all duration-200 ${
                                    selectedPlan?.id === plan.id
                                      ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300"
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-bold text-xs text-slate-900 dark:text-white">{plan.plan_name}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {plan.monthly_fee === 700 ? "30 to 75 Mbps" : plan.speed} speed
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-extrabold text-sm text-slate-900 dark:text-white">₱{plan.monthly_fee}</p>
                                      <p className="text-[10px] text-slate-400">/month</p>
                                    </div>
                                  </div>
                                  {selectedPlan?.id === plan.id && (
                                    <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                      <CheckCircle2 className="h-3 w-3" /> Selected
                                    </div>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Step 2: Name & Reference */}
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
                          Your Details &amp; Payment Reference
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                            <Input
                              placeholder="e.g. Juan Dela Cruz"
                              value={renewalName}
                              onChange={(e) => setRenewalName(e.target.value)}
                              className="h-10 rounded-xl focus-visible:ring-blue-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">GCash Reference No.</label>
                            <Input
                              placeholder="e.g. 2024082512345"
                              value={renewalRef}
                              onChange={(e) => setRenewalRef(e.target.value)}
                              className="h-10 rounded-xl focus-visible:ring-blue-500 font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Step 3: How to pay */}
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">3</span>
                          How to Pay via GCash
                        </label>
                        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/5 p-4 space-y-3">
                          {GCASH_STEPS.map((s) => {
                            const Icon = s.icon;
                            return (
                              <div key={s.step} className="flex gap-3 items-start">
                                <div className="flex-shrink-0 h-7 w-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-[11px] font-bold shadow-sm shadow-emerald-500/20">
                                  {s.step}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.title}</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
                                </div>
                                <Icon className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3">
                          <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                            Amount to send:{" "}
                            <strong className="font-bold">
                              {selectedPlan ? `₱${selectedPlan.monthly_fee.toLocaleString()}` : "select a plan above"}
                            </strong>. Send to our official GCash number. Verification takes up to 2 hours on business days.
                          </p>
                        </div>
                      </div>

                      {/* Submit */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setShowRenewal(false)}
                          disabled={renewalSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/15"
                          onClick={() => void handleRenewalSubmit()}
                          disabled={renewalSubmitting}
                        >
                          {renewalSubmitting ? (
                            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting...</>
                          ) : (
                            <><Send className="h-4 w-4 mr-1.5" /> Submit Renewal Request</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* REGULAR PAYMENT FORM */}
                {!showRenewal && currentBill && currentBill.status !== "paid" && (
                  <>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                      <p className="flex items-center gap-2 text-sm font-semibold text-blue-950 dark:text-blue-100">
                        <CreditCard className="h-4 w-4" /> Payment Instructions
                      </p>
                      <p className="mt-2 text-xs leading-6 text-blue-700 dark:text-blue-300">
                        Pay via GCash, Maya, bank transfer, or cash. Enter your reference number and amount below for admin verification.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500">Payment Gateway</label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-900 dark:border-slate-800"
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
                    </div>

                    <Button className="w-full" onClick={() => void handleSubmitPayment()} disabled={submitting}>
                      {submitting ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                      ) : (
                        <><FileImage className="h-4 w-4 mr-2" /> Submit Payment Proof</>
                      )}
                    </Button>
                  </>
                )}

                {currentBill && currentBill.status === "paid" && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 p-4 rounded-2xl text-sm font-semibold text-center">
                    ✅ This bill has been paid and verified. Thank you!
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
                <Wifi className="mb-4 h-12 w-12 text-blue-500 animate-pulse" />
                <p className="font-medium text-slate-700 dark:text-slate-200">Your account details appear here</p>
                <p className="mt-1 text-sm">No password needed. Use account number only.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function InfoTile({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{label}</p>
      <p className={`font-semibold text-slate-950 dark:text-white text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
