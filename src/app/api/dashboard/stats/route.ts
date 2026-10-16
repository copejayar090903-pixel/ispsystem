import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { getActivePPPoESessions } from "@/src/lib/mikrotik";
import { cache } from "@/src/lib/redis";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cacheKey = "dashboard:stats";
    const cachedData = await cache.get<any>(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

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
      supabase.from("customers").select("id, full_name, account_number, pppoe_username, due_date, contact_number, status, plan_id, created_at, plans(plan_name, speed)").throwOnError(),
      supabase.from("plans").select("id, plan_name, speed").throwOnError(),
      supabase.from("bills").select("id, status, amount_due, billing_year, billing_month").throwOnError(),
      supabase.from("payments").select("id, status, amount_paid, method, submitted_at, customers(full_name)").order("submitted_at", { ascending: false }).throwOnError(),
    ]);

    const rawCustomers = customersRes.data || [];
    const customers = rawCustomers.filter((c: any) => c.status !== "deleted" && !c.deleted_at);
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

    // 9. Deadline Customers (due within 3 days)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const deadlineCustomers = customers
      .filter((c: any) => {
        if (!c.due_date || c.status === 'suspended' || c.status === 'disconnected') return false;
        const dueDate = new Date(c.due_date);
        return dueDate >= now && dueDate <= threeDaysFromNow;
      })
      .map((c: any) => {
        const dueDate = new Date(c.due_date);
        const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          full_name: c.full_name,
          account_number: c.account_number || '-',
          pppoe_username: c.pppoe_username || '-',
          due_date: c.due_date,
          contact_number: c.contact_number || null,
          days_left: Math.max(0, daysLeft),
        };
      })
      .sort((a: any, b: any) => a.days_left - b.days_left)
      .slice(0, 20);

    // 10. Dashboard Stats Aggregation
    const totalCustomers = customers.length;
    const disconnectedCustomers = customers.filter(
      (c: any) => c.status === "disconnected" || c.status === "inactive" || c.status === "suspended",
    ).length;
    const overdueAccounts = bills.filter((b: any) => b.status === "overdue").length || customers.filter((c: any) => c.status === "overdue").length;
    const pendingPayments = payments.filter((p: any) => p.status === "pending").length;

    const stats = {
      totalCustomers,
      activeCustomers,
      disconnectedCustomers,
      overdueAccounts,
      pendingPayments,
      monthlyRevenue: currentMonthRevenue,
      onlinePppoe: onlineSessionsCount,
      offlinePppoe: offlineSessionsCount,
    };

    const responseBody = {
      stats,
      revenueData,
      paidUnpaidData,
      growthData,
      planDistributionData,
      deadlineCustomers,
    };

    await cache.set(cacheKey, responseBody, 60);

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("[GET Dashboard Stats Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dashboard stats." },
      { status: 500 },
    );
  }
}

function formatCurrency(val: number) {
  return "₱" + Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
