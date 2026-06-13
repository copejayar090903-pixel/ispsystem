import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { getActivePPPoESessions } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // 1. Fetch active PPPoE sessions from Router (with safe fallback)
    let onlineSessionsCount = 0;
    try {
      const sessions = await getActivePPPoESessions();
      onlineSessionsCount = (sessions || []).length;
    } catch (err) {
      console.warn("MikroTik not reachable for dashboard stats:", err);
    }

    // 2. Query DB tables in parallel
    const [
      customersRes,
      plansRes,
      billsRes,
      paymentsRes,
    ] = await Promise.all([
      supabase.from("customers").select("id, full_name, status, plan_id, created_at, plans(plan_name, speed)").throwOnError(),
      supabase.from("plans").select("id, plan_name, speed").throwOnError(),
      supabase.from("bills").select("id, status, amount_due, billing_year, billing_month").throwOnError(),
      supabase.from("payments").select("id, status, amount_paid, method, submitted_at, customers(full_name)").order("submitted_at", { ascending: false }).throwOnError(),
    ]);

    const customers = customersRes.data || [];
    const plans = plansRes.data || [];
    const bills = billsRes.data || [];
    const payments = paymentsRes.data || [];

    const activeCustomers = customers.filter((c: any) => c.status === "active").length;
    const offlineSessionsCount = Math.max(0, activeCustomers - onlineSessionsCount);

    // 3. Calculate current month's revenue (verified payments in current calendar month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    const verifiedPayments = payments.filter((p: any) => p.status === "verified");
    const currentMonthRevenue = verifiedPayments
      .filter((p: any) => {
        const d = new Date(p.submitted_at);
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth;
      })
      .reduce((sum: number, p: any) => sum + Number(p.amount_paid || 0), 0);

    // 4. Paid vs Unpaid for current month's billing
    const currentMonthBills = bills.filter((b: any) => b.billing_year === currentYear && b.billing_month === currentMonth);
    const paidCount = currentMonthBills.filter((b: any) => b.status === "paid").length;
    const unpaidCount = currentMonthBills.filter((b: any) => b.status === "unpaid").length;
    const overdueCount = currentMonthBills.filter((b: any) => b.status === "overdue").length;

    // 5. Monthly Revenue trend (past 6 months of verified payments)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revenueTrend: Record<string, number> = {};
    const targetTrend: Record<string, number> = {};

    // Get last 6 months labels
    const trendLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = monthNames[d.getMonth()];
      trendLabels.push(label);
      revenueTrend[label] = 0;
      // Define a target: e.g. active customer plan base * rate
      targetTrend[label] = customers.length * 700;
    }

    verifiedPayments.forEach((p: any) => {
      const d = new Date(p.submitted_at);
      const label = monthNames[d.getMonth()];
      if (label in revenueTrend) {
        revenueTrend[label] += Number(p.amount_paid || 0);
      }
    });

    const revenueData = trendLabels.map((month) => ({
      month,
      revenue: revenueTrend[month],
      target: targetTrend[month],
    }));

    // 6. Paid vs Unpaid dataset
    const paidUnpaidData = [
      { name: "Paid", value: paidCount },
      { name: "Unpaid", value: unpaidCount },
      { name: "Overdue", value: overdueCount },
    ];

    // 7. Customer Growth (accumulated count of active + inactive customers by month)
    const growthTrend: Record<string, number> = {};
    trendLabels.forEach((label) => {
      growthTrend[label] = 0;
    });

    customers.forEach((c: any) => {
      const d = new Date(c.created_at);
      const label = monthNames[d.getMonth()];
      if (label in growthTrend) {
        growthTrend[label]++;
      }
    });

    // Accumulate customer counts to show growth
    let cumulative = 0;
    const growthData = trendLabels.map((month) => {
      cumulative += growthTrend[month];
      return {
        month,
        customers: cumulative || customers.length, // Fallback to total customers if no signups in past 6m
      };
    });

    // 8. Plan Distribution dataset
    const planCounts: Record<string, number> = {};
    customers.forEach((c: any) => {
      const planName = c.plans?.plan_name || "Unknown Plan";
      planCounts[planName] = (planCounts[planName] || 0) + 1;
    });

    const planDistributionData = Object.keys(planCounts).map((name) => ({
      name,
      customers: planCounts[name],
    }));

    // If empty, fill with default list
    if (planDistributionData.length === 0) {
      planDistributionData.push({ name: "No Active Subscribers", customers: 0 });
    }

    // 9. Recent Activity logs
    const activityItems: any[] = [];
    
    // Add latest payments
    const latestPayments = payments.slice(0, 3);
    latestPayments.forEach((p: any) => {
      const customerName = p.customers?.full_name || "Unknown Customer";
      const timeAgo = getTimeAgo(p.submitted_at);
      if (p.status === "verified") {
        activityItems.push({
          title: "Payment verified",
          detail: `${customerName} paid ${formatCurrency(p.amount_paid)} via ${p.method.toUpperCase()}`,
          time: timeAgo,
          type: "payment",
          timestamp: new Date(p.submitted_at).getTime(),
        });
      } else if (p.status === "pending") {
        activityItems.push({
          title: "Payment submitted",
          detail: `${customerName} uploaded proof of payment (${formatCurrency(p.amount_paid)})`,
          time: timeAgo,
          type: "payment",
          timestamp: new Date(p.submitted_at).getTime(),
        });
      }
    });

    // Add latest custom registrations
    const latestCustomers = customers.slice(0, 2);
    latestCustomers.forEach((c: any) => {
      activityItems.push({
        title: "New customer",
        detail: `${c.full_name} registered successfully.`,
        time: getTimeAgo(c.created_at),
        type: "customer",
        timestamp: new Date(c.created_at).getTime(),
      });
    });

    // Sort combined activities by timestamp desc
    activityItems.sort((a, b) => b.timestamp - a.timestamp);

    const stats = {
      totalCustomers: customers.length,
      activeCustomers,
      disconnectedCustomers: customers.filter((c: any) => c.status === "disconnected").length,
      overdueAccounts: customers.filter((c: any) => c.status === "overdue").length,
      pendingPayments: payments.filter((p: any) => p.status === "pending").length,
      monthlyRevenue: currentMonthRevenue,
      onlinePppoe: onlineSessionsCount,
      offlinePppoe: offlineSessionsCount,
    };

    return NextResponse.json({
      stats,
      revenueData,
      paidUnpaidData,
      growthData,
      planDistributionData,
      activityItems: activityItems.slice(0, 4),
    });
  } catch (error) {
    console.error("[GET Dashboard Stats Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dashboard stats." },
      { status: 500 },
    );
  }
}

function getTimeAgo(dateStr: string) {
  try {
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    let interval = seconds / 31536000;

    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "just now";
  } catch {
    return "recent";
  }
}

function formatCurrency(val: number) {
  return "₱" + Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
