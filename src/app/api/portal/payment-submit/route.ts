import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { accountNumber, method, referenceNumber, amountPaid, proofUrl } = (await request.json()) as {
      accountNumber?: string;
      method?: string;
      referenceNumber?: string;
      amountPaid?: number;
      proofUrl?: string;
    };

    if (!accountNumber || !method || !amountPaid) {
      return NextResponse.json({ error: "Account number, method, and amount are required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("account_number", accountNumber)
      .single();

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { data: bill } = await supabase
      .from("bills")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("status", "unpaid")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!bill) {
      return NextResponse.json({ error: "No unpaid bills found." }, { status: 404 });
    }

    const { data: payment, error: paymentError } = await supabase.from("payments").insert({
      customer_id: customer.id,
      billing_id: bill.id,
      method,
      reference_number: referenceNumber,
      amount_paid: amountPaid,
      proof_url: proofUrl,
      status: "pending",
      submitted_at: new Date().toISOString(),
    });

    if (paymentError) throw paymentError;

    return NextResponse.json({ ok: true, payment, message: "Payment submitted for verification." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit payment." },
      { status: 500 },
    );
  }
}
