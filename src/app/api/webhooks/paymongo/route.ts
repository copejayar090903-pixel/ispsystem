import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { verifyWebhookSignature } from "@/src/lib/paymongo";

export const runtime = "nodejs";

// IMPORTANT: disable Next.js body parsing so we can read the raw body for
// HMAC signature verification.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1. Read raw body – MUST be done before any parsing for sig verification.
  const rawBody = await request.text();

  // 2. Get PayMongo signature header.
  const signatureHeader = request.headers.get("paymongo-signature") ?? "";

  // 3. Verify signature.
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
  if (!webhookSecret) {
    console.error("[PayMongo Webhook] PAYMONGO_WEBHOOK_SECRET is not set.");
    return new Response("Server misconfiguration.", { status: 500 });
  }

  const isValid = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    console.warn("[PayMongo Webhook] Invalid signature – rejecting request.");
    return new Response("Invalid signature.", { status: 401 });
  }

  // 4. Parse event.
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const eventType: string = event?.data?.attributes?.type ?? "";
  console.log(`[PayMongo Webhook] Received event: ${eventType}`);

  // 5. Handle payment_link.payment.paid
  if (eventType === "payment_link.payment.paid") {
    try {
      await handlePaymentPaid(event);
    } catch (err) {
      console.error("[PayMongo Webhook] Error processing payment:", err);
      // Return 500 so PayMongo retries delivery.
      return new Response("Processing error.", { status: 500 });
    }
  }

  // Always return 200 for handled (or unhandled) events.
  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------

async function handlePaymentPaid(event: any) {
  // Extract the payment object nested inside the event's data attribute.
  const paymentData = event?.data?.attributes?.data;
  const paymentId: string = paymentData?.id ?? "";
  const attrs = paymentData?.attributes ?? {};

  // Metadata we embedded when creating the Payment Link.
  const meta: Record<string, string> = attrs?.metadata ?? {};
  const customerId: string = meta.customer_id ?? "";
  const isRenewal: boolean = meta.is_renewal === "true";
  const amountPaid: number = (attrs.amount ?? 0) / 100; // centavos → PHP

  if (!customerId) {
    console.error(
      "[PayMongo Webhook] Missing customer_id in metadata. Payment ID:",
      paymentId
    );
    return;
  }

  const supabase = createSupabaseServerClient();

  // Idempotency: check if we've already processed this PayMongo payment ID.
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("reference_number", paymentId)
    .eq("method", "paymongo")
    .maybeSingle();

  if (existingPayment) {
    console.log(`[PayMongo Webhook] Payment ${paymentId} already processed. Skipping.`);
    return;
  }

  // Resolve bill ID — prefer what's in metadata, fallback to latest unpaid bill.
  let billId: string = meta.bill_id ?? "";

  if (!billId) {
    const { data: fallbackBill } = await supabase
      .from("bills")
      .select("id")
      .eq("customer_id", customerId)
      .in("status", ["unpaid", "overdue", "suspended"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackBill) billId = fallbackBill.id;
  }

  if (!billId) {
    console.error(
      `[PayMongo Webhook] No unpaid bill found for customer ${customerId}. Payment ${paymentId} recorded without a bill link.`
    );
  }

  // Insert a verified payment record.
  const insertPayload: Record<string, unknown> = {
    customer_id: customerId,
    method: "paymongo",
    reference_number: paymentId,
    amount_paid: amountPaid,
    proof_url: null,
    status: "verified",
    submitted_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
  };

  if (billId) insertPayload.billing_id = billId;

  const { error: insertError } = await supabase.from("payments").insert(insertPayload);

  if (insertError) {
    throw new Error(`Failed to insert payment: ${insertError.message}`);
  }

  // Mark the bill as paid.
  if (billId) {
    const { error: billError } = await supabase
      .from("bills")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", billId)
      .eq("customer_id", customerId);

    if (billError) {
      throw new Error(`Failed to update bill status: ${billError.message}`);
    }
  }

  const type = isRenewal ? "Renewal" : "Regular payment";
  console.log(
    `[PayMongo Webhook] ✅ ${type} processed – Bill ${billId || "N/A"} marked as paid. ` +
      `Amount: PHP ${amountPaid}, PayMongo ID: ${paymentId}`
  );
}

