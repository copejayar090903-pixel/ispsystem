import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendPaymentRejectedToCustomer } from "@/src/lib/email";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { reason, adminId } = (await request.json()) as { reason?: string; adminId?: string };

    const supabase = createSupabaseServerClient();

    // Query payment and customer details before updating
    const paymentResponse = await supabase
      .from("payments")
      .select(`
        amount_paid,
        method,
        reference_number,
        customers (
          full_name,
          account_number,
          email
        )
      `)
      .eq("id", id)
      .single();

    const payment = paymentResponse.data as any;

    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("payments")
      .update({
        status: "rejected",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id);

    if (error) throw error;

    // Send payment rejection email to the customer (non-blocking)
    if (payment.customers?.email) {
      try {
        const cust = payment.customers;
        await sendPaymentRejectedToCustomer({
          customerName: cust.full_name,
          customerEmail: cust.email,
          accountNumber: cust.account_number,
          amountPaid: Number(payment.amount_paid),
          method: payment.method,
          referenceNumber: payment.reference_number,
          rejectionReason: reason,
          rejectedAt: new Date().toISOString(),
        });
      } catch (emailError) {
        console.error("[Reject Payment] Failed to send rejection email:", emailError);
      }
    }

    return NextResponse.json({ ok: true, message: "Payment rejected." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reject payment." },
      { status: 500 },
    );
  }
}

