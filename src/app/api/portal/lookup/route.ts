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

    // Fetch ALL bills for this customer, ordered newest first
    const { data: bills } = await supabase
      .from("bills")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const allBills = bills ?? [];

    // Priority: show the most recent paid bill first, then pending, then unpaid
    const paidBill   = allBills.find((b) => b.status === "paid");
    const unpaidBill = allBills.find((b) => b.status === "unpaid" || b.status === "overdue");
    const currentBill = paidBill ?? unpaidBill ?? allBills[0] ?? null;

    // Check if there is a pending payment submitted for any bill
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("id, status, submitted_at, amount_paid, method")
      .eq("customer_id", customer.id)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })
      .limit(1);

    const pendingPayment = pendingPayments?.[0] ?? null;

    return NextResponse.json({ customer, currentBill, pendingPayment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to lookup account." },
      { status: 500 },
    );
  }
}
