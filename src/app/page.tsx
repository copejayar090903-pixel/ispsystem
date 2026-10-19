"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CreditCard,
  FileImage,
  Search,
  Wifi,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  UserCheck,
  User,
  Receipt,
  Network,
  ChevronDown,
  Star,
  Users,
  Clock,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Smartphone,
  Send,
  Info,
  CalendarDays,
  BadgeCheck,
  ExternalLink,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency } from "@/src/lib/utils";
import { scanReceiptSafe, type ParsedReceipt } from "@/src/lib/ocr";

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

type FAQItem = {
  question: string;
  answer: string;
};

function getRemainingDays(dueDateStr: string): number {
  const now = new Date();
  const due = new Date(dueDateStr);
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

const GCASH_STEPS = [
  {
    step: 1,
    title: "Open GCash App",
    desc: 'Launch GCash on your phone and tap "Send Money" on the home screen.',
    icon: Smartphone,
  },
  {
    step: 2,
    title: "Enter GCash Number",
    desc: "Input our official GCash number: 09XX-XXX-XXXX. Double-check before proceeding.",
    icon: Send,
  },
  {
    step: 3,
    title: "Enter the Amount",
    desc: "Type the exact subscription amount shown in your selected plan. Add a note with your account number.",
    icon: CreditCard,
  },
  {
    step: 4,
    title: "Confirm and Send",
    desc: "Review the details and tap Confirm. Save the transaction receipt shown on screen.",
    icon: CheckCircle2,
  },
  {
    step: 5,
    title: "Submit Reference Number",
    desc: "Copy the 13-digit GCash reference number and paste it in the form above, then tap Submit.",
    icon: BadgeCheck,
  },
];

export default function Home() {
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [found, setFound] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [currentBill, setCurrentBill] = useState<CurrentBill | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);

  // Regular payment form state (receipt upload)
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [regularReceiptFile, setRegularReceiptFile] = useState<File | null>(null);
  const [regularReceiptPreview, setRegularReceiptPreview] = useState<string | null>(null);
  const [regularOcrScanning, setRegularOcrScanning] = useState(false);
  const [regularDate, setRegularDate] = useState("");

  // Renewal / Purchase Load state
  const [showRenewal, setShowRenewal] = useState(false);
  const [plans, setPlans] = useState<CustomerPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CustomerPlan | null>(null);
  const [renewalName, setRenewalName] = useState("");
  const [renewalRef, setRenewalRef] = useState("");
  const [renewalAmount, setRenewalAmount] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [renewalReceiptFile, setRenewalReceiptFile] = useState<File | null>(null);
  const [renewalReceiptPreview, setRenewalReceiptPreview] = useState<string | null>(null);
  const [renewalOcrScanning, setRenewalOcrScanning] = useState(false);
  const [renewalOcrDetected, setRenewalOcrDetected] = useState<ParsedReceipt | null>(null);
  const [renewalSubmitting, setRenewalSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOverdue: boolean;
  } | null>(null);

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

  // Listen for clipboard image paste (Ctrl+V) when renewal flow is open
  useEffect(() => {
    if (!showRenewal) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            void handleRenewalReceiptUpload(file);
            toast.info("Pasted screenshot detected! Scanning receipt with OCR...");
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [showRenewal, customerData]);

  // FAQ
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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
      if (!res.ok) {
        throw new Error(data.error || "Account number not found.");
      }
      setCustomerData(data.customer);
      setCurrentBill(data.currentBill);
      setPendingPayment(data.pendingPayment ?? null);
      setFound(true);
      setShowRenewal(false);
      setSelectedPlan(null);
      setRenewalName("");
      setRenewalRef("");
      toast.success("Account statement loaded successfully.");
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

  const handleRenewalReceiptUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Receipt image must be under 10 MB.");
      return;
    }
    setRenewalReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setRenewalReceiptPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setRenewalOcrScanning(true);
    // Hard safety timeout: guarantee the loading spinner NEVER spins forever
    const safetyTimer = setTimeout(() => {
      setRenewalOcrScanning(false);
    }, 8500);

    try {
      const data = await scanReceiptSafe(file);
      if (data && data.success) {
        if (data.amount) setRenewalAmount(String(data.amount));
        if (data.referenceNumber) setRenewalRef(data.referenceNumber);
        if (data.date) setRenewalDate(data.date);
        // CRITICAL: Customer name is locked strictly to account number holder.
        // NEVER overwrite with OCR extracted receipt/sender name!
        if (customerData?.full_name) {
          setRenewalName(customerData.full_name);
        }
        setRenewalOcrDetected(data);
        toast.success("Receipt scanned! Amount and Ref No auto-detected.");
      } else {
        toast.info("Receipt attached! Please check or fill in the Ref No and amount.");
      }
    } catch (err) {
      console.warn("OCR notice:", err);
      toast.info("Receipt attached! Please check or fill in the Ref No and amount.");
    } finally {
      clearTimeout(safetyTimer);
      setRenewalOcrScanning(false);
    }
  };

  const handleRegularReceiptUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Receipt image must be under 10 MB.");
      return;
    }
    setRegularReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setRegularReceiptPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setRegularOcrScanning(true);
    const safetyTimer = setTimeout(() => {
      setRegularOcrScanning(false);
    }, 8500);

    try {
      const data = await scanReceiptSafe(file);
      if (data && data.success) {
        if (data.amount) setAmountPaid(String(data.amount));
        if (data.referenceNumber) setReferenceNumber(data.referenceNumber);
        if (data.date) setRegularDate(data.date);
        toast.success("Receipt scanned! Fields auto-detected.");
      } else {
        toast.info("Receipt attached! Please check or enter the reference number.");
      }
    } catch (err) {
      console.warn("OCR notice:", err);
    } finally {
      clearTimeout(safetyTimer);
      setRegularOcrScanning(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!customerData || !currentBill) return;
    if (!regularReceiptFile) {
      toast.error("Please upload your receipt image (e.g. GCash receipt).");
      return;
    }
    if (!referenceNumber.trim()) {
      toast.error("Please enter the reference number from your receipt.");
      return;
    }
    const amountNum = Number(amountPaid);
    if (!amountNum || amountNum <= 0) {
      toast.error("Please enter the amount paid.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("accountNumber", customerData.account_number);
      fd.append("method", paymentMethod);
      fd.append("referenceNumber", referenceNumber.trim());
      fd.append("amountPaid", String(amountNum));
      fd.append("receipt", regularReceiptFile);
      if (regularDate) fd.append("receiptDate", regularDate);

      const res = await fetch("/api/portal/payment-submit", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed.");

      toast.success(data.message || "Receipt submitted! Customer renewed automatically & sent for admin review.");
      setRegularReceiptFile(null);
      setRegularReceiptPreview(null);
      setReferenceNumber("");
      setAmountPaid("");
      setRegularDate("");
      await handleLookup();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment proof.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenewalSubmit = async () => {
    if (!customerData) return;
    if (!selectedPlan) {
      toast.error("Please select a subscription plan.");
      return;
    }
    if (!renewalReceiptFile) {
      toast.error("Please upload your GCash receipt image.");
      return;
    }
    if (!renewalRef.trim()) {
      toast.error("Please enter your GCash reference number.");
      return;
    }

    const amountNum = Number(renewalAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Please enter the amount from your receipt.");
      return;
    }

    // Exact match check: plan fee and load amount must match before saving
    if (Math.round(amountNum) !== Math.round(selectedPlan.monthly_fee)) {
      toast.error(
        `Plan and load amount do not match! Selected plan "${selectedPlan.plan_name}" is ₱${selectedPlan.monthly_fee.toLocaleString()}, but receipt is ₱${amountNum.toLocaleString()}. Please make sure the plan and load match before saving.`
      );
      return;
    }

    setRenewalSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("accountNumber", customerData.account_number);
      fd.append("method", "gcash");
      fd.append("referenceNumber", renewalRef.trim());
      fd.append("amountPaid", String(amountNum));
      fd.append("planId", selectedPlan.id);
      fd.append("customerName", renewalName.trim() || customerData.full_name);
      if (renewalDate) fd.append("receiptDate", renewalDate);
      if (renewalReceiptFile) fd.append("receipt", renewalReceiptFile);

      const res = await fetch("/api/portal/payment-submit", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Renewal submission failed.");

      toast.success(data.message || "Subscription renewed automatically! Admin will confirm your receipt.");
      setShowRenewal(false);
      setSelectedPlan(null);
      setRenewalName("");
      setRenewalRef("");
      setRenewalAmount("");
      setRenewalDate("");
      setRenewalReceiptFile(null);
      setRenewalReceiptPreview(null);
      setRenewalOcrDetected(null);
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

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const planOffers = [
    { name: "Plan Lite", speed: "75 Mbps", price: 700, tag: "Best Value" },
    { name: "Plan Prime", speed: "100 Mbps", price: 999, tag: "Most Popular" },
    { name: "Plan Pro", speed: "150 Mbps", price: 1299, tag: "Premium Home" },
  ];

  const faqItems: FAQItem[] = [
    {
      question: "How can I pay my ISP bill?",
      answer: "You can pay your bill via GCash, PayMaya, bank transfer, or cash. Simply send your payment to our official accounts, then enter your 9-digit account number on this homepage and upload the reference transaction number for verification.",
    },
    {
      question: "How long does it take for my payment to be verified?",
      answer: "Payment verification is usually processed by our admin operators within 30 minutes to 2 hours of submission during working hours (8 AM - 8 PM). You will receive an update instantly once verified.",
    },
    {
      question: "What happens after my payment is verified?",
      answer: "Once the admin approves your payment, your billing statement status is updated to 'paid'. If your connection was previously disabled due to overdue bills, the router API will automatically re-enable your PPPoE fiber profile within seconds.",
    },
    {
      question: "Where can I find my account number?",
      answer: "Your account number is a unique 9-digit number provided during installation. It can be found on your original installation receipt or previous billing receipts.",
    },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_42rem),linear-gradient(180deg,#f8fafc,#eff6ff)] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.06),transparent_42rem)] dark:bg-slate-950 text-slate-950 dark:text-slate-100 transition-colors duration-300 pb-20">
      {/* Decorative gradient blob */}
      <div className="absolute top-1/4 right-10 w-96 h-96 bg-blue-400/10 dark:bg-blue-600/5 rounded-full filter blur-[80px] pointer-events-none" />
      <div className="absolute top-2/3 left-5 w-80 h-80 bg-emerald-400/10 dark:bg-emerald-600/5 rounded-full filter blur-[80px] pointer-events-none" />

      {/* Header bar */}
      <header className="border-b border-slate-200/60 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-blue-500/15">
              <Network className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Devcop IT Solution</span>
              <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Fiber Optics</span>
            </div>
          </div>
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5 font-medium hover:bg-slate-100 dark:hover:bg-slate-900">
              Admin Portal <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero & Payment Lookup Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-start">
        <div className="space-y-6 text-center lg:text-left lg:pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 dark:border-blue-800 bg-blue-50/50 dark:bg-slate-900 px-4 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Gigabit Home &amp; Business Fiber
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.05]">
            Fast fiber connection, <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">simple statements.</span>
          </h1>
          <p className="max-w-xl text-base sm:text-lg text-slate-600 dark:text-slate-350 leading-relaxed mx-auto lg:mx-0">
            Check your outstanding statement, download receipts, and upload payment confirmation. Paste your GCash reference number to trigger instant automated reconnection.
          </p>
          <div className="grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0 pt-6 text-xs font-medium text-slate-500 dark:text-slate-400">
            <div className="flex flex-col items-center lg:items-start space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">99.9%</span>
              <span className="text-[10px] uppercase font-bold text-slate-400">Uptime Rate</span>
            </div>
            <div className="flex flex-col items-center lg:items-start space-y-1 border-x border-slate-200/80 dark:border-slate-800 px-4">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">&lt;4ms</span>
              <span className="text-[10px] uppercase font-bold text-slate-400">Ping latency</span>
            </div>
            <div className="flex flex-col items-center lg:items-start space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">24/7</span>
              <span className="text-[10px] uppercase font-bold text-slate-400">Support Ops</span>
            </div>
          </div>
        </div>

        {/* Dynamic Billing Portal Card */}
        <div id="bill-portal" className="w-full">
          <Card className="bg-white/90 dark:bg-slate-950/90 shadow-2xl border border-slate-200/50 dark:border-slate-850/80 backdrop-blur-md rounded-3xl overflow-hidden shadow-blue-500/5 transition duration-300">
            {found && customerData ? (
              <CardHeader className="flex flex-row items-center justify-between gap-4 px-6 py-5">
                <div className="flex flex-col text-left">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Number:</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono tracking-wider">{customerData.account_number}</span>
                </div>
                <Button
                  onClick={() => { setFound(false); setShowRenewal(false); }}
                  className="bg-[#00cbab] hover:bg-[#00b598] text-white font-bold px-5 py-2 rounded-xl text-sm border-0 shadow-md shadow-[#00cbab]/20 transition-all"
                >
                  Logout
                </Button>
              </CardHeader>
            ) : (
              <CardHeader className="border-b border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/10 py-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Account & Billing Tracker</CardTitle>
                    <CardDescription>Instant account lookup, balance, and payments gateway</CardDescription>
                  </div>
                </div>
              </CardHeader>
            )}
            <CardContent className="pt-6 space-y-6">
              {!found ? (
                // Initial Search view
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Lookup</label>
                    <div className="flex gap-2.5">
                      <Input
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="Enter 9-digit account number (e.g. 997707322)"
                        className="rounded-xl h-11 border-slate-200 dark:border-slate-850 dark:bg-slate-900 focus-visible:ring-blue-500 text-sm font-medium"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleLookup();
                        }}
                      />
                      <Button
                        onClick={() => void handleLookup()}
                        disabled={loading}
                        className="h-11 rounded-xl px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/15"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />} Search
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-450 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850">
                    <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    <span>No registration or login password required. Query your details securely using your account number only.</span>
                  </div>
                </div>
              ) : (
                customerData && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* LOCKED / SUSPENDED BANNER */}
                    {isLocked && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 p-4 flex gap-3 items-start animate-in fade-in duration-300">
                        <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-bold text-rose-800 dark:text-rose-300">Account Locked / Suspended</p>
                          <p className="text-xs text-rose-700/80 dark:text-rose-400/80 leading-relaxed">
                            Your account is suspended due to an overdue balance or expired subscription. Please renew your subscription to restore service.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Pending payment banner */}
                    {pendingPayment && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 flex gap-3 items-start animate-in fade-in duration-300">
                        <div className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-500">⏳</div>
                        <div className="space-y-0.5 flex-1">
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Payment Pending Verification</p>
                          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                            You have already submitted a payment of <strong>{formatCurrency(pendingPayment.amount_paid)}</strong> via <strong className="capitalize">{pendingPayment.method}</strong>. Our team is reviewing it. Connection will be restored once verified (usually within 2 hours on business days).
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
                          ⚠️ Subscription Expired ! Please purchase load to restore your connection.
                        </div>
                      )}

                      {!showRenewal && (
                        <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2">
                          <Button
                            onClick={handleShowRenewal}
                            className="w-full sm:w-auto px-8 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Purchase Load / Renew Subscription
                          </Button>
                          <p className="text-[11px] text-slate-400">Click to choose your plan and submit your GCash / Maya renewal receipt</p>
                        </div>
                      )}
                    </div>

                    {/* ============= RENEWAL FLOW ============= */}
                    {showRenewal && (
                      <div className="border border-orange-200 dark:border-orange-500/30 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300">
                        {/* Renewal header */}
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

                          {/* Step 2: Upload Payment Receipt (GCash / Maya) */}
                          <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
                              Upload GCash / E-Wallet Receipt
                            </label>

                            {/* Payment details banner */}
                            <div className="rounded-2xl border border-blue-200 dark:border-blue-500/25 bg-blue-50/70 dark:bg-blue-500/5 p-4 space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                                  <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  Official GCash Payment Account
                                </span>
                                <Badge className="bg-blue-600 text-white text-[10px]">Instant OCR</Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">GCash Number</span>
                                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">0975 920 9976</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Account Name</span>
                                  <span className="font-bold text-slate-900 dark:text-white text-sm">Devcop ISP / Jayar C.</span>
                                </div>
                              </div>
                            </div>

                            {/* File Upload Box */}
                            {!renewalReceiptPreview ? (
                              <label className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/20 dark:hover:border-blue-500/50 transition-all">
                                <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-105 transition-transform">
                                  <Upload className="h-6 w-6" />
                                </div>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  Tap to upload or paste (Ctrl+V) receipt image
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  Drag &amp; drop, browse, or paste screenshot from clipboard. OCR will auto-detect Ref No and Amount.
                                </p>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleRenewalReceiptUpload(f);
                                  }}
                                />
                              </label>
                            ) : (
                              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col items-center justify-center p-2">
                                <img
                                  src={renewalReceiptPreview}
                                  alt="Receipt preview"
                                  className="max-h-56 object-contain rounded-xl"
                                />
                                <div className="flex items-center justify-between w-full px-3 py-2 bg-slate-900/80 rounded-xl mt-2">
                                  <span className="text-xs text-white truncate font-medium">
                                    {renewalReceiptFile?.name}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setRenewalReceiptFile(null);
                                      setRenewalReceiptPreview(null);
                                      setRenewalOcrDetected(null);
                                    }}
                                    className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1"
                                  >
                                    <X className="h-3.5 w-3.5" /> Remove
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* OCR scanning status */}
                            {renewalOcrScanning && (
                              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 animate-pulse">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
                                <span>Scanning receipt image with OCR to auto-extract Amount, Reference No, and Date...</span>
                              </div>
                            )}

                            {/* OCR auto-detected badge */}
                            {renewalOcrDetected && !renewalOcrScanning && (
                              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                  <span className="font-bold">Auto-detected from receipt:</span> Total Amount: ₱{renewalAmount || "—"}, Ref No: {renewalRef || "—"}{renewalDate ? `, Date: ${renewalDate}` : ""}.
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Step 3: Verify Details & Plan-Load Match */}
                          <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">3</span>
                              Receipt Details &amp; Plan Verification
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                  GCash Reference No. <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                  placeholder="e.g. 2046 211 788420"
                                  value={renewalRef}
                                  onChange={(e) => setRenewalRef(e.target.value)}
                                  className="h-10 rounded-xl font-mono text-sm"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                  Total Amount Sent (₱) <span className="text-rose-500">*</span>
                                </label>
                                <Input
                                  type="number"
                                  placeholder={selectedPlan ? String(selectedPlan.monthly_fee) : "0"}
                                  value={renewalAmount}
                                  onChange={(e) => setRenewalAmount(e.target.value)}
                                  className="h-10 rounded-xl font-bold text-sm"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                  Transaction Date
                                </label>
                                <Input
                                  placeholder="e.g. Oct 17, 2026"
                                  value={renewalDate}
                                  onChange={(e) => setRenewalDate(e.target.value)}
                                  className="h-10 rounded-xl text-sm"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                  <span>Customer Name (Account Holder)</span>
                                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">Verified Account</span>
                                </label>
                                <Input
                                  readOnly
                                  value={customerData?.full_name || renewalName}
                                  className="h-10 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 cursor-not-allowed border-slate-200 dark:border-slate-800"
                                />
                                <p className="text-[10px] text-slate-400">Fixed to Account #{customerData?.account_number}</p>
                              </div>
                            </div>

                            {/* Plan and Load Match Alert */}
                            {selectedPlan && renewalAmount && Math.round(Number(renewalAmount)) !== Math.round(selectedPlan.monthly_fee) && (
                              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-rose-600" />
                                <div>
                                  <span className="font-bold">Plan &amp; Load Amount Mismatch!</span>
                                  <p className="mt-0.5">
                                    Selected plan "{selectedPlan.plan_name}" is ₱{selectedPlan.monthly_fee.toLocaleString()}, but receipt shows ₱{Number(renewalAmount).toLocaleString()}. The plan and load amount must match before saving.
                                  </p>
                                </div>
                              </div>
                            )}

                            {selectedPlan && renewalAmount && Math.round(Number(renewalAmount)) === Math.round(selectedPlan.monthly_fee) && (
                              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                                <span className="font-semibold">
                                  ✓ Plan and load amount matched: ₱{selectedPlan.monthly_fee.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Submit Renewal Buttons */}
                          <div className="flex gap-2 pt-2">
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
                              disabled={
                                renewalSubmitting ||
                                renewalOcrScanning ||
                                !selectedPlan ||
                                !renewalReceiptFile ||
                                !renewalRef.trim() ||
                                !renewalAmount ||
                                Math.round(Number(renewalAmount)) !== Math.round(selectedPlan.monthly_fee)
                              }
                            >
                              {renewalSubmitting ? (
                                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Renewing Subscription...</>
                              ) : (
                                <><Send className="h-4 w-4 mr-1.5" /> Submit Receipt &amp; Auto-Renew</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Unpaid / renewal notice if bill exists */}
                    {currentBill && currentBill.status === "paid" && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 p-4 rounded-2xl text-xs font-semibold text-center animate-in zoom-in-95 duration-300">
                        ✅ This bill has been paid and verified. Thank you!
                      </div>
                    )}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Why Choose Devcop Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
          Devcop IT Experience
        </h2>
        <p className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white max-w-xl mx-auto mb-12">
          Engineered for performance, designed for convenience.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 pt-4">
          <FeatureCard
            icon={<Zap className="h-6 w-6 text-amber-500" />}
            title="Fast fiber speeds"
            detail="Consistent upload and download channels with zero speed throttling."
          />
          <FeatureCard
            icon={<Clock className="h-6 w-6 text-blue-500" />}
            title="Zero Latency Jitter"
            detail="Perfect for home workspaces, online conferencing, and lag-free gaming."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-6 w-6 text-emerald-500" />}
            title="Secure Statements"
            detail="Lookup details and upload proofs securely using unique credentials."
          />
          <FeatureCard
            icon={<Users className="h-6 w-6 text-purple-500" />}
            title="Local Operator Sync"
            detail="Verification and support resolved directly by technicians in your area."
          />
        </div>
      </section>

      {/* Pricing / Plan Catalog Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-200/60 dark:border-slate-900">
        <div className="text-center mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-3">
            Internet Packages
          </h2>
          <p className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white max-w-xl mx-auto">
            Choose the package plan that matches your speed requirements.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 pt-4">
          {planOffers.map((offer) => (
            <Card
              key={offer.name}
              className="bg-white/80 dark:bg-slate-950/80 border border-slate-200/50 dark:border-slate-850 hover:border-blue-500 dark:hover:border-blue-500 hover:scale-[1.02] transition-all duration-300 rounded-3xl overflow-hidden flex flex-col justify-between"
            >
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <Badge variant="muted" className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {offer.tag}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-bold mt-3">{offer.name}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">₱{offer.price}</span>
                  <span className="text-xs text-slate-400">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-6">
                <div className="border-t border-slate-100 dark:border-slate-900/60 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Internet Speed</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{offer.speed}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Monthly Cap</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Unlimited</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Contract Period</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">No Lock-in</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition"
                  onClick={() => {
                    const el = document.getElementById("bill-portal");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                    toast.info(`Enter your subscriber ID to pay for ${offer.name}.`);
                  }}
                >
                  Select Package
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Customer Testimonials Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-200/60 dark:border-slate-900">
        <div className="text-center mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-3">
            User Feedback
          </h2>
          <p className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white max-w-xl mx-auto">
            What our fiber subscribers are saying.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-4">
          <TestimonialCard
            name="John Carlo"
            role="Remote Software Engineer"
            quote="The speed is extremely consistent, and checking my monthly balance takes under 10 seconds. Uploading the GCash reference is so simple!"
            stars={5}
          />
          <TestimonialCard
            name="Mylene Z."
            role="Online Store Owner"
            quote="No issues or lag during high traffic hours. Automated reconnection kicked in instantly after my payment got approved. Incredible support!"
            stars={5}
          />
          <TestimonialCard
            name="Andy B."
            role="Home Workspace"
            quote="Pure fiber optics connection. Zero lock-in contract matches my preferences. The portal makes statement checkups easy."
            stars={5}
          />
        </div>
      </section>

      {/* Collapsible FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-200/60 dark:border-slate-900">
        <div className="text-center mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
            Help Center
          </h2>
          <p className="font-display text-3xl font-extrabold text-slate-900 dark:text-white">
            Frequently Asked Questions
          </p>
        </div>

        <div className="space-y-3 pt-4">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="border border-slate-200/60 dark:border-slate-850 rounded-2xl overflow-hidden bg-white/40 dark:bg-slate-950/20 backdrop-blur-sm transition-all"
            >
              <button
                onClick={() => toggleFaq(index)}
                className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold text-sm hover:bg-slate-50/50 dark:hover:bg-slate-900/10 focus:outline-none"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${activeFaq === index ? "rotate-180 text-blue-500" : ""
                    }`}
                />
              </button>
              {activeFaq === index && (
                <div className="px-6 pb-5 pt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Admin Module links footer section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 border-t border-slate-200/60 dark:border-slate-900">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center mb-8">
          ISP Admin Console Access Controls
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto">
          <Link href="/admin/dashboard" className="group border border-slate-200/60 hover:border-blue-500 dark:border-slate-900 p-4 rounded-2xl bg-white dark:bg-slate-950/40 hover:shadow-lg transition duration-200">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500">
              <Activity className="h-4 w-4" /> Operations Dashboard
            </span>
            <p className="text-xs text-slate-500 mt-2">Manage router health, connection speed packages, and sync data.</p>
          </Link>

          <Link href="/admin/billing" className="group border border-slate-200/60 hover:border-blue-500 dark:border-slate-900 p-4 rounded-2xl bg-white dark:bg-slate-950/40 hover:shadow-lg transition duration-200">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500">
              <Receipt className="h-4 w-4" /> Billing Statements
            </span>
            <p className="text-xs text-slate-500 mt-2">Generate monthly invoices, track revenue collections and efficiency charts.</p>
          </Link>

          <Link href="/admin/payments" className="group border border-slate-200/60 hover:border-blue-500 dark:border-slate-900 p-4 rounded-2xl bg-white dark:bg-slate-950/40 hover:shadow-lg transition duration-200">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500">
              <CreditCard className="h-4 w-4" /> Payments Approval
            </span>
            <p className="text-xs text-slate-500 mt-2">Verify references, approve GCash/Maya receipts, and enable PPPoE.</p>
          </Link>

          <Link href="/admin/pppoe" className="group border border-slate-200/60 hover:border-blue-500 dark:border-slate-900 p-4 rounded-2xl bg-white dark:bg-slate-950/40 hover:shadow-lg transition duration-200">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500">
              <UserCheck className="h-4 w-4" /> Router PPPoE Sync
            </span>
            <p className="text-xs text-slate-500 mt-2">Review active sessions, sync PPPoE secrets, and manage status disconnects.</p>
          </Link>
        </div>
      </section>

      {/* Visual Footer */}
      <footer className="text-center text-xs text-slate-400 dark:text-slate-500 mt-16 pt-8 border-t border-slate-200/40 dark:border-slate-900">
        <p>© 2026 Devcop IT Solution. All rights reserved. All connection APIs secure and synced.</p>
      </footer>
    </main>
  );
}

function InfoTile({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100/60 dark:border-slate-900/80 p-3.5 rounded-2xl">
      <span className="text-slate-400 block mb-1 text-[11px]">{label}</span>
      <span className={`font-bold text-slate-800 dark:text-slate-200 block text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-400 mt-0.5 block">{sub}</span>}
    </div>
  );
}

function FeatureCard({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="bg-white/70 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-900 p-5 rounded-3xl hover:scale-[1.01] hover:shadow-md transition duration-200 text-left space-y-3">
      <div className="h-10 w-10 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center border border-slate-100 dark:border-slate-850">
        {icon}
      </div>
      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h3>
      <p className="text-xs text-slate-550 dark:text-slate-400 leading-normal">{detail}</p>
    </div>
  );
}

function TestimonialCard({ name, role, quote, stars }: { name: string; role: string; quote: string; stars: number }) {
  return (
    <div className="bg-white/60 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-900 p-5 rounded-3xl text-left space-y-3 flex flex-col justify-between">
      <div className="space-y-2">
        <div className="flex gap-0.5">
          {Array.from({ length: stars }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-350 italic leading-relaxed">"{quote}"</p>
      </div>
      <div className="border-t border-slate-100 dark:border-slate-900/80 pt-3">
        <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">{name}</span>
        <span className="text-[10px] text-slate-400 block">{role}</span>
      </div>
    </div>
  );
}