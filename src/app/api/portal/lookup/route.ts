import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { accountNumber } = (await request.json()) as { accountNumber?: string };

    if (!accountNumber) {
      return NextResponse.json({ error: "Account number is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*, plans(id, plan_name, speed, monthly_fee)")
      .eq("account_number", accountNumber)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // Fetch verified payments directly
    const { data: payments } = await supabase
      .from("payments")
      .select("id, method, reference_number, amount_paid, status, submitted_at, reviewed_at")
      .eq("customer_id", customer.id)
      .eq("status", "verified")
      .order("submitted_at", { ascending: false })
      .limit(20);

    // Form currentBill dynamically if customer is not active (i.e. unpaid/overdue)
    let currentBill = null;
    if (customer.status !== "active") {
      currentBill = {
        id: "plan-purchase",
        billing_period_start: customer.due_date ? new Date(new Date(customer.due_date).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString(),
        billing_period_end: customer.due_date ?? new Date().toISOString(),
        due_date: customer.due_date ? customer.due_date.split("T")[0] : new Date().toISOString().split("T")[0],
        amount_due: customer.plans?.monthly_fee ?? 0,
        status: "unpaid",
      };
    }

    // Map payments to pseudo-bills for the customer portal's payment history table
    const paymentHistory = (payments ?? []).map((p: any) => {
      const date = new Date(p.submitted_at);
      return {
        id: p.id,
        billing_period_start: new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        billing_period_end: p.submitted_at,
        due_date: p.submitted_at,
        amount_due: p.amount_paid,
        paid_at: p.submitted_at,
        billing_month: date.getMonth() + 1,
        billing_year: date.getFullYear(),
        payments: [p],
      };
    });

    // Check if there is a pending payment submitted for any bill
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("id, status, submitted_at, amount_paid, method")
      .eq("customer_id", customer.id)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })
      .limit(1);

    const pendingPayment = pendingPayments?.[0] ?? null;

    return NextResponse.json({ customer, currentBill, pendingPayment, paymentHistory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to lookup account." },
      { status: 500 },
    );
  }
}
