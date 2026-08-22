import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { createPaymentLink } from "@/src/lib/paymongo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { accountNumber, billId } = (await request.json()) as {
      accountNumber?: string;
      billId?: string;
    };

    if (!accountNumber || !billId) {
      return NextResponse.json(
        { error: "accountNumber and billId are required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // 1. Resolve customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, full_name, account_number")
      .eq("account_number", accountNumber)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // 2. Resolve bill – must belong to this customer and be unpaid
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select("id, amount_due, billing_month, billing_year, status")
      .eq("id", billId)
      .eq("customer_id", customer.id)
      .single();

    if (billError || !bill) {
      return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    }

    if (bill.status === "paid") {
      return NextResponse.json({ error: "This bill is already paid." }, { status: 400 });
    }

    // 3. Build redirect URLs
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const successUrl = `${appUrl}/customer?payment=success&account=${accountNumber}`;
    const cancelUrl = `${appUrl}/customer?payment=cancelled&account=${accountNumber}`;

    // 4. Month name for description
    const monthNames = [
      "", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const description = `ISP Subscription – ${customer.full_name} (${monthNames[bill.billing_month] ?? bill.billing_month} ${bill.billing_year})`;

    // 5. Create PayMongo Payment Link
    const link = await createPaymentLink({
      amountPHP: bill.amount_due,
      description,
      metadata: {
        bill_id: bill.id,
        customer_id: customer.id,
        account_number: customer.account_number,
      },
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      ok: true,
      checkout_url: link.checkout_url,
      payment_link_id: link.id,
      reference_number: link.reference_number,
    });
  } catch (error) {
    console.error("[PayMongo create-link error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create payment link." },
      { status: 500 }
    );
  }
}
