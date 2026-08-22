import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // Query all customers with plan details and their payment records
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select(`
        *,
        plans (
          id,
          plan_name,
          speed,
          monthly_fee
        ),
        payments (
          id,
          method,
          reference_number,
          amount_paid,
          status,
          submitted_at,
          reviewed_at
        )
      `)
      .order("due_date", { ascending: true });

    if (customersError) throw customersError;

    // Map customers to legacy bill structure to keep full frontend compatibility
    const bills = (customers || []).map((customer) => {
      const year = customer.due_date ? new Date(customer.due_date).getFullYear() : new Date().getFullYear();
      const month = customer.due_date ? new Date(customer.due_date).getMonth() + 1 : new Date().getMonth() + 1;
      const periodStart = customer.due_date 
        ? new Date(new Date(customer.due_date).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : new Date().toISOString();
      const periodEnd = customer.due_date ?? new Date().toISOString();

      return {
        id: customer.id,
        customer_id: customer.id,
        billing_year: year,
        billing_month: month,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        due_date: customer.due_date ? customer.due_date.split("T")[0] : "-",
        amount_due: customer.plans?.monthly_fee ?? 0,
        status: customer.status === "active" ? "paid" : customer.status === "suspended" ? "suspended" : "unpaid",
        paid_at: customer.status === "active" ? customer.due_date : null,
        suspended_at: customer.status === "suspended" ? customer.due_date : null,
        created_at: customer.created_at,
        reminder_sent_at: customer.reminder_sent_at,
        sms_reminder_sent_at: customer.sms_reminder_sent_at,
        customers: {
          full_name: customer.full_name,
          account_number: customer.account_number,
          email: customer.email,
          contact_number: customer.contact_number,
          pppoe_username: customer.pppoe_username,
          status: customer.status,
          plans: customer.plans
        },
        payments: customer.payments || []
      };
    });

    // Calculate Billing Analytics based on active/inactive subscription fees
    const analytics = computeBillingAnalytics(bills);

    return NextResponse.json({
      bills,
      analytics,
    });
  } catch (error: any) {
    console.error("[GET Billing Route Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load billing records." },
      { status: 500 }
    );
  }
}

function computeBillingAnalytics(bills: any[]) {
  const result = {
    totalInvoiced: 0,
    totalCollected: 0,
    outstandingBalance: 0,
    collectionEfficiencyRate: 0,
    averageLatencyDays: 0,
    methods: {
      gcash: 0,
      maya: 0,
      bank_transfer: 0,
      cash: 0,
    },
    monthlyCollectionEfficiency: {} as Record<string, { invoiced: number; collected: number; rate: number }>,
    monthlyRevenueTrend: [] as Array<{ month: string; revenue: number }>,
  };

  if (bills.length === 0) return result;

  let totalLatencyDays = 0;
  let paidBillsCount = 0;

  // Track months names
  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  bills.forEach((bill) => {
    const amount = Number(bill.amount_due || 0);
    result.totalInvoiced += amount;

    const key = `${bill.billing_year}-${String(bill.billing_month).padStart(2, "0")}`;
    const monthName = `${monthNames[bill.billing_month] || "M"}-${bill.billing_year}`;

    if (!result.monthlyCollectionEfficiency[monthName]) {
      result.monthlyCollectionEfficiency[monthName] = { invoiced: 0, collected: 0, rate: 0 };
    }
    result.monthlyCollectionEfficiency[monthName].invoiced += amount;

    if (bill.status === "paid") {
      result.totalCollected += amount;
      result.monthlyCollectionEfficiency[monthName].collected += amount;

      // Capture payment method from the first verified payment
      const payment = (bill.payments || []).find((p: any) => p.status === "verified");
      if (payment) {
        const method = String(payment.method).toLowerCase() as keyof typeof result.methods;
        if (method in result.methods) {
          result.methods[method]++;
        }
      }

      // Latency: Days between billing_period_start and paid_at
      if (bill.paid_at) {
        const start = new Date(bill.billing_period_start).getTime();
        const paid = new Date(bill.paid_at).getTime();
        const diffDays = Math.max(0, Math.round((paid - start) / (1000 * 60 * 60 * 24)));
        totalLatencyDays += diffDays;
        paidBillsCount++;
      }
    } else {
      result.outstandingBalance += amount;
    }
  });

  // Calculate global collection efficiency
  result.collectionEfficiencyRate = result.totalInvoiced > 0 
    ? Math.round((result.totalCollected / result.totalInvoiced) * 100)
    : 0;

  // Calculate average latency
  result.averageLatencyDays = paidBillsCount > 0 
    ? Number((totalLatencyDays / paidBillsCount).toFixed(1))
    : 0;

  // Compute monthly rates
  Object.keys(result.monthlyCollectionEfficiency).forEach((month) => {
    const item = result.monthlyCollectionEfficiency[month];
    item.rate = item.invoiced > 0 ? Math.round((item.collected / item.invoiced) * 100) : 0;
  });

  // Format monthly revenue trend (grouping paid revenue by month)
  const revenueByMonth: Record<string, number> = {};
  bills.forEach((bill) => {
    if (bill.status === "paid") {
      const monthName = monthNames[bill.billing_month] || "Month";
      const yearStr = String(bill.billing_year).substring(2);
      const label = `${monthName} '${yearStr}`;
      
      revenueByMonth[label] = (revenueByMonth[label] || 0) + Number(bill.amount_due);
    }
  });

  // Order months logically (dynamic sorting)
  const sortedMonths = Object.keys(revenueByMonth).sort((a, b) => {
    // Label format: "Jun '26" or "Apr '26"
    const parseLabel = (label: string) => {
      const parts = label.split(" ");
      const mIdx = monthNames.indexOf(parts[0]);
      const yVal = Number("20" + parts[1].replace("'", ""));
      return yVal * 12 + mIdx;
    };
    return parseLabel(a) - parseLabel(b);
  });

  sortedMonths.forEach((label) => {
    result.monthlyRevenueTrend.push({
      month: label,
      revenue: revenueByMonth[label] || 0,
    });
  });

  return result;
}
