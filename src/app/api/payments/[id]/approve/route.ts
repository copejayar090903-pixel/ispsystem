import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { enablePPPoE } from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { paymentId, adminId } = (await request.json()) as { paymentId?: string; adminId?: string };

    if (!paymentId) {
      return NextResponse.json({ error: "Payment ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const paymentResponse = await supabase
      .from("payments")
      .select("customer_id, billing_id")
      .eq("id", paymentId)
      .single();

    const payment = paymentResponse.data as { customer_id: string; billing_id: string } | null;

    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const customerResponse = await supabase.from("customers").select("pppoe_username").eq("id", payment.customer_id).single();
    const customer = customerResponse.data as { pppoe_username: string } | null;

    const { error: paymentError } = await supabase.from("payments").update({ status: "verified", reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq("id", paymentId);

    if (paymentError) throw paymentError;

    const { error: billError } = await supabase.from("bills").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", payment.billing_id);

    if (billError) throw billError;

    if (customer?.pppoe_username) {
      try {
        await enablePPPoE(customer.pppoe_username);
      } catch (error) {
        console.error("Failed to enable PPPoE after payment approval:", error);
      }
    }

    return NextResponse.json({ ok: true, message: "Payment approved, bill marked paid, and PPPoE enabled." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve payment." },
      { status: 500 },
    );
  }
}
