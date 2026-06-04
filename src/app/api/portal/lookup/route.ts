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
      .select("*, plans(monthly_fee)")
      .eq("account_number", accountNumber)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { data: bill } = await supabase
      .from("bills")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ customer, currentBill: bill });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to lookup account." },
      { status: 500 },
    );
  }
}
