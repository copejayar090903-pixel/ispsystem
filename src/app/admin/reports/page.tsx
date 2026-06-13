"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, AlertTriangle,
  Wallet, BadgePercent, Calendar, FileSpreadsheet, FileText,
  Download, CreditCard, Activity, CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency } from "@/src/lib/utils";

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
  customerGrowthData: { month: string; newCustomers: number; totalCustomers: number }[];
  recentPaidBills: {
    id: string;
    customer: string;
    account_number: string;
    month: string;
    amount_due: number;
    paid_at: string | null;
    due_date: string | null;
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

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <Button onClick={() => toast.info("Export feature coming soon.")}>
            <Download className="h-4 w-4" /> Export All
          </Button>
        }
      />

      {/* ─── KPI Summary Row ─────────────────────────────────────────────── */}
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

      {/* ─── Revenue Trend & Efficiency ───────────────────────────────────── */}
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

      {/* ─── Customer Growth & Status ─────────────────────────────────────── */}
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

      {/* ─── Plan Distribution & Payment Methods ──────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
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
      </section>

      {/* ─── Overdue Accounts Table ───────────────────────────────────────── */}
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

      {/* ─── Recent Paid Bills ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Recent Paid Bills
            </CardTitle>
            <CardDescription>Latest successfully collected billing statements</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info("Export queued.")}>
            <FileText className="h-4 w-4" /> Export PDF
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account #</th>
                  <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Billing Period</th>
                  <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Due Date</th>
                  <th className="py-2.5 px-2 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Paid At</th>
                  <th className="py-2.5 px-2 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPaidBills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">No paid bills found.</td>
                  </tr>
                ) : data.recentPaidBills.map((bill, idx) => (
                  <tr key={bill.id} className={`border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/30 dark:bg-slate-900/10"}`}>
                    <td className="py-2.5 px-2 font-semibold text-slate-900 dark:text-white">{bill.customer}</td>
                    <td className="py-2.5 px-2 font-mono text-slate-500 dark:text-slate-400">{bill.account_number}</td>
                    <td className="py-2.5 px-2 text-slate-600 dark:text-slate-400">{bill.month}</td>
                    <td className="py-2.5 px-2 text-slate-500 dark:text-slate-400">
                      {bill.due_date ? new Date(bill.due_date).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="py-2.5 px-2">
                      {bill.paid_at ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {new Date(bill.paid_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(bill.amount_due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
