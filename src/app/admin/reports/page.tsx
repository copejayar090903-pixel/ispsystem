"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, AlertTriangle,
  Wallet, BadgePercent, Calendar, FileSpreadsheet, FileText,
  Download, CreditCard, Activity, CheckCircle2, XCircle, Clock, Loader2,
  DollarSign, ArrowUpRight, ArrowDownRight, Search, History,
  Bell, Send, Minus, Plus, Trash2, Receipt, X, LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency, cn } from "@/src/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
type ReportData = {
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    overdueCustomers: number;
    totalInvoiced: number;
    totalCollected: number;
    outstanding: number;
    collectionRate: number;
    currentMonthPaid: number;
    currentMonthUnpaid: number;
    currentMonthRevenue: number;
    currentMonthName: string;
    currentYear: number;
    currentMonthExpenses: number;
    currentMonthNetProfit: number;
    totalExpenses12m: number;
    totalNetProfit12m: number;
  };
  customerStatusData: { name: string; value: number }[];
  planDistributionData: { name: string; customers: number; revenue: number; speed: string }[];
  revenueTrendData: { month: string; collected: number; invoiced: number; efficiency: number }[];
  paymentMethodData: { name: string; count: number; total: number }[];
  collectionEfficiencyData: { month: string; efficiency: number; collected: number; invoiced: number }[];
  overdueCustomers: {
    id: string;
    full_name: string;
    account_number: string;
    status: string;
    plan_name: string;
    totalOwed: number;
    unpaidMonths: number;
  }[];
  outstandingCustomers: {
    id: string;
    full_name: string;
    account_number: string;
    email: string | null;
    contact_number: string | null;
    status: string;
    plan_name: string;
    monthly_fee: number;
    totalOwed: number;
    unpaidMonths: number;
    unpaidMonthsList: {
      billing_year: number;
      billing_month: number;
      amount_due: number;
      due_date: string;
    }[];
  }[];
  customerGrowthData: { month: string; newCustomers: number; totalCustomers: number }[];
  recentPaidBills: {
    id: string;
    customer: string;
    account_number: string;
    month: string;
    amount_due: number;
    paid_at: string | null;
    due_date: string | null;
    method: string;
    amount_paid: number;
    reference_number: string | null;
  }[];
  customerPaymentHistory: Array<{
    customer: string;
    account_number: string;
    bills: Array<{
      id: string;
      month: string;
      billing_period_start: string;
      billing_period_end: string;
      paid_at: string | null;
      due_date: string | null;
      amount_due: number;
      amount_paid: number;
      method: string;
      reference_number: string | null;
    }>;
  }>;
  revenueWithExpenses: {
    month: string;
    key: string;
    collected: number;
    invoiced: number;
    expenses: number;
    netProfit: number;
  }[];
  expensesByMonth: Record<string, { total: number; items: any[] }>;
  expenses: {
    id: string;
    name: string;
    category: string;
    amount: number;
    billing_year: number;
    billing_month: number;
    notes: string | null;
    created_at: string;
  }[];
};

// ─── Color Palettes ──────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  inactive: "#94a3b8",
  disconnected: "#f59e0b",
  overdue: "#ef4444",
  suspended: "#8b5cf6",
};

const PLAN_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const METHOD_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="h-3.5 w-3.5" />,
  inactive: <Clock className="h-3.5 w-3.5" />,
  disconnected: <XCircle className="h-3.5 w-3.5" />,
  overdue: <AlertTriangle className="h-3.5 w-3.5" />,
  suspended: <XCircle className="h-3.5 w-3.5" />,
};

