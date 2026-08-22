import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendPaymentConfirmedToCustomer } from "@/src/lib/email";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const paymentId = id || body.paymentId;
    const adminId = body.adminId;

    if (!paymentId) {
      return NextResponse.json({ error: "Payment ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // Fetch full payment, customer, and billing info for the receipt
    const paymentResponse = await supabase
      .from("payments")
      .select(`
        customer_id,
        billing_id,
        amount_paid,
        method,
        reference_number,
        customers (
          full_name,
          account_number,
          email,
          pppoe_username
        ),
        bills (
          billing_period_start,
          billing_period_end
        )
      `)
      .eq("id", paymentId)
      .single();

    const payment = paymentResponse.data as any;

    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        status: "verified",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", paymentId);

    if (paymentError) throw paymentError;

    if (payment.billing_id) {
      const { error: billError } = await supabase
        .from("bills")
        .update({
          status: "paid",
          paid_at: new Date().toISOString()
        })
        .eq("id", payment.billing_id);

      if (billError) throw billError;
    }

    // Immediately restore customer status & MikroTik profile upon approval
    const { restoreCustomer } = await import("@/src/lib/customer-service");
    await restoreCustomer(payment.customer_id);

    // Send payment confirmation email to the customer (non-blocking)
    if (payment.customers?.email) {
      try {
        const cust = payment.customers;
        const bill = payment.bills;
        await sendPaymentConfirmedToCustomer({
          customerName: cust.full_name,
          customerEmail: cust.email,
          accountNumber: cust.account_number,
          pppoeUsername: cust.pppoe_username,
          amountPaid: Number(payment.amount_paid),
          method: payment.method,
          referenceNumber: payment.reference_number,
          billingPeriod: bill && bill.billing_period_start && bill.billing_period_end
            ? `${bill.billing_period_start} – ${bill.billing_period_end}`
            : null,
          confirmedAt: new Date().toISOString(),
        });
      } catch (emailError) {
        console.error("[Approve Payment] Failed to send payment confirmation email:", emailError);
      }
    }

    // NOTE: MikroTik profile restoration, PPPoE re-enable, customer status → "active",
    // and due_date update are intentionally NOT done here. The /api/cron/paid-restore
    // cron (runs hourly) detects the newly paid bill and handles all of that atomically,
    // preventing duplicate side-effects across the cash-pay, approve, and PayMongo paths.

    return NextResponse.json({ ok: true, message: "Payment approved and bill marked paid. Customer will be restored by the next cron run (within 1 hour)." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve payment." },
      { status: 500 },
    );
  }
}

