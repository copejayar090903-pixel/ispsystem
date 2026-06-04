import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const { data: customers } = await supabase.from("customers").select("id, plan_id, plans(monthly_fee)").eq("status", "active");

    if (!customers || customers.length === 0) {
      return NextResponse.json({ message: "No active customers found." });
    }

    const billsToInsert = customers.map((customer) => {
      const monthlyFee = (customer as unknown as { plans?: { monthly_fee?: number } }).plans?.monthly_fee ?? 0;
      return {
        customer_id: customer.id,
        billing_year: year,
        billing_month: month,
        billing_period_start: firstDay.toISOString().split("T")[0],
        billing_period_end: lastDay.toISOString().split("T")[0],
        due_date: new Date(year, month - 1, 10).toISOString().split("T")[0],
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
