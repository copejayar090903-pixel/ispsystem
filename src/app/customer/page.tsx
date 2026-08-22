"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  ExternalLink,
  FileImage,
  History,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  User,
  Wifi,
} from "lucide-react";
import { useState, useEffect } from "react";
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
  due_date: string;
  plans?: CustomerPlan;
  plan_id?: string;
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

type PaymentHistoryBill = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_due: number;
  paid_at: string | null;
  billing_month: number;
  billing_year: number;
  payments?: Array<{
    id: string;
    method: string;
    reference_number: string | null;
    amount_paid: number;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
  }>;
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
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryBill[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Regular payment
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  // Online / Renewal payment loading
  const [renewalPaymongoLoading, setRenewalPaymongoLoading] = useState(false);
  const [plans, setPlans] = useState<CustomerPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CustomerPlan | null>(null);

  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOverdue: boolean;
  } | null>(null);

  // Handle PayMongo redirect-back query params (?payment=success|cancelled&account=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const acct = params.get("account");
    if (paymentStatus === "success") {
      toast.success("Payment successful!  Your bill will be updated shortly.");
      if (acct) setAccountNumber(acct);
    } else if (paymentStatus === "cancelled") {
      toast.error("Payment was cancelled. Please try again.");
      if (acct) setAccountNumber(acct);
    }
    // Clean up query params from URL without navigation
    if (paymentStatus) {
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!customerData?.due_date) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const target = new Date(customerData.due_date).getTime();
      const now = new Date().getTime();
      const difference = target - now;

      if (difference < 0) {
        const absDiff = Math.abs(difference);
        const d = Math.floor(absDiff / (1000 * 60 * 60 * 24));
        const h = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((absDiff % (1000 * 60)) / 1000);
        setTimeLeft({ days: d, hours: h, minutes: m, seconds: s, isOverdue: true });
      } else {
        const d = Math.floor(difference / (1000 * 60 * 60 * 24));
        const h = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((difference % (1000 * 60)) / 1000);
        setTimeLeft({ days: d, hours: h, minutes: m, seconds: s, isOverdue: false });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [customerData?.due_date]);

  useEffect(() => {
    if (customerData) {
      const fetchAndSelectPlan = async () => {
        setPlansLoading(true);
        try {
          const res = await fetch("/api/plans");
          const data = await res.json();
          if (res.ok && data.plans) {
            const filteredPlans = data.plans.filter((p: CustomerPlan) => p.speed !== "Expired-Profile");
            setPlans(filteredPlans);
            const currentPlan = filteredPlans.find((p: CustomerPlan) => p.id === customerData.plan_id);
            if (currentPlan) {
              setSelectedPlan(currentPlan);
              setAmountPaid(String(currentPlan.monthly_fee));
            }
          }
        } catch {
          toast.error("Failed to load subscription plans.");
        } finally {
          setPlansLoading(false);
        }
      };
      void fetchAndSelectPlan();
    }
  }, [customerData]);

  const isLocked =
    customerData?.status === "suspended" ||
    customerData?.status === "overdue" ||
    customerData?.status === "expired";

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
      setPaymentHistory(data.paymentHistory ?? []);
      setFound(true);
      setSelectedPlan(null);
      toast.success("Account found successfully.");
    } catch (err: any) {
      toast.error(err.message || "Account lookup failed.");
      setFound(false);
      setCustomerData(null);
      setCurrentBill(null);
      setPendingPayment(null);
      setPaymentHistory([]);
      setShowHistory(false);
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

  const handleRenewalPayWithPaymongo = async () => {
    if (!customerData || !selectedPlan) {
      toast.error("Please select a subscription plan first.");
      return;
    }
    setRenewalPaymongoLoading(true);
    try {
      const res = await fetch("/api/paymongo/create-renewal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: customerData.account_number,
          planId: selectedPlan.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment link.");
      toast.success("Redirecting to PayMongo secure checkout…");
      window.open(data.checkout_url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate PayMongo payment.");
    } finally {
      setRenewalPaymongoLoading(false);
    }
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

        <Card className="bg-white/90 shadow-2xl shadow-blue-900/10 backdrop-blur dark:bg-slate-950/90 overflow-hidden">
          {found && customerData ? (
            <CardHeader className="flex flex-row items-center justify-between gap-4 px-6 py-5">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Number:</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono tracking-wider">{customerData.account_number}</span>
              </div>
              <Button
                onClick={() => { setFound(false); }}
                className="bg-[#00cbab] hover:bg-[#00b598] text-white font-bold px-5 py-2 rounded-xl text-sm border-0 shadow-md shadow-[#00cbab]/20 transition-all"
              >
                Logout
              </Button>
            </CardHeader>
          ) : (
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Account Details</CardTitle>
                <CardDescription>Search an account number to show details.</CardDescription>
              </div>
            </CardHeader>
          )}
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
                {/* S2S Styled Core Dashboard */}
                <div className="flex flex-col items-center space-y-6 pt-2">
                  <hr className="w-full border-slate-100 dark:border-slate-800/80" />

                  {/* Customer particulars */}
                  <div className="text-center">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{customerData.full_name}</h3>
                  </div>

                  {/* Internet time left label */}
                  <div className="text-center font-bold text-slate-600 dark:text-slate-300 text-sm tracking-wide mt-2">
                    Internet time left
                  </div>

                  {/* Countdown Digital Boxes */}
                  <div className="flex items-center justify-center gap-3 sm:gap-4 py-2">
                    {/* Days */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Days</span>
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 ${timeLeft?.isOverdue ? "bg-rose-500 shadow-rose-500/20" : "bg-[#00cbab] shadow-[#00cbab]/20"} text-white flex items-center justify-center rounded-2xl text-2xl sm:text-3xl font-black shadow-lg transition-colors`}>
                        {timeLeft ? String(timeLeft.days).padStart(2, '0') : "00"}
                      </div>
                    </div>

                    {/* Hours */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hours</span>
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 ${timeLeft?.isOverdue ? "bg-rose-500 shadow-rose-500/20" : "bg-[#00cbab] shadow-[#00cbab]/20"} text-white flex items-center justify-center rounded-2xl text-2xl sm:text-3xl font-black shadow-lg transition-colors`}>
                        {timeLeft ? String(timeLeft.hours).padStart(2, '0') : "00"}
                      </div>
                    </div>

                    {/* Minutes */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Minutes</span>
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 ${timeLeft?.isOverdue ? "bg-rose-500 shadow-rose-500/20" : "bg-[#00cbab] shadow-[#00cbab]/20"} text-white flex items-center justify-center rounded-2xl text-2xl sm:text-3xl font-black shadow-lg transition-colors`}>
                        {timeLeft ? String(timeLeft.minutes).padStart(2, '0') : "00"}
                      </div>
                    </div>

                    {/* Seconds */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Seconds</span>
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 ${timeLeft?.isOverdue ? "bg-rose-500 shadow-rose-500/20" : "bg-[#00cbab] shadow-[#00cbab]/20"} text-white flex items-center justify-center rounded-2xl text-2xl sm:text-3xl font-black shadow-lg transition-colors`}>
                        {timeLeft ? String(timeLeft.seconds).padStart(2, '0') : "00"}
                      </div>
                    </div>
                  </div>

                  {timeLeft?.isOverdue && (
                    <div className="text-center text-xs font-semibold text-rose-500 dark:text-rose-400 animate-pulse">
                      ⚠️ Subscription Expired! Please purchase load to restore your connection.
                    </div>
                  )}

                </div>

                {/* PURCHASE & RENEWAL FLOW */}
                <div className="border border-orange-200 dark:border-orange-500/30 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300">
                  <div className="bg-gradient-to-r from-orange-500/10 to-rose-500/10 dark:from-orange-500/15 dark:to-rose-500/15 px-5 py-4 border-b border-orange-200 dark:border-orange-500/30">
                    <p className="font-bold text-orange-900 dark:text-orange-200 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin-slow" /> Purchase &amp; Renew Plan
                    </p>
                    <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">Select your plan below, then choose to pay online or manually submit proof of payment.</p>
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
                                className={`text-left p-3.5 rounded-2xl border-2 transition-all duration-200 ${selectedPlan?.id === plan.id
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

                    {/* Step 2: Payment options */}
                    {selectedPlan && (
                      <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
                          Proceed to Payment
                        </label>

                        {/* Online checkout via PayMongo */}
                        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 dark:border-violet-500/25 dark:from-violet-500/10 dark:to-indigo-500/10 p-4">
                          <p className="flex items-center gap-2 text-sm font-bold text-violet-900 dark:text-violet-200">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white text-[9px] font-extrabold shadow-sm">P</span>
                            Pay Online via PayMongo (Instant Restoration)
                          </p>
                          <p className="mt-1 text-xs leading-5 text-violet-700/80 dark:text-violet-300/80">
                            Securely pay ₱{selectedPlan.monthly_fee.toLocaleString()} with GCash, Maya, credit/debit card, or e-wallets. Your connection is restored immediately after payment.
                          </p>
                          <Button
                            id="btn-renewal-paymongo"
                            className="mt-3 w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-violet-500/20 transition-all"
                            onClick={() => void handleRenewalPayWithPaymongo()}
                            disabled={renewalPaymongoLoading}
                          >
                            {renewalPaymongoLoading ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening checkout…</>
                            ) : (
                              <><ExternalLink className="h-4 w-4 mr-2" /> Pay ₱{selectedPlan.monthly_fee.toLocaleString()} via PayMongo</>
                            )}
                          </Button>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 py-1">
                          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">or pay manually</span>
                          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        </div>

                        {/* Manual payment upload */}
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                            <p className="flex items-center gap-2 text-sm font-semibold text-blue-950 dark:text-blue-100">
                              <CreditCard className="h-4 w-4" /> Manual Payment Submission
                            </p>
                            <p className="mt-2 text-xs leading-5 text-blue-700 dark:text-blue-300 font-medium">
                              Pay via GCash, Maya, or bank transfer — then enter your reference number and amount paid below for admin verification.
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-semibold text-slate-500">Payment Method</label>
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
                                placeholder={selectedPlan.monthly_fee.toString()}
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                              />
                            </div>
                          </div>

                          <Button className="w-full h-11" onClick={() => void handleSubmitPayment()} disabled={submitting}>
                            {submitting ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                            ) : (
                              <><FileImage className="h-4 w-4 mr-2" /> Submit Manual Payment Proof</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Regular payment completed indicator */}
                {currentBill && currentBill.status === "paid" && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 p-4 rounded-2xl text-sm font-semibold text-center">
                    ✅ This bill has been paid and verified. Thank you!
                  </div>
                )}

                {/* PAYMENT HISTORY */}
                {paymentHistory.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <button
                      onClick={() => setShowHistory((v) => !v)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <History className="h-4 w-4 text-blue-500" />
                        Payment History
                        <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          {paymentHistory.length}
                        </span>
                      </span>
                      {showHistory ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </button>

                    {showHistory && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 animate-in fade-in slide-in-from-top-2 duration-200">
                        {paymentHistory.map((bill) => {
                          const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                          const verifiedPayment = bill.payments?.find((p) => p.status === "verified") ?? bill.payments?.[0];
                          const paidDate = bill.paid_at
                            ? new Date(bill.paid_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })
                            : verifiedPayment?.reviewed_at
                              ? new Date(verifiedPayment.reviewed_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })
                              : "—";
                          const methodLabel: Record<string, string> = {
                            gcash: "GCash",
                            maya: "Maya",
                            bank_transfer: "Bank Transfer",
                            cash: "Cash",
                            paymongo: "PayMongo",
                          };
                          return (
                            <div key={bill.id} className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors">
                              <div className="flex flex-col gap-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {monthNames[bill.billing_month]} {bill.billing_year} Bill
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Period: {new Date(bill.paid_at || bill.billing_period_start).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })} – {new Date(bill.due_date).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" })}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  Paid on: <span className="font-semibold text-emerald-600 dark:text-emerald-400 ml-0.5">{paidDate}</span>
                                </p>
                                {verifiedPayment?.reference_number && (
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    Ref: {verifiedPayment.reference_number}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                  {formatCurrency(Number(bill.amount_due))}
                                </span>
                                {verifiedPayment && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 capitalize">
                                    <CreditCard className="h-2.5 w-2.5" />
                                    {methodLabel[verifiedPayment.method] ?? verifiedPayment.method}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                  ✓ Paid
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
