import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { createPaymentLink } from "@/src/lib/paymongo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { accountNumber, planId } = (await request.json()) as {
      accountNumber?: string;
      planId?: string;
    };

    if (!accountNumber || !planId) {
      return NextResponse.json(
        { error: "accountNumber and planId are required." },
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

    // 2. Resolve plan
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, plan_name, monthly_fee, speed")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    // 3. Build redirect URLs
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const successUrl = `${appUrl}/customer?payment=success&account=${accountNumber}`;
    const cancelUrl = `${appUrl}/customer?payment=cancelled&account=${accountNumber}`;

    // 4. Create PayMongo Payment Link
    const description = `ISP Renewal – ${customer.full_name} | ${plan.plan_name} (${plan.monthly_fee}/mo)`;

    const link = await createPaymentLink({
      amountPHP: plan.monthly_fee,
      description,
      metadata: {
        customer_id: customer.id,
        account_number: customer.account_number,
        plan_id: plan.id,
        plan_name: plan.plan_name,
        is_renewal: "true",
      },
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      ok: true,
      checkout_url: link.checkout_url,
      payment_link_id: link.id,
    });
  } catch (error) {
    console.error("[PayMongo create-renewal-link error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create renewal payment link." },
      { status: 500 }
    );
  }
}
