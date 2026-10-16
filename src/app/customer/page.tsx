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
  History,
  ImagePlus,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Smartphone,
  Upload,
  User,
  Wifi,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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

// ─── Receipt preview extracted data ──────────────────────────────────────────
type ExtractedData = {
  amount: string;
  refNo: string;
  date: string;
  name: string;
};

function getRemainingDays(dueDateStr: string): number {
  const now = new Date();
  const due = new Date(dueDateStr);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Payment method options (no PayMongo)
const PAYMENT_METHODS = [
  { value: "gcash",         label: "GCash",         color: "from-blue-500 to-blue-600",   icon: "💙" },
  { value: "maya",          label: "Maya",           color: "from-green-500 to-green-600", icon: "💚" },
  { value: "bank_transfer", label: "Bank Transfer",  color: "from-purple-500 to-indigo-600", icon: "🏦" },
  { value: "cash",          label: "Cash",           color: "from-amber-400 to-amber-500", icon: "💵" },
] as const;

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
  const [plans, setPlans] = useState<CustomerPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CustomerPlan | null>(null);

  // Receipt upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("gcash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [payerName, setPayerName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<{
    days: number; hours: number; minutes: number; seconds: number; isOverdue: boolean;
  } | null>(null);

  useEffect(() => {
    if (!customerData?.due_date) { setTimeLeft(null); return; }
    const updateTimer = () => {
      const target = new Date(customerData.due_date).getTime();
      const now    = new Date().getTime();
      const diff   = target - now;
      if (diff < 0) {
        const abs = Math.abs(diff);
        setTimeLeft({ days: Math.floor(abs / 86400000), hours: Math.floor((abs % 86400000) / 3600000), minutes: Math.floor((abs % 3600000) / 60000), seconds: Math.floor((abs % 60000) / 1000), isOverdue: true });
      } else {
        setTimeLeft({ days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), isOverdue: false });
      }
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [customerData?.due_date]);

  useEffect(() => {
    if (!customerData) return;
    const load = async () => {
      setPlansLoading(true);
      try {
        const res = await fetch("/api/plans");
        const data = await res.json();
        if (res.ok && data.plans) {
          const filtered = data.plans.filter((p: CustomerPlan) => p.speed !== "Expired-Profile");
          setPlans(filtered);
          const current = filtered.find((p: CustomerPlan) => p.id === customerData.plan_id);
          if (current) {
            setSelectedPlan(current);
            setAmountPaid(String(current.monthly_fee));
          }
        }
      } catch {
        toast.error("Failed to load plans.");
      } finally {
        setPlansLoading(false);
      }
    };
    void load();
  }, [customerData]);

  const isLocked =
    customerData?.status === "suspended" ||
    customerData?.status === "overdue"   ||
    customerData?.status === "expired";

  const handleLookup = async () => {
    if (!accountNumber.trim()) { toast.error("Please enter your account number."); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/portal/lookup", {
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
      setReceiptFile(null);
      setReceiptPreview(null);
      setReferenceNumber("");
      setAmountPaid("");
      setPaymentDate("");
      setPayerName("");
      toast.success("Account found successfully.");
    } catch (err: any) {
      toast.error(err.message || "Account lookup failed.");
      setFound(false); setCustomerData(null); setCurrentBill(null);
      setPendingPayment(null); setPaymentHistory([]); setShowHistory(false);
    } finally {
      setLoading(false);
    }
  };

  // ─── Handle receipt image selection & OCR ──────────────────────────────────
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrDetected, setOcrDetected] = useState<ExtractedData | null>(null);

  const handleReceiptSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("Receipt image must be under 10 MB."); return; }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setReceiptPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Auto-scan receipt using OCR
    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portal/payment-submit?action=ocr", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.amount) {
          setAmountPaid(String(data.amount));
        }
        if (data.referenceNumber) {
          setReferenceNumber(data.referenceNumber);
        }
        if (data.date) {
          setPaymentDate(data.date);
        }
        if (data.customerName) {
          setPayerName(data.customerName);
        }
        setOcrDetected({
          amount: data.amount ? String(data.amount) : "",
          refNo: data.referenceNumber ?? "",
          date: data.date ?? "",
          name: data.customerName ?? "",
        });
        toast.success("Receipt scanned! Amount, Ref No, and Date auto-detected.");
      }
    } catch (err) {
      console.warn("[OCR Error]:", err);
    } finally {
      setOcrScanning(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleReceiptSelect(file);
  };

  const clearReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setOcrDetected(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Submit payment ─────────────────────────────────────────────────────────
  const handleSubmitPayment = async () => {
    if (!customerData) return;
    if (!selectedPlan) { toast.error("Please select a plan first."); return; }
    if (!receiptFile)  { toast.error("Please upload your GCash / payment receipt."); return; }
    if (!referenceNumber.trim()) { toast.error("Please enter the Reference Number from your receipt."); return; }

    const amount = Number(amountPaid);
    if (!amount || amount <= 0) { toast.error("Please enter the amount from your receipt."); return; }

    // Plan-amount match check: must match exactly before saving
    if (Math.round(amount) !== Math.round(selectedPlan.monthly_fee)) {
      toast.error(`Plan and load amount do not match! Selected plan "${selectedPlan.plan_name}" is ₱${selectedPlan.monthly_fee.toLocaleString()}, but receipt is ₱${amount.toLocaleString()}. Make sure the plan and load match before saving.`);
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("accountNumber",   customerData.account_number);
      form.append("method",          paymentMethod);
      form.append("referenceNumber", referenceNumber.trim());
      form.append("amountPaid",      String(amount));
      form.append("planId",          selectedPlan.id);
      form.append("receipt",         receiptFile);
      if (paymentDate) form.append("receiptDate", paymentDate);
      if (payerName)   form.append("customerName", payerName.trim());

      const res  = await fetch("/api/portal/payment-submit", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed.");

      toast.success(data.message || "Receipt submitted! Customer renewed automatically & sent for admin confirmation.");
      clearReceipt();
      setReferenceNumber("");
      setAmountPaid(String(selectedPlan.monthly_fee));
      setPaymentDate("");
      setPayerName("");
      await handleLookup();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment proof.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_34rem),linear-gradient(180deg,#f8fafc,#eef6ff)] px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-12">
      <section className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-start gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:pt-8">
        {/* ─── Left column: lookup ─────────────────────────────────────── */}
        <div>
          <div className="inline-flex rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            No login required
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Check your ISP account &amp; subscription status.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            View your account details, remaining days, service status, and renew your subscription by uploading your GCash receipt.
          </p>
          <Card className="mt-8 max-w-xl bg-white/85 backdrop-blur dark:bg-slate-950/85">
            <CardHeader>
              <CardTitle>Account Lookup</CardTitle>
              <CardDescription>Enter the account number shown on your bill or receipt.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 997707322"
                onKeyDown={(e) => { if (e.key === "Enter") void handleLookup(); }}
              />
              <Button onClick={() => void handleLookup()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Check Account
              </Button>
            </CardContent>
          </Card>

          {/* How to pay guide */}
          <div className="mt-8 max-w-xl space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">How to Pay</p>
            {[
              { n: 1, t: "Open GCash / Maya App",          d: "Send money to our GCash number. Save the receipt screenshot shown after the transaction." },
              { n: 2, t: "Look up your account",            d: "Enter your account number in the search box above and tap Check Account." },
              { n: 3, t: "Select your plan & upload receipt", d: "Choose the plan you paid for, then tap the upload area to attach your receipt screenshot." },
              { n: 4, t: "Fill in the details",             d: "Enter the Reference Number, Amount, and Date exactly as they appear on your GCash receipt." },
              { n: 5, t: "Submit for verification",         d: "Tap Submit Receipt. An admin will verify and activate your account within 2 hours." },
            ].map(({ n, t, d }) => (
              <div key={n} className="flex gap-3 items-start bg-white/70 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">{n}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Right column: account card ───────────────────────────────── */}
        <Card className="bg-white/90 shadow-2xl shadow-blue-900/10 backdrop-blur dark:bg-slate-950/90 overflow-hidden">
          {found && customerData ? (
            <CardHeader className="flex flex-row items-center justify-between gap-4 px-6 py-5">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Number:</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono tracking-wider">{customerData.account_number}</span>
              </div>
              <Button
                onClick={() => setFound(false)}
                className="bg-[#00cbab] hover:bg-[#00b598] text-white font-bold px-5 py-2 rounded-xl text-sm border-0 shadow-md shadow-[#00cbab]/20 transition-all"
              >
                Logout
              </Button>
            </CardHeader>
          ) : (
            <CardHeader className="border-b border-slate-100 dark:border-slate-900">
              <CardTitle>Account Details</CardTitle>
              <CardDescription>Search an account number to show details.</CardDescription>
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
                        Your account is suspended due to an overdue balance or expired subscription. Upload your GCash receipt below to restore your connection.
                      </p>
                    </div>
                  </div>
                )}

                {/* Pending payment banner */}
                {pendingPayment && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 flex gap-3 items-start">
                    <div className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-500">⏳</div>
                    <div className="space-y-0.5 flex-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Receipt Under Review</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                        You have submitted a payment of <strong>{formatCurrency(pendingPayment.amount_paid)}</strong> via <strong className="capitalize">{pendingPayment.method}</strong>. Our team is reviewing it. Verification usually takes up to 2 hours on business days.
                      </p>
                    </div>
                  </div>
                )}

                {/* Countdown */}
                <div className="flex flex-col items-center space-y-6 pt-2">
                  <hr className="w-full border-slate-100 dark:border-slate-800/80" />
                  <div className="text-center">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{customerData.full_name}</h3>
                  </div>
                  <div className="text-center font-bold text-slate-600 dark:text-slate-300 text-sm tracking-wide mt-2">
                    Internet time left
                  </div>
                  <div className="flex items-center justify-center gap-3 sm:gap-4 py-2">
                    {[
                      { label: "Days",    val: timeLeft ? String(timeLeft.days).padStart(2, "0")    : "00" },
                      { label: "Hours",   val: timeLeft ? String(timeLeft.hours).padStart(2, "0")   : "00" },
                      { label: "Minutes", val: timeLeft ? String(timeLeft.minutes).padStart(2, "0") : "00" },
                      { label: "Seconds", val: timeLeft ? String(timeLeft.seconds).padStart(2, "0") : "00" },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex flex-col items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 ${timeLeft?.isOverdue ? "bg-rose-500 shadow-rose-500/20" : "bg-[#00cbab] shadow-[#00cbab]/20"} text-white flex items-center justify-center rounded-2xl text-2xl sm:text-3xl font-black shadow-lg transition-colors`}>
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                  {timeLeft?.isOverdue && (
                    <div className="text-center text-xs font-semibold text-rose-500 dark:text-rose-400 animate-pulse">
                      ⚠️ Subscription Expired! Please upload your receipt to restore your connection.
                    </div>
                  )}
                </div>

                {/* ─── PURCHASE & RENEWAL FLOW ──────────────────────── */}
                <div className="border border-orange-200 dark:border-orange-500/30 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300">
                  <div className="bg-gradient-to-r from-orange-500/10 to-rose-500/10 dark:from-orange-500/15 dark:to-rose-500/15 px-5 py-4 border-b border-orange-200 dark:border-orange-500/30">
                    <p className="font-bold text-orange-900 dark:text-orange-200 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" /> Purchase &amp; Renew Plan
                    </p>
                    <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
                      Select your plan, then upload your GCash / Maya receipt. An admin will verify and activate your account.
                    </p>
                  </div>

                  <div className="p-5 space-y-6 bg-white/60 dark:bg-slate-950/60">

                    {/* Step 1: Plan Selection */}
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
                          ) : plans.map((plan) => (
                            <button
                              key={plan.id}
                              onClick={() => { setSelectedPlan(plan); setAmountPaid(String(plan.monthly_fee)); }}
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
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Step 2: Payment method selection */}
                    {selectedPlan && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
                          Payment Method
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {PAYMENT_METHODS.map((m) => (
                            <button
                              key={m.value}
                              onClick={() => setPaymentMethod(m.value)}
                              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border-2 text-center transition-all duration-200 ${
                                paymentMethod === m.value
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300"
                              }`}
                            >
                              <span className="text-xl">{m.icon}</span>
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{m.label}</span>
                              {paymentMethod === m.value && (
                                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step 3: Upload receipt */}
                    {selectedPlan && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">3</span>
                          Upload Payment Receipt
                        </label>

                        {/* Drop zone */}
                        {!receiptPreview ? (
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/5 transition-all duration-200 group"
                          >
                            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <ImagePlus className="h-6 w-6 text-blue-500" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Tap to upload or drag &amp; drop
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                GCash / Maya receipt screenshot · JPG, PNG, PDF · Max 10 MB
                              </p>
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*,.pdf"
                              className="sr-only"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReceiptSelect(f); }}
                            />
                          </div>
                        ) : (
                          <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 dark:border-emerald-500/60">
                            {/* Receipt preview */}
                            <img
                              src={receiptPreview}
                              alt="Receipt preview"
                              className="w-full max-h-64 object-contain bg-slate-900"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end">
                              <div className="p-3 flex items-center justify-between w-full">
                                <div className="flex items-center gap-2 text-white text-xs font-semibold">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  {receiptFile?.name ?? "Receipt attached"}
                                </div>
                                <button
                                  onClick={clearReceipt}
                                  className="h-7 w-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                                  title="Remove receipt"
                                >
                                  <X className="h-3.5 w-3.5 text-white" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* OCR scanning indicator & detected badge */}
                        {ocrScanning && (
                          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
                            <span>Scanning receipt with OCR to auto-extract Amount, Reference No, and Date...</span>
                          </div>
                        )}
                        {ocrDetected && !ocrScanning && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <span className="font-bold">Auto-detected from receipt:</span> Amount ₱{ocrDetected.amount || "—"}, Ref: {ocrDetected.refNo || "—"}{ocrDetected.date ? `, Date: ${ocrDetected.date}` : ""}.
                            </div>
                          </div>
                        )}

                        {/* Tip */}
                        <div className="flex gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                          <Info className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                            Upload your <strong>GCash / Maya transaction receipt</strong> screenshot. The system reads the total amount, reference number, date, and customer name automatically.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Fill in receipt details */}
                    {selectedPlan && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">4</span>
                          Receipt Details &amp; Plan Verification
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {/* Reference Number */}
                          <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Reference / Transaction Number <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              placeholder="e.g. 2046 211 788420"
                              value={referenceNumber}
                              onChange={(e) => setReferenceNumber(e.target.value)}
                              className="font-mono"
                            />
                            <p className="text-[10px] text-slate-400">Found in your GCash receipt as "Ref No."</p>
                          </div>

                          {/* Amount */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Total Amount Sent (₱) <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={String(selectedPlan.monthly_fee)}
                              value={amountPaid}
                              onChange={(e) => setAmountPaid(e.target.value)}
                              className="font-semibold"
                            />
                            {selectedPlan && amountPaid && Math.round(Number(amountPaid)) !== Math.round(selectedPlan.monthly_fee) && (
                              <p className="text-[10px] text-rose-500 font-bold">
                                ⚠ Mismatch: Plan fee is ₱{selectedPlan.monthly_fee.toLocaleString()} but receipt is ₱{Number(amountPaid).toLocaleString()}. Plan and load must match before saving.
                              </p>
                            )}
                            {selectedPlan && amountPaid && Math.round(Number(amountPaid)) === Math.round(selectedPlan.monthly_fee) && (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ Plan and load amount matched (₱{selectedPlan.monthly_fee.toLocaleString()})
                              </p>
                            )}
                          </div>

                          {/* Date */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Transaction Date
                            </label>
                            <Input
                              type="date"
                              value={paymentDate}
                              onChange={(e) => setPaymentDate(e.target.value)}
                              max={new Date().toISOString().split("T")[0]}
                            />
                          </div>

                          {/* Sender name */}
                          <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Your Name (as shown on receipt)
                            </label>
                            <Input
                              placeholder="e.g. Juan Dela Cruz"
                              value={payerName}
                              onChange={(e) => setPayerName(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Plan summary & submit */}
                    {selectedPlan && (
                      <div className="space-y-3">
                        {/* Summary */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                            <span className="text-slate-500">Plan</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{selectedPlan.plan_name}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                            <span className="text-slate-500">Plan Price</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">₱{selectedPlan.monthly_fee.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                            <span className="text-slate-500">Payment Method</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 capitalize">{PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label ?? paymentMethod}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                            <span className="text-slate-500">Receipt</span>
                            <span className={`font-bold ${receiptFile ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                              {receiptFile ? `✓ ${receiptFile.name.length > 24 ? receiptFile.name.slice(0, 24) + "…" : receiptFile.name}` : "Not uploaded"}
                            </span>
                          </div>
                        </div>

                        <Button
                          className="w-full h-12 text-sm font-bold gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/20 text-white border-0 rounded-2xl"
                          onClick={() => void handleSubmitPayment()}
                          disabled={
                            submitting ||
                            ocrScanning ||
                            !receiptFile ||
                            !referenceNumber.trim() ||
                            !amountPaid ||
                            Math.round(Number(amountPaid)) !== Math.round(selectedPlan.monthly_fee)
                          }
                        >
                          {submitting ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Submitting Receipt...</>
                          ) : (
                            <><Upload className="h-4 w-4" /> Submit Receipt for Verification</>
                          )}
                        </Button>

                        <p className="text-center text-[11px] text-slate-400 leading-relaxed">
                          After submitting, our admin will review your receipt and activate your plan within 2 hours on business days.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Paid bill indicator */}
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
                      {showHistory ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
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
                            gcash: "GCash", maya: "Maya", bank_transfer: "Bank Transfer", cash: "Cash", paymongo: "PayMongo",
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
