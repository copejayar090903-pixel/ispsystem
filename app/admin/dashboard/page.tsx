"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Download, Plus } from "lucide-react";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatCard } from "@/src/components/admin/stat-card";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import {
  activityItems,
  dashboardStats,
  growthData,
  paidUnpaidData,
  planDistributionData,
  revenueData,
} from "@/src/lib/dashboard-data";

const chartColors = ["#2563eb", "#10b981", "#f59e0b", "#64748b"];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A real-time command center for billing health, payments, PPPoE sessions, and MikroTik operations."
        actions={
          <>
            <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
            <Button><Plus className="h-4 w-4" /> New Customer</Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.label} {...stat} tone={stat.tone as "blue" | "green" | "amber" | "slate"} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
            <CardDescription>Collections compared with monthly targets.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₱${Number(value) / 1000}k`} />
                <Tooltip formatter={(value) => [`₱${Number(value).toLocaleString("en-PH")}`, ""]} />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fill="url(#revenue)" />
                <Area type="monotone" dataKey="target" stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paid vs Unpaid</CardTitle>
            <CardDescription>Current billing cycle status mix.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paidUnpaidData} dataKey="value" innerRadius={70} outerRadius={105} paddingAngle={4}>
                  {paidUnpaidData.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500 dark:text-slate-400">
              {paidUnpaidData.map((item) => <span key={item.name}>{item.name}: {item.value}</span>)}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Customer Growth</CardTitle>
            <CardDescription>Subscriber count trend.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="customers" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
            <CardDescription>Active subscribers by internet package.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {planDistributionData.map((plan, index) => (
              <div key={plan.name}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{plan.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{plan.customers}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${(plan.customers / 442) * 100}%`, backgroundColor: chartColors[index] }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Payments, sync logs, and account actions.</CardDescription>
              </div>
              <Badge variant="info"><Activity className="mr-1 h-3 w-3" /> Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activityItems.map((item) => (
              <div key={`${item.title}-${item.time}`} className="flex gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-900">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm font-medium text-slate-950 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.detail}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
