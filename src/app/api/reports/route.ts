import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [customersRes, billsRes, paymentsRes, plansRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, full_name, account_number, status, plan_id, created_at, due_date, plans(id, plan_name, speed, monthly_fee)")
        .throwOnError(),
      supabase
        .from("bills")
        .select("id, customer_id, billing_year, billing_month, billing_period_start, billing_period_end, due_date, amount_due, status, paid_at, created_at, customers(full_name, account_number)")
        .order("billing_year", { ascending: false })
        .order("billing_month", { ascending: false })
        .throwOnError(),
      supabase
        .from("payments")
        .select("id, customer_id, billing_id, method, reference_number, amount_paid, status, submitted_at, reviewed_at, customers(full_name, account_number)")
        .order("submitted_at", { ascending: false })
        .throwOnError(),
      supabase
        .from("plans")
        .select("id, plan_name, speed, monthly_fee")
        .throwOnError(),
    ]);

    const customers = customersRes.data || [];
    const bills = billsRes.data || [];
    const payments = paymentsRes.data || [];
    const plans = plansRes.data || [];

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // ─── Customer Status Breakdown ───────────────────────────────────────
    const customerStatusCounts: Record<string, number> = {
      active: 0, inactive: 0, disconnected: 0, overdue: 0, suspended: 0
    };
    customers.forEach((c: any) => {
      const s = c.status || "inactive";
      customerStatusCounts[s] = (customerStatusCounts[s] || 0) + 1;
    });
    const customerStatusData = Object.entries(customerStatusCounts).map(([name, value]) => ({ name, value }));

    // ─── Plan Distribution ────────────────────────────────────────────────
    const planDistribution: Record<string, { customers: number; revenue: number; speed: string }> = {};
    customers.forEach((c: any) => {
      const plan = c.plans as any;
      const planName = plan?.plan_name || "No Plan";
      const speed = plan?.speed || "-";
      const fee = Number(plan?.monthly_fee || 0);
      if (!planDistribution[planName]) {
        planDistribution[planName] = { customers: 0, revenue: 0, speed };
      }
      planDistribution[planName].customers++;
      planDistribution[planName].revenue += fee;
    });
    const planDistributionData = Object.entries(planDistribution).map(([name, d]) => ({
      name,
      customers: d.customers,
      revenue: d.revenue,
      speed: d.speed,
    }));

    // ─── Monthly Revenue Trend (last 12 months) ─────────────────────────
    const revenueByMonth: Record<string, { collected: number; invoiced: number; label: string }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).substring(2)}`;
      revenueByMonth[key] = { collected: 0, invoiced: 0, label };
    }

    bills.forEach((b: any) => {
      const key = `${b.billing_year}-${String(b.billing_month).padStart(2, "0")}`;
      if (revenueByMonth[key]) {
        revenueByMonth[key].invoiced += Number(b.amount_due || 0);
        if (b.status === "paid") {
          revenueByMonth[key].collected += Number(b.amount_due || 0);
        }
      }
    });

    const revenueTrendData = Object.values(revenueByMonth).map((m) => ({
      month: m.label,
      collected: m.collected,
      invoiced: m.invoiced,
      efficiency: m.invoiced > 0 ? Math.round((m.collected / m.invoiced) * 100) : 0,
    }));

    // ─── Payment Method Distribution ─────────────────────────────────────
    const paymentMethodCounts: Record<string, { count: number; total: number }> = {
      gcash: { count: 0, total: 0 },
      maya: { count: 0, total: 0 },
      bank_transfer: { count: 0, total: 0 },
      cash: { count: 0, total: 0 },
    };
    const verifiedPayments = payments.filter((p: any) => p.status === "verified");
    verifiedPayments.forEach((p: any) => {
      const method = (p.method || "cash").toLowerCase() as string;
      if (!paymentMethodCounts[method]) {
        paymentMethodCounts[method] = { count: 0, total: 0 };
      }
      paymentMethodCounts[method].count++;
      paymentMethodCounts[method].total += Number(p.amount_paid || 0);
    });
    const paymentMethodData = Object.entries(paymentMethodCounts).map(([name, d]) => ({
      name: name === "bank_transfer" ? "Bank Transfer" : name.charAt(0).toUpperCase() + name.slice(1),
      count: d.count,
      total: d.total,
    }));

    // ─── Collection Efficiency by Month ─────────────────────────────────
    const collectionEfficiencyData = revenueTrendData.map((m) => ({
      month: m.month,
      efficiency: m.efficiency,
      collected: m.collected,
      invoiced: m.invoiced,
    }));

    // ─── Overdue Analysis ─────────────────────────────────────────────────
    const overdueCustomers = customers
      .filter((c: any) => c.status === "overdue" || c.status === "disconnected" || c.status === "suspended")
      .map((c: any) => {
        const plan = c.plans as any;
        const customerBills = bills.filter((b: any) => b.customer_id === c.id && b.status !== "paid");
        const totalOwed = customerBills.reduce((sum: number, b: any) => sum + Number(b.amount_due || 0), 0);
        return {
          id: c.id,
          full_name: c.full_name,
          account_number: c.account_number,
          status: c.status,
          plan_name: plan?.plan_name || "No Plan",
          totalOwed,
          unpaidMonths: customerBills.length,
        };
      })
      .sort((a: any, b: any) => b.totalOwed - a.totalOwed)
      .slice(0, 20);

    // ─── Customer Growth by Month (last 12 months) ───────────────────────
    const growthByMonth: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      growthByMonth[key] = 0;
    }

    customers.forEach((c: any) => {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (growthByMonth[key] !== undefined) {
        growthByMonth[key]++;
      }
    });

    let cumulative = customers.filter((c: any) => {
      const d = new Date(c.created_at);
      const firstKey = Object.keys(growthByMonth)[0];
      const [fy, fm] = firstKey.split("-").map(Number);
      return d.getFullYear() < fy || (d.getFullYear() === fy && d.getMonth() + 1 < fm);
    }).length;

    const customerGrowthData = Object.entries(growthByMonth).map(([key, newCount]) => {
      const [year, month] = key.split("-").map(Number);
      cumulative += newCount;
      return {
        month: `${monthNames[month - 1]} '${String(year).substring(2)}`,
        newCustomers: newCount,
        totalCustomers: cumulative,
      };
    });

    // ─── Summary KPIs ─────────────────────────────────────────────────────
    const totalInvoiced = bills.reduce((s: number, b: any) => s + Number(b.amount_due || 0), 0);
    const totalCollected = bills.filter((b: any) => b.status === "paid").reduce((s: number, b: any) => s + Number(b.amount_due || 0), 0);
    const outstanding = totalInvoiced - totalCollected;
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentMonthBills = bills.filter((b: any) => b.billing_year === currentYear && b.billing_month === currentMonth);
    const currentMonthPaid = currentMonthBills.filter((b: any) => b.status === "paid").length;
    const currentMonthUnpaid = currentMonthBills.filter((b: any) => b.status !== "paid").length;

    const summary = {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((c: any) => c.status === "active").length,
      overdueCustomers: customers.filter((c: any) => c.status === "overdue" || c.status === "disconnected").length,
      totalInvoiced,
      totalCollected,
      outstanding,
      collectionRate,
      currentMonthPaid,
      currentMonthUnpaid,
      currentMonthRevenue: bills
        .filter((b: any) => b.billing_year === currentYear && b.billing_month === currentMonth && b.status === "paid")
        .reduce((s: number, b: any) => s + Number(b.amount_due || 0), 0),
      currentMonthName: fullMonthNames[now.getMonth()],
      currentYear,
    };

    // ─── All Paid Bills (detailed) — sorted by paid_at newest first ──────
    const recentPaidBills = bills
      .filter((b: any) => b.status === "paid")
      .sort((a: any, b_: any) => {
        const aTime = a.paid_at ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b_.paid_at ? new Date(b_.paid_at).getTime() : new Date(b_.created_at).getTime();
        return bTime - aTime;
      })
      .map((b: any) => {
        const matchingPayment = payments.find(
          (p: any) => p.billing_id === b.id && p.status === "verified"
        );
        return {
          id: b.id,
          customer: (b.customers as any)?.full_name || "Unknown",
          account_number: (b.customers as any)?.account_number || "-",
          month: `${fullMonthNames[(b.billing_month || 1) - 1]} ${b.billing_year}`,
          amount_due: b.amount_due,
          paid_at: b.paid_at,
          due_date: b.due_date,
          method: matchingPayment?.method || "cash",
          amount_paid: matchingPayment?.amount_paid || b.amount_due,
          reference_number: matchingPayment?.reference_number || null,
        };
      });

    // ─── Customer Payment History (all paid bills grouped by customer) ────
    const customerHistoryMap: Record<string, {
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
    }> = {};

    bills
      .filter((b: any) => b.status === "paid")
      .sort((a: any, b_: any) => {
        const aTime = a.paid_at ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b_.paid_at ? new Date(b_.paid_at).getTime() : new Date(b_.created_at).getTime();
        return bTime - aTime;
      })
      .forEach((b: any) => {
        const custId = b.customer_id;
        const matchingPayment = payments.find(
          (p: any) => p.billing_id === b.id && p.status === "verified"
        );
        if (!customerHistoryMap[custId]) {
          customerHistoryMap[custId] = {
            customer: (b.customers as any)?.full_name || "Unknown",
            account_number: (b.customers as any)?.account_number || "-",
            bills: [],
          };
        }
        customerHistoryMap[custId].bills.push({
          id: b.id,
          month: `${fullMonthNames[(b.billing_month || 1) - 1]} ${b.billing_year}`,
          billing_period_start: b.billing_period_start,
          billing_period_end: b.billing_period_end,
          paid_at: b.paid_at,
          due_date: b.due_date,
          amount_due: b.amount_due,
          amount_paid: matchingPayment?.amount_paid || b.amount_due,
          method: matchingPayment?.method || "cash",
          reference_number: matchingPayment?.reference_number || null,
        });
      });

    const customerPaymentHistory = Object.values(customerHistoryMap)
      .sort((a, b_) => a.customer.localeCompare(b_.customer));

    return NextResponse.json({
      summary,
      customerStatusData,
      planDistributionData,
      revenueTrendData,
      paymentMethodData,
      collectionEfficiencyData,
      overdueCustomers,
      customerGrowthData,
      recentPaidBills,
      customerPaymentHistory,
    });
  } catch (error) {
    console.error("[GET Reports Route Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reports." },
      { status: 500 }
    );
  }
}
