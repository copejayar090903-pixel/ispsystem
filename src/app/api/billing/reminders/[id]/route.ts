import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendBillingReminder, type BillingReminderPayload } from "@/src/lib/brevo";

export const runtime = "nodejs";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * POST /api/billing/reminders/[id]
 *
 * Sends a billing reminder email for a specific bill by ID.
 * Works for any unpaid/overdue bill regardless of due date.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: billId } = await params;

  if (!billId) {
    return NextResponse.json({ error: "Bill ID is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient();

    // Fetch the specific bill with customer + plan info
    const { data: bill, error } = await supabase
      .from("bills")
      .select(`
        id,
        billing_year,
        billing_month,
        billing_period_start,
        billing_period_end,
        due_date,
        amount_due,
        status,
        customers (
          full_name,
          account_number,
          email,
          pppoe_username,
          plans (
            plan_name,
            speed
          )
        )
      `)
      .eq("id", billId)
      .single();

    if (error || !bill) {
      return NextResponse.json(
        { error: "Bill not found." },
        { status: 404 }
      );
    }

    const customer = bill.customers as any;

    if (!customer?.email) {
      return NextResponse.json(
        { error: "Customer has no email address on file. Please add an email to the customer profile first." },
        { status: 422 }
      );
    }

    const plan = customer.plans as any;

    const payload: BillingReminderPayload = {
      customerName: customer.full_name ?? "Valued Customer",
      customerEmail: customer.email,
      accountNumber: customer.account_number ?? "N/A",
      pppoeUsername: customer.pppoe_username ?? "N/A",
      planName: plan?.plan_name ?? "Standard Plan",
      planSpeed: plan?.speed ?? "N/A",
      amountDue: Number(bill.amount_due),
      billingPeriodStart: bill.billing_period_start ?? "N/A",
      billingPeriodEnd: bill.billing_period_end ?? "N/A",
      dueDate: bill.due_date ?? "N/A",
      billingMonth: MONTH_NAMES[bill.billing_month] ?? "N/A",
      billingYear: bill.billing_year,
    };

    // Send the email
    await sendBillingReminder(payload);

    // Stamp reminder_sent_at timestamp
    const sentAt = new Date().toISOString();
    await supabase
      .from("bills")
      .update({ reminder_sent_at: sentAt })
      .eq("id", billId);

    console.log(
      `[Billing Reminder] ✅ Manual send to ${customer.email} (Account: ${customer.account_number}, Bill: ${billId})`
    );

    return NextResponse.json({
      success: true,
      message: `Reminder email sent to ${customer.email}`,
      sentAt,
      billId,
      customerName: customer.full_name,
      email: customer.email,
    });
  } catch (error: any) {
    console.error(`[Single Reminder Route Error] Bill ${billId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminder email." },
      { status: 500 }
    );
  }
}
