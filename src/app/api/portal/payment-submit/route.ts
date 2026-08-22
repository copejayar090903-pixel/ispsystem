import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { z } from "zod";
import { sendPaymentSubmittedToOwner } from "@/src/lib/email";

export const runtime = "nodejs";

const paymentSubmitSchema = z.object({
  accountNumber: z.string().min(1, "Account number is required"),
  method: z.enum(["gcash", "maya", "bank_transfer", "cash"], {
    message: "Method must be gcash, maya, bank_transfer, or cash",
  }),
  referenceNumber: z.string().nullable().optional(),
  amountPaid: z.number().positive("Amount paid must be greater than zero"),
  proofUrl: z.string().nullable().optional(),
});

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // Validate request body with Zod
    const validation = paymentSubmitSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { accountNumber, method, referenceNumber, amountPaid, proofUrl } = validation.data;

    const supabase = createSupabaseServerClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, pppoe_username")
      .eq("account_number", accountNumber)
      .single();

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { data: bill } = await supabase
      .from("bills")
      .select("id, billing_period_start, billing_period_end, billing_month, billing_year")
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
    }).select('id').single();

    if (paymentError) throw paymentError;

    // Send email alert to owner (non-blocking)
    try {
      const billingPeriodStr = bill.billing_period_start && bill.billing_period_end
        ? `${bill.billing_period_start} – ${bill.billing_period_end}`
        : bill.billing_month
        ? `${MONTH_NAMES[bill.billing_month]} ${bill.billing_year}`
        : null;

      await sendPaymentSubmittedToOwner({
        paymentId: payment.id,
        customerName: customer.full_name,
        accountNumber,
        pppoeUsername: customer.pppoe_username,
        amountPaid,
        method,
        referenceNumber,
        billingPeriod: billingPeriodStr,
        submittedAt: new Date().toISOString(),
      });
    } catch (emailError) {
      console.error("[portal/payment-submit] Failed to send owner email alert:", emailError);
    }

    return NextResponse.json({ ok: true, payment, message: "Payment submitted for verification." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit payment." },
      { status: 500 },
    );
  }
}