// ─── Tooltip Formatter ───────────────────────────────────────────────────────
const currencyFormatter = (value: any) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const pctFormatter = (value: any) => `${value}%`;

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon, trend, color = "blue",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  color?: "blue" | "green" | "red" | "amber" | "purple";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  };
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">{value}</p>
            {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className={`flex-shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center ${colorMap[color]}`}>
            {icon}
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-3">
            {trend === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const FULL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function ReportsPage() {
  type ReportTab = "overview" | "revenue" | "customers" | "payments" | "expenses" | "outstanding";
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [billsSearch, setBillsSearch] = useState("");
  const [billsPage, setBillsPage] = useState(1);
  const BILLS_PER_PAGE = 50;

  // Outstanding / Reminder state
  const [outstandingSearch, setOutstandingSearch] = useState("");
  const [sendingReminder, setSendingReminder] = useState<Record<string, boolean>>({});

  // Expense form state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("operational");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseMonth, setExpenseMonth] = useState(new Date().getMonth() + 1);
  const [expenseYear, setExpenseYear] = useState(new Date().getFullYear());
  const [expenseNotes, setExpenseNotes] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<string | null>(null);

  // Send reminder to a single customer
  const handleSendReminder = async (customerId: string, customerName: string) => {
    setSendingReminder((prev) => ({ ...prev, [customerId]: true }));
    try {
      const res = await fetch(`/api/billing/reminders/${customerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["email", "sms"] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send reminder.");
      toast.success(`Reminder sent to ${customerName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reminder.");
    } finally {
      setSendingReminder((prev) => ({ ...prev, [customerId]: false }));
    }
  };

  // Add expense
  const handleAddExpense = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!expenseName || !expenseName.trim()) {
      toast.error("Expense name is required.");
      return;
    }
    const numAmount = parseFloat(expenseAmount);
    if (isNaN(numAmount) || numAmount < 0) {
      toast.error("Please enter a valid amount greater than or equal to 0.");
      return;
    }

    setAddingExpense(true);
    try {
      const payload = {
        name: expenseName.trim(),
        category: expenseCategory,
        amount: numAmount,
        billing_year: Number(expenseYear),
        billing_month: Number(expenseMonth),
        notes: expenseNotes.trim() || null,
      };

      let res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 404 || res.status === 405) {
        res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const contentType = res.headers.get("content-type") || "";
      let json: any = {};
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
        const text = await res.text();
        throw new Error(
          res.status === 404 || res.status === 405
            ? "New API route not loaded by dev server yet. Please restart 'npm run dev' terminal."
            : `Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`
        );
      }

      if (!res.ok) throw new Error(json.error || "Failed to add expense.");
      
      toast.success(`Expense "${expenseName.trim()}" added successfully.`);
      setExpenseName("");
      setExpenseAmount("");
      setExpenseNotes("");
      setShowExpenseForm(false);

      // Refresh reports
      const reloadRes = await fetch("/api/reports");
      if (reloadRes.ok) {
        const contentTypeReload = reloadRes.headers.get("content-type") || "";
        if (contentTypeReload.includes("application/json")) {
          const reloadJson = await reloadRes.json();
          setData(reloadJson);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add expense.");
    } finally {
      setAddingExpense(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = async (id: string) => {
    setDeletingExpense(id);
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      const contentType = res.headers.get("content-type") || "";
      let json: any = {};
      if (contentType.includes("application/json")) {
        json = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`);
      }
      if (!res.ok) throw new Error(json.error || "Failed to delete expense.");
      toast.success("Expense deleted.");
      // Refresh reports
      const reloadRes = await fetch("/api/reports");
      if (reloadRes.ok) {
        const contentTypeReload = reloadRes.headers.get("content-type") || "";
        if (contentTypeReload.includes("application/json")) {
          const reloadJson = await reloadRes.json();
          setData(reloadJson);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete expense.");
    } finally {
      setDeletingExpense(null);
    }
  };

  useEffect(() => {
    async function fetchReports() {
      setLoading(true);
      try {
        const res = await fetch("/api/reports");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to fetch reports.");
        setData(json);
      } catch (err: any) {
        setError(err.message);
        toast.error("Failed to load report data.");
      } finally {
        setLoading(false);
      }
    }
    void fetchReports();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
          Loading report data...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-rose-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">{error || "Failed to load reports."}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const { summary } = data;

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description={`Detailed data insights for ${summary.currentMonthName} ${summary.currentYear} — revenue, collections, customers, and billing performance.`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowExpenseForm(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
            <Button variant="outline" onClick={() => toast.info("Export feature coming soon.")}>
              <Download className="h-4 w-4" /> Export All
            </Button>
          </div>
        }
      />

      {/* ─── Tab Navigation Bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        {([
          { id: "overview", label: "Overview", icon: LayoutDashboard },
          { id: "revenue", label: "Revenue", icon: DollarSign },
          { id: "customers", label: "Customers", icon: Users },
          { id: "payments", label: "Payments", icon: CreditCard },
          { id: "expenses", label: "Expenses", icon: Receipt, count: data.expenses.length },
          {
            id: "outstanding",
            label: "Outstanding",
            icon: AlertTriangle,
            count: (data.overdueCustomers.length || 0) + (data.outstandingCustomers?.length || 0),
          },
        ] as Array<{ id: ReportTab; label: string; icon: any; count?: number }>).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer shadow-sm",
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-white text-slate-600 hover:text-slate-950 hover:bg-slate-100 border border-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={cn(
                    "ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                    isActive
                      ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                      : tab.id === "outstanding"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── KPI Summary Row (Overview) ─────────────────────────────────── */}
      {activeTab === "overview" && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Total Customers"
            value={String(summary.totalCustomers)}
            sub={`${summary.activeCustomers} active`}
            icon={<Users className="h-5 w-5" />}
            color="blue"
          />
          <KpiCard
            title={`${summary.currentMonthName} Revenue`}
            value={formatCurrency(summary.currentMonthRevenue)}
            sub={`${summary.currentMonthPaid} bills paid this month`}
            icon={<Wallet className="h-5 w-5" />}
            color="green"
            trend="up"
          />
          <KpiCard
            title="Outstanding Balance"
            value={formatCurrency(summary.outstanding)}
            sub={`${summary.currentMonthUnpaid} unpaid this month`}
            icon={<AlertTriangle className="h-5 w-5" />}
            color="red"
            trend="down"
          />
          <KpiCard
            title="Collection Rate"
            value={`${summary.collectionRate}%`}
            sub={`${formatCurrency(summary.totalCollected)} of ${formatCurrency(summary.totalInvoiced)}`}
            icon={<BadgePercent className="h-5 w-5" />}
            color={summary.collectionRate >= 75 ? "green" : summary.collectionRate >= 50 ? "amber" : "red"}
            trend={summary.collectionRate >= 75 ? "up" : "down"}
          />
        </section>
      )}

      {/* ─── KPI Row 2: Expenses & Net Profit (Overview & Expenses) ────────── */}
      {(activeTab === "overview" || activeTab === "expenses") && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title={`${summary.currentMonthName} Expenses`}
            value={formatCurrency(summary.currentMonthExpenses)}
            sub="Operational costs this month"
            icon={<Receipt className="h-5 w-5" />}
            color="amber"
          />
          <KpiCard
            title={`${summary.currentMonthName} Net Profit`}
            value={formatCurrency(summary.currentMonthNetProfit)}
            sub={`Revenue ${formatCurrency(summary.currentMonthRevenue)} − Costs ${formatCurrency(summary.currentMonthExpenses)}`}
            icon={<TrendingUp className="h-5 w-5" />}
            color={summary.currentMonthNetProfit >= 0 ? "green" : "red"}
            trend={summary.currentMonthNetProfit >= 0 ? "up" : "down"}
          />
          <KpiCard
            title="12-Month Total Expenses"
            value={formatCurrency(summary.totalExpenses12m)}
            sub="All tracked costs over 12 months"
            icon={<Minus className="h-5 w-5" />}
            color="amber"
          />
          <KpiCard
            title="12-Month Net Profit"
            value={formatCurrency(summary.totalNetProfit12m)}
            sub={`Collected ${formatCurrency(summary.totalCollected)} − Costs ${formatCurrency(summary.totalExpenses12m)}`}
            icon={<DollarSign className="h-5 w-5" />}
            color={summary.totalNetProfit12m >= 0 ? "green" : "red"}
            trend={summary.totalNetProfit12m >= 0 ? "up" : "down"}
          />
        </section>
      )}

      {/* ─── Revenue per Month + Collection Summary ────────────────────────── */}
      {(activeTab === "overview" || activeTab === "revenue") && (
      <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
      {/* Left: Revenue per Month chart + table */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Revenue per Month
            </CardTitle>
            <CardDescription>Collected vs. invoiced revenue — last 12 months</CardDescription>
          </div>
          {/* Quick totals */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">12-Month Invoiced</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                {formatCurrency(data.revenueTrendData.reduce((s, m) => s + m.invoiced, 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">12-Month Collected</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(data.revenueTrendData.reduce((s, m) => s + m.collected, 0))}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6 pb-0">
          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={data.revenueTrendData}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="revenueCollectedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id="revenueInvoicedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card, #1e293b)",
                  border: "1px solid rgba(148,163,184,0.15)",
                  borderRadius: "10px",
                  fontSize: 12,
                }}
                formatter={(value: any, name: string | number | undefined) => [
                  `₱${Number(value).toLocaleString("en-PH")}`,
                  name ?? "",
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => <span className="text-slate-500 dark:text-slate-400">{value}</span>}
              />
              {/* Invoiced as a light background bar */}
              <Bar
                dataKey="invoiced"
                name="Invoiced"
                fill="url(#revenueInvoicedGrad)"
                stroke="#3b82f6"
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
              {/* Collected as a vibrant foreground bar */}
              <Bar
                dataKey="collected"
                name="Collected"
                fill="url(#revenueCollectedGrad)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Month-by-month summary table */}
          <div className="mt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-left font-semibold text-slate-400 uppercase tracking-wider">Month</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-slate-400 uppercase tracking-wider">Invoiced</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-slate-400 uppercase tracking-wider">Collected</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-slate-400 uppercase tracking-wider">Outstanding</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-amber-500 uppercase tracking-wider">Expenses</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-blue-500 uppercase tracking-wider">Net Profit</th>
                    <th className="py-2.5 px-3 text-right font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.revenueWithExpenses].reverse().map((row, idx) => {
                    const outstanding = row.invoiced - row.collected;
                    const efficiency = row.invoiced > 0 ? Math.round((row.collected / row.invoiced) * 100) : 0;
                    const isGood = efficiency >= 75;
                    const isMid = efficiency >= 50;
                    return (
                      <tr
                        key={row.month}
                        className={`border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors ${
                          idx === 0 ? "bg-emerald-50/40 dark:bg-emerald-500/5" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {row.month}
                          {idx === 0 && (
                            <span className="ml-1.5 inline-block text-[9px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold rounded px-1 py-0.5 uppercase tracking-wider">
                              Latest
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                          {formatCurrency(row.invoiced)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.collected)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${
                          outstanding > 0
                            ? "text-rose-500 dark:text-rose-400"
                            : "text-slate-400"
                        }`}>
                          {outstanding > 0 ? formatCurrency(outstanding) : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${
                          row.expenses > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400"
                        }`}>
                          {row.expenses > 0 ? formatCurrency(row.expenses) : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${
                          row.netProfit >= 0
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}>
                          {row.collected > 0 || row.expenses > 0 ? formatCurrency(row.netProfit) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {row.invoiced > 0 ? (
                            <span className={`inline-flex items-center gap-0.5 font-bold ${
                              isGood
                                ? "text-emerald-600 dark:text-emerald-400"
                                : isMid
                                ? "text-amber-500 dark:text-amber-400"
                                : "text-rose-500 dark:text-rose-400"
                            }`}>
                              {isGood
                                ? <ArrowUpRight className="h-3 w-3" />
                                : <ArrowDownRight className="h-3 w-3" />}
                              {efficiency}%
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                    <td className="py-3 px-3 font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Total</td>
                    <td className="py-3 px-3 text-right font-black text-slate-700 dark:text-slate-300">
                      {formatCurrency(data.revenueWithExpenses.reduce((s, m) => s + m.invoiced, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(data.revenueWithExpenses.reduce((s, m) => s + m.collected, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-rose-500 dark:text-rose-400">
                      {formatCurrency(
                        data.revenueWithExpenses.reduce((s, m) => s + (m.invoiced - m.collected), 0)
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-amber-600 dark:text-amber-400">
                      {formatCurrency(data.revenueWithExpenses.reduce((s, m) => s + m.expenses, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-blue-600 dark:text-blue-400">
                      {formatCurrency(data.revenueWithExpenses.reduce((s, m) => s + m.netProfit, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-700 dark:text-slate-300">
                      {(() => {
                        const totalInv = data.revenueWithExpenses.reduce((s, m) => s + m.invoiced, 0);
                        const totalCol = data.revenueWithExpenses.reduce((s, m) => s + m.collected, 0);
                        return totalInv > 0 ? `${Math.round((totalCol / totalInv) * 100)}%` : "—";
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: Collection Summary */}
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Collection Summary
          </CardTitle>
          <CardDescription>12-month collected revenue breakdown</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 flex-1">
          {(() => {
            const totalInv = data.revenueTrendData.reduce((s, m) => s + m.invoiced, 0);
            const totalCol = data.revenueTrendData.reduce((s, m) => s + m.collected, 0);
            const totalOut = totalInv - totalCol;
            const rate = totalInv > 0 ? Math.round((totalCol / totalInv) * 100) : 0;
            const sorted = [...data.revenueTrendData].filter(m => m.invoiced > 0);
            const best  = sorted.reduce((a, b) => b.efficiency > a.efficiency ? b : a, sorted[0]);
            const worst = sorted.reduce((a, b) => b.efficiency < a.efficiency ? b : a, sorted[0]);
            const maxCol = Math.max(...data.revenueTrendData.map(m => m.collected), 1);
            const circumference = 2 * Math.PI * 44; // r=44
            const dashOffset = circumference * (1 - rate / 100);
            return (
              <>
                {/* Radial rate ring */}
                <div className="flex flex-col items-center gap-1 py-2">
                  <svg width="120" height="120" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="44" fill="none"
                      stroke={rate >= 75 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 50 50)"
                      style={{ transition: "stroke-dashoffset 0.6s ease" }}
                    />
                    <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="900" fill="currentColor" className="fill-slate-900 dark:fill-white">{rate}%</text>
                    <text x="50" y="61" textAnchor="middle" fontSize="8" fill="#94a3b8">collection rate</text>
                  </svg>
                </div>

                {/* KPI rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Collected</p>
                      <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(totalCol)}</p>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-rose-50 dark:bg-rose-500/10 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold text-rose-500 dark:text-rose-400 uppercase tracking-wider">Total Outstanding</p>
                      <p className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(totalOut)}</p>
                    </div>
                    <ArrowDownRight className="h-5 w-5 text-rose-500" />
                  </div>
                </div>

                {/* Best / Worst month */}
                {best && worst && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/20 p-3">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Best Month</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{best.month}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{best.efficiency}%</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(best.collected)}</p>
                    </div>
                    <div className="rounded-xl border border-rose-100 dark:border-rose-500/20 p-3">
                      <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-1">Worst Month</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{worst.month}</p>
                      <p className="text-xs text-rose-500 dark:text-rose-400 font-semibold">{worst.efficiency}%</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(worst.collected)}</p>
                    </div>
                  </div>
                )}

                {/* Mini sparkbar list — collected per month */}
                <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Collected per Month</p>
                  {[...data.revenueTrendData].reverse().map((m, i) => (
                    <div key={m.month} className="flex items-center gap-2">
                      <span className={`w-14 text-[10px] font-semibold shrink-0 ${ i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400" }`}>
                        {m.month}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${ m.efficiency >= 75 ? "bg-emerald-500" : m.efficiency >= 50 ? "bg-amber-400" : "bg-rose-400" }`}
                          style={{ width: `${Math.round((m.collected / maxCol) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 w-16 text-right shrink-0">
                        {formatCurrency(m.collected)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
      </section>
      )}

      {/* ─── Revenue Trend & Efficiency ───────────────────────────────────── */}
      {activeTab === "revenue" && (
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Revenue Trend (12 Months)
              </CardTitle>
              <CardDescription>Monthly invoiced vs. collected revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.revenueTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="invoicedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={currencyFormatter} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke="#3b82f6" fill="url(#invoicedGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" fill="url(#collectedGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-purple-500" />
                Collection Efficiency (%)
              </CardTitle>
              <CardDescription>Monthly percentage of invoiced amounts collected</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.collectionEfficiencyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={pctFormatter} />
                  <Line
                    type="monotone" dataKey="efficiency" name="Efficiency"
                    stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ─── Customers Tab ─────────────────────────────────────────────────── */}
      {activeTab === "customers" && (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Customer Growth (12 Months)
                </CardTitle>
                <CardDescription>New sign-ups and cumulative subscriber count</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.customerGrowthData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={30} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="newCustomers" name="New Subscribers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalCustomers" name="Total Subscribers" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-500" />
                  Customer Status Breakdown
                </CardTitle>
                <CardDescription>Distribution of account statuses across all customers</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-8">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.customerStatusData.filter((d) => d.value > 0)}
                      cx="50%" cy="50%"
                      outerRadius={85}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {data.customerStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {data.customerStatusData.filter((d) => d.value > 0).map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[item.name] || "#94a3b8" }} />
                        <span className="capitalize text-slate-600 dark:text-slate-400 font-medium">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-black text-slate-900 dark:text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                Plan Subscriber Distribution
              </CardTitle>
              <CardDescription>Number of customers per internet package</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.planDistributionData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip
                    formatter={(value: any, name: any) => [value, name === "customers" ? "Subscribers" : name]}
                  />
                  {data.planDistributionData.map((_, index) => null)}
                  <Bar dataKey="customers" name="Subscribers" radius={[0, 4, 4, 0]}>
                    {data.planDistributionData.map((entry, index) => (
                      <Cell key={`plan-cell-${index}`} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Plan details table */}
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {data.planDistributionData.map((plan, i) => (
                  <div key={plan.name} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{plan.name}</span>
                      <code className="text-slate-400 text-[10px] rounded bg-slate-100 dark:bg-slate-900 px-1">{plan.speed}</code>
                    </div>
                    <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
                      <span><span className="font-bold text-slate-900 dark:text-white">{plan.customers}</span> subs</span>
                      <span>{formatCurrency(plan.revenue)}/mo</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Payments Tab: Payment Method Breakdown ───────────────────────── */}
      {activeTab === "payments" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" />
              Payment Method Breakdown
            </CardTitle>
            <CardDescription>Verified payment counts and totals by channel</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-8">
            <ResponsiveContainer width="55%" height={220}>
              <PieChart>
                <Pie
                  data={data.paymentMethodData.filter((d) => d.count > 0)}
                  cx="50%" cy="50%"
                  outerRadius={80}
                  dataKey="count"
                  paddingAngle={4}
                >
                  {data.paymentMethodData.map((entry, index) => (
                    <Cell key={`method-cell-${index}`} fill={METHOD_COLORS[index % METHOD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any, name: any) => [`${val} payments`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {data.paymentMethodData.map((method, i) => (
                <div key={method.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length] }} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{method.name}</span>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white">{method.count}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 pl-4">{formatCurrency(method.total)} total</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Outstanding Tab ──────────────────────────────────────────────── */}
      {activeTab === "outstanding" && (
        <>
          {data.overdueCustomers.length > 0 && (
            <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                Overdue & Disconnected Accounts
              </CardTitle>
              <CardDescription>Customers with outstanding balances, sorted by amount owed</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.info("Export queued.")}>
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account #</th>
                    <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plan</th>
                    <th className="py-2.5 px-2 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unpaid Months</th>
                    <th className="py-2.5 px-2 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overdueCustomers.map((cust, idx) => (
                    <tr key={cust.id} className={`border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/30 dark:bg-slate-900/10"}`}>
                      <td className="py-2.5 px-2 font-semibold text-slate-900 dark:text-white">{cust.full_name}</td>
                      <td className="py-2.5 px-2 font-mono text-slate-500 dark:text-slate-400">{cust.account_number}</td>
                      <td className="py-2.5 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize
                          ${cust.status === "overdue" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
                            cust.status === "disconnected" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
                            "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"}`}
                        >
                          {STATUS_ICONS[cust.status]} {cust.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 dark:text-slate-400">{cust.plan_name}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`font-bold ${cust.unpaidMonths >= 3 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {cust.unpaidMonths}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-rose-600 dark:text-rose-400">
                        {formatCurrency(cust.totalOwed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Outstanding Customers (All with Unpaid Bills) ─────────────────── */}
      {data.outstandingCustomers && data.outstandingCustomers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Bell className="h-4 w-4" />
                Outstanding Balances &amp; Payment Reminders
                <span className="ml-1 inline-flex items-center justify-center h-5 px-2 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                  {data.outstandingCustomers.length}
                </span>
              </CardTitle>
              <CardDescription>All customers with unpaid bills — send payment reminders per customer</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by customer name or account number..."
                value={outstandingSearch}
                onChange={(e) => setOutstandingSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            {/* Table */}
            {(() => {
              const q = outstandingSearch.trim().toLowerCase();
              const filtered = q
                ? data.outstandingCustomers.filter((c) =>
                    c.full_name.toLowerCase().includes(q) ||
                    c.account_number.includes(q)
                  )
                : data.outstandingCustomers;

              const totalOwedAll = filtered.reduce((s, c) => s + c.totalOwed, 0);

              return (
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account #</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plan</th>
                        <th className="py-2.5 px-3 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unpaid</th>
                        <th className="py-2.5 px-3 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Owed</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                        <th className="py-2.5 px-3 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reminder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">No outstanding customers match your search.</td>
                        </tr>
                      ) : filtered.map((cust, idx) => (
                        <tr key={cust.id} className={`border-b border-slate-50 dark:border-slate-900 hover:bg-amber-50/30 dark:hover:bg-amber-500/5 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40 dark:bg-slate-900/20"}`}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{cust.full_name}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{cust.account_number}</td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize
                              ${cust.status === "overdue" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" :
                                cust.status === "disconnected" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
                                cust.status === "suspended" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" :
                                cust.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
                                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
                            >
                              {STATUS_ICONS[cust.status]} {cust.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{cust.plan_name}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`font-bold ${cust.unpaidMonths >= 3 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {cust.unpaidMonths}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600 dark:text-rose-400">
                            {formatCurrency(cust.totalOwed)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                              {cust.email && <span className="truncate max-w-[120px]">{cust.email}</span>}
                              {cust.contact_number && <span>{cust.contact_number}</span>}
                              {!cust.email && !cust.contact_number && <span className="text-slate-300">—</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              disabled={sendingReminder[cust.id] || (!cust.email && !cust.contact_number)}
                              onClick={() => handleSendReminder(cust.id, cust.full_name)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                                sendingReminder[cust.id]
                                  ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-wait"
                                  : !cust.email && !cust.contact_number
                                  ? "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
                                  : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30 cursor-pointer"
                              }`}
                              title={
                                !cust.email && !cust.contact_number
                                  ? "No email or phone number on file"
                                  : "Send billing reminder via email & SMS"
                              }
                            >
                              {sendingReminder[cust.id] ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</>
                              ) : (
                                <><Send className="h-3 w-3" /> Send</>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-amber-50/60 dark:bg-amber-500/5">
                          <td colSpan={5} className="py-3 px-3 font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">
                            {filtered.length} customer{filtered.length !== 1 ? "s" : ""} with outstanding balances
                          </td>
                          <td className="py-3 px-3 text-right font-black text-rose-600 dark:text-rose-400">
                            {formatCurrency(totalOwedAll)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

          {data.overdueCustomers.length === 0 && (!data.outstandingCustomers || data.outstandingCustomers.length === 0) && (
            <Card>
              <CardContent className="py-16 text-center text-slate-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">All Accounts in Good Standing</p>
                <p className="text-xs text-slate-400 mt-1">There are currently no overdue or outstanding accounts.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Monthly Expenses Management ────────────────────────────────────── */}
      {activeTab === "expenses" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Receipt className="h-4 w-4" />
                Monthly Expenses / Costs
                <span className="ml-1 inline-flex items-center justify-center h-5 px-2 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                  {data.expenses.length}
                </span>
              </CardTitle>
              <CardDescription>Track operational costs (bandwidth, electricity, rent, etc.) — deducted from collections to show net profit</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExpenseForm(true)}
              className="gap-1.5 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/50"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Expenses list */}
            {data.expenses.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No expenses tracked yet. Click "Add Expense" to start tracking costs.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Period</th>
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                      <th className="py-2.5 px-3 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                      <th className="py-2.5 px-3 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((exp, idx) => (
                      <tr
                        key={exp.id}
                        className={`border-b border-slate-50 dark:border-slate-900 hover:bg-amber-50/30 dark:hover:bg-amber-500/5 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40 dark:bg-slate-900/20"}`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{exp.name}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {FULL_MONTH_NAMES[exp.billing_month - 1]} {exp.billing_year}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 hidden md:table-cell truncate max-w-[200px]">
                          {exp.notes || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-amber-600 dark:text-amber-400">
                          {formatCurrency(Number(exp.amount))}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            disabled={deletingExpense === exp.id}
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/15 transition-colors disabled:opacity-50"
                            title="Delete expense"
                          >
                            {deletingExpense === exp.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-amber-50/60 dark:bg-amber-500/5">
                      <td colSpan={4} className="py-3 px-3 font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">
                        {data.expenses.length} expense{data.expenses.length !== 1 ? "s" : ""} total
                      </td>
                      <td className="py-3 px-3 text-right font-black text-amber-700 dark:text-amber-300">
                        {formatCurrency(data.expenses.reduce((s, e) => s + Number(e.amount), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── All Paid Bills ────────────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <>
        <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              All Paid Bills
              <span className="ml-1 inline-flex items-center justify-center h-5 px-2 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                {data.recentPaidBills.length}
              </span>
            </CardTitle>
            <CardDescription>Complete payment history — sorted by date paid (newest first)</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info("Export queued.")}>
            <FileText className="h-4 w-4" /> Export PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by customer name, account number, or billing period..."
              value={billsSearch}
              onChange={(e) => { setBillsSearch(e.target.value); setBillsPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Table */}
          {(() => {
            const q = billsSearch.trim().toLowerCase();
            const filtered = q
              ? data.recentPaidBills.filter((b) =>
                  b.customer.toLowerCase().includes(q) ||
                  b.account_number.includes(q) ||
                  b.month.toLowerCase().includes(q) ||
                  (b.reference_number ?? "").toLowerCase().includes(q)
                )
              : data.recentPaidBills;

            const totalPages = Math.max(1, Math.ceil(filtered.length / BILLS_PER_PAGE));
            const safePage = Math.min(billsPage, totalPages);
            const paginated = filtered.slice((safePage - 1) * BILLS_PER_PAGE, safePage * BILLS_PER_PAGE);
            const grandTotal = filtered.reduce((s, b) => s + Number(b.amount_paid ?? b.amount_due), 0);

            return (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">#</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account #</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Billing Period</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date Paid</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Method</th>
                        <th className="py-2.5 px-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Reference #</th>
                        <th className="py-2.5 px-3 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">No paid bills match your search.</td>
                        </tr>
                      ) : paginated.map((bill, idx) => {
                        const rowNum = (safePage - 1) * BILLS_PER_PAGE + idx + 1;
                        return (
                          <tr key={bill.id} className={`border-b border-slate-50 dark:border-slate-900 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40 dark:bg-slate-900/20"}`}>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">{rowNum}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{bill.customer}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">{bill.account_number}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col text-xs leading-tight">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  {bill.paid_at ? new Date(bill.paid_at).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                                </span>
                                <span className="text-slate-400">
                                  → {bill.due_date ? new Date(bill.due_date).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {bill.paid_at ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  {new Date(bill.paid_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase
                                ${
                                  bill.method === "gcash" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" :
                                  bill.method === "maya" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" :
                                  bill.method === "bank_transfer" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" :
                                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {bill.method === "bank_transfer" ? "Bank" : bill.method || "Cash"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 hidden lg:table-cell">
                              {bill.reference_number ?? "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(Number(bill.amount_paid ?? bill.amount_due))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-emerald-50/60 dark:bg-emerald-500/5">
                          <td colSpan={7} className="py-3 px-3 font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">
                            {q ? `${filtered.length} matching record${filtered.length !== 1 ? "s" : ""}` : `${filtered.length} total record${filtered.length !== 1 ? "s" : ""}`}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(grandTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing {(safePage - 1) * BILLS_PER_PAGE + 1}–{Math.min(safePage * BILLS_PER_PAGE, filtered.length)} of {filtered.length} records
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={safePage === 1}
                        onClick={() => setBillsPage(1)}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        « First
                      </button>
                      <button
                        disabled={safePage === 1}
                        onClick={() => setBillsPage((p) => Math.max(1, p - 1))}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ‹ Prev
                      </button>
                      <span className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center">
                        {safePage} / {totalPages}
                      </span>
                      <button
                        disabled={safePage === totalPages}
                        onClick={() => setBillsPage((p) => Math.min(totalPages, p + 1))}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next ›
                      </button>
                      <button
                        disabled={safePage === totalPages}
                        onClick={() => setBillsPage(totalPages)}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Last »
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* ─── Customer Payment History ──────────────────────────────────────── */}
      {data.customerPaymentHistory.length > 0 && (() => {
        const methodLabels: Record<string, string> = {
          gcash: "GCash", maya: "Maya", bank_transfer: "Bank Transfer", cash: "Cash",
        };
        const methodBadge = (method: string) => (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase
            ${method === "gcash" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" :
              method === "maya" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" :
              method === "bank_transfer" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" :
              "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
            {methodLabels[method] ?? method}
          </span>
        );
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <History className="h-4 w-4" />
                Customer Payment History
                <span className="ml-1 inline-flex items-center justify-center h-5 px-2 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                  {data.customerPaymentHistory.length}
                </span>
              </CardTitle>
              <CardDescription>Click any customer row to expand their full payment history</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.customerPaymentHistory.map((cust) => {
                  const totalPaid = cust.bills.reduce((s, b) => s + Number(b.amount_paid), 0);
                  const isOpen = selectedCustomer === cust.account_number;
                  return (
                    <div key={cust.account_number}>
                      {/* Customer summary row — click to toggle */}
                      <button
                        onClick={() => setSelectedCustomer(isOpen ? null : cust.account_number)}
                        className={`w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors ${
                          isOpen
                            ? "bg-blue-50 dark:bg-blue-500/10"
                            : "hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black ${
                            isOpen ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}>
                            {cust.customer.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{cust.customer}</p>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">{cust.account_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 flex-shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Payments</p>
                            <p className="text-sm font-black text-slate-700 dark:text-slate-200">{cust.bills.length}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Paid</p>
                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
                          </div>
                          <Search className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? "text-blue-500 rotate-90" : "text-slate-300 dark:text-slate-600"}`} />
                        </div>
                      </button>

                      {/* Expanded payment history sub-table */}
                      {isOpen && (
                        <div className="border-t border-blue-100 dark:border-blue-500/20 bg-slate-50/60 dark:bg-slate-900/30 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800">
                                  <th className="py-2 px-5 text-left font-semibold text-slate-400 uppercase tracking-wider">#</th>
                                  <th className="py-2 px-5 text-left font-semibold text-slate-400 uppercase tracking-wider">Billing Period</th>
                                  <th className="py-2 px-5 text-left font-semibold text-slate-400 uppercase tracking-wider">Date Paid</th>
                                  <th className="py-2 px-5 text-left font-semibold text-slate-400 uppercase tracking-wider">Method</th>
                                  <th className="py-2 px-5 text-left font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Reference #</th>
                                  <th className="py-2 px-5 text-right font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cust.bills.map((b, idx) => (
                                  <tr
                                    key={b.id}
                                    className={`border-b border-slate-100 dark:border-slate-800/60 hover:bg-blue-50/40 dark:hover:bg-blue-500/5 transition-colors ${
                                      idx % 2 === 0 ? "" : "bg-white/60 dark:bg-slate-900/20"
                                    }`}
                                  >
                                    <td className="py-2 px-5 text-slate-400 font-mono">{idx + 1}</td>
                                    <td className="py-2 px-5">
                                      <div className="flex flex-col text-xs leading-tight">
                                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                                          {b.paid_at ? new Date(b.paid_at).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                                        </span>
                                        <span className="text-slate-400">
                                          → {b.due_date ? new Date(b.due_date).toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-5">
                                      {b.paid_at ? (
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                          {new Date(b.paid_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                                        </span>
                                      ) : "—"}
                                    </td>
                                    <td className="py-2 px-5">{methodBadge(b.method)}</td>
                                    <td className="py-2 px-5 font-mono text-slate-400 hidden md:table-cell">{b.reference_number ?? "—"}</td>
                                    <td className="py-2 px-5 text-right font-black text-emerald-600 dark:text-emerald-400">
                                      {formatCurrency(Number(b.amount_paid))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-blue-50/60 dark:bg-blue-500/5">
                                  <td colSpan={5} className="py-2.5 px-5 font-black text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                                    {cust.bills.length} payment{cust.bills.length !== 1 ? "s" : ""}
                                  </td>
                                  <td className="py-2.5 px-5 text-right font-black text-emerald-700 dark:text-emerald-300">
                                    {formatCurrency(totalPaid)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}
      </>
      )}

      {/* ─── Add Expense Dialog Modal ────────────────────────────────────────── */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => {
              if (!addingExpense) setShowExpenseForm(false);
            }}
          />
          <Card className="relative z-10 w-full max-w-lg shadow-2xl border-amber-200/50 dark:border-amber-500/20 bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                    Add New Expense
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Record operational costs (bandwidth, rent, utilities, etc.)
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={addingExpense}
                onClick={() => setShowExpenseForm(false)}
                className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <form onSubmit={handleAddExpense}>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Expense Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PLDT Bandwidth, Office Rent, Electricity"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                    >
                      <option value="operational">Operational</option>
                      <option value="bandwidth">Bandwidth</option>
                      <option value="utilities">Utilities</option>
                      <option value="equipment">Equipment</option>
                      <option value="salary">Salary</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Amount (₱) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Billing Month
                    </label>
                    <select
                      value={expenseMonth}
                      onChange={(e) => setExpenseMonth(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                    >
                      {FULL_MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Billing Year
                    </label>
                    <input
                      type="number"
                      required
                      value={expenseYear}
                      onChange={(e) => setExpenseYear(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Reference #, invoice details, description..."
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                  />
                </div>
              </CardContent>

              <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <Button
                  type="button"
                  variant="outline"
                  disabled={addingExpense}
                  onClick={() => setShowExpenseForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addingExpense}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2 shadow-md shadow-amber-600/20"
                >
                  {addingExpense ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Adding Expense...</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Save Expense</>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}


