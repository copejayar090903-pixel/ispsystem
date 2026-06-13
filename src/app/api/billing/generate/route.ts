import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const pad = (n: number) => String(n).padStart(2, "0");
    const maxDay = new Date(year, month, 0).getDate();
    const firstDayStr = `${year}-${pad(month)}-01`;
    const lastDayStr = `${year}-${pad(month)}-${pad(maxDay)}`;

    const { data: customers } = await supabase.from("customers").select("id, plan_id, due_date, installation_date, plans(monthly_fee)").eq("status", "active");

    if (!customers || customers.length === 0) {
      return NextResponse.json({ message: "No active customers found." });
    }

    // Check for existing bills in the target year/month
    const { data: existingBills } = await supabase
      .from("bills")
      .select("customer_id")
      .eq("billing_year", year)
      .eq("billing_month", month);

    const existingCustomerIds = new Set((existingBills || []).map((b) => b.customer_id));

    // Filter out customers that already have bills for this period
    const customersToBill = customers.filter((customer) => !existingCustomerIds.has(customer.id));

    if (customersToBill.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        message: `Bills for all active customers have already been generated for ${month}/${year}.`
      });
    }

    const billsToInsert = customersToBill.map((customer) => {
      const monthlyFee = (customer as unknown as { plans?: { monthly_fee?: number } }).plans?.monthly_fee ?? 0;
      
      // Calculate due date based on the customer's due_date or installation_date
      let dueDay = 10; // Default to 10th
      const dateSource = customer.due_date || customer.installation_date;
      if (dateSource) {
        try {
          const parts = dateSource.split("-");
          if (parts.length === 3) {
            const day = Number(parts[2]);
            if (!isNaN(day)) {
              dueDay = day;
            }
          }
        } catch (e) {
          console.error("Failed to parse customer date:", dateSource, e);
        }
      }

      const cappedDay = Math.min(dueDay, maxDay);
      const dueDateStr = `${year}-${pad(month)}-${pad(cappedDay)}`;

      return {
        customer_id: customer.id,
        billing_year: year,
        billing_month: month,
        billing_period_start: firstDayStr,
        billing_period_end: lastDayStr,
        due_date: dueDateStr,
        amount_due: monthlyFee,
        status: "unpaid" as const,
      };
    });

    const { error } = await supabase.from("bills").insert(billsToInsert).select();

    if (error) throw error;

    return NextResponse.json({ ok: true, count: billsToInsert.length, message: `Generated ${billsToInsert.length} bills for ${month}/${year}.` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate bills." },
      { status: 500 },
    );
  }
}
