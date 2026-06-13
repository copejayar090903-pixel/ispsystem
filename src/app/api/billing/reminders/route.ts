import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendBillingReminder, type BillingReminderPayload } from "@/src/lib/brevo";

export const runtime = "nodejs";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * POST /api/billing/reminders
 *
 * Finds all unpaid bills with a due date exactly 3 days from today
 * and sends billing reminder emails via Brevo.
 *
 * Optionally protected by a secret token:
 *   POST /api/billing/reminders?secret=YOUR_SECRET
 *   or set REMINDER_CRON_SECRET=... in .env (leave empty to disable protection)
 */
export async function POST(req: NextRequest) {
  // ── Optional cron secret protection ─────────────────────────────────────────
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (cronSecret && cronSecret !== "change_this_to_a_random_secret") {
    const providedSecret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-cron-secret");

    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Calculate target due date (today + 3 days) ────────────────────────────
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + 3);

  // Format as YYYY-MM-DD for Supabase comparison
  const targetDateStr = targetDate.toISOString().split("T")[0];

  try {
    const supabase = createSupabaseServerClient();

    // ── Query unpaid bills due in 3 days ────────────────────────────────────
    const { data: bills, error } = await supabase
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
          id,
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
      .in("status", ["unpaid", "overdue"])
      .eq("due_date", targetDateStr);

    if (error) throw error;

    if (!bills || bills.length === 0) {
      return NextResponse.json({
        message: `No unpaid bills due on ${targetDateStr}. No reminders sent.`,
        targetDate: targetDateStr,
        sent: 0,
        skipped: 0,
        errors: [],
      });
    }

    // ── Send reminder for each eligible bill ────────────────────────────────
    let sent = 0;
    let skipped = 0;
    const errors: Array<{ billId: string; customerName: string; error: string }> = [];

    for (const bill of bills) {
      const customer = bill.customers as any;

      // Skip if no customer or no email
      if (!customer || !customer.email) {
        skipped++;
        console.warn(`[Billing Reminder] Skipped bill ${bill.id}: customer has no email.`);
        continue;
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
        dueDate: bill.due_date ?? targetDateStr,
        billingMonth: MONTH_NAMES[bill.billing_month] ?? "N/A",
        billingYear: bill.billing_year,
      };

      try {
        await sendBillingReminder(payload);

        // Stamp reminder_sent_at so the admin table shows it was sent
        await supabase
          .from("bills")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", bill.id);

        sent++;
        console.log(
          `[Billing Reminder] ✅ Sent to ${customer.email} (Account: ${customer.account_number}, Bill: ${bill.id})`
        );
      } catch (emailError: any) {
        const errMsg = emailError instanceof Error ? emailError.message : String(emailError);
        errors.push({
          billId: bill.id,
          customerName: customer.full_name,
          error: errMsg,
        });
        console.error(
          `[Billing Reminder] ❌ Failed to send to ${customer.email}: ${errMsg}`
        );
      }

    }

    return NextResponse.json({
      message: `Billing reminders processed. ${sent} sent, ${skipped} skipped (no email), ${errors.length} failed.`,
      targetDate: targetDateStr,
      totalEligible: bills.length,
      sent,
      skipped,
      errorCount: errors.length,
      errors,
    });
  } catch (error: any) {
    console.error("[Billing Reminders Route Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process billing reminders." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/reminders
 *
 * Preview which bills would get a reminder if sent today.
 * Useful for testing without actually sending emails.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (cronSecret && cronSecret !== "change_this_to_a_random_secret") {
    const providedSecret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-cron-secret");
    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + 3);
  const targetDateStr = targetDate.toISOString().split("T")[0];

  try {
    const supabase = createSupabaseServerClient();

    const { data: bills, error } = await supabase
      .from("bills")
      .select(`
        id,
        billing_year,
        billing_month,
        due_date,
        amount_due,
        status,
        customers (
          full_name,
          account_number,
          email
        )
      `)
      .in("status", ["unpaid", "overdue"])
      .eq("due_date", targetDateStr);

    if (error) throw error;

    const preview = (bills ?? []).map((b) => {
      const c = b.customers as any;
      return {
        billId: b.id,
        customerName: c?.full_name ?? "N/A",
        accountNumber: c?.account_number ?? "N/A",
        email: c?.email ?? null,
        hasEmail: !!c?.email,
        amountDue: b.amount_due,
        dueDate: b.due_date,
        status: b.status,
      };
    });

    return NextResponse.json({
      targetDate: targetDateStr,
      totalFound: preview.length,
      wouldSend: preview.filter((p) => p.hasEmail).length,
      wouldSkip: preview.filter((p) => !p.hasEmail).length,
      bills: preview,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview reminders." },
      { status: 500 }
    );
  }
}
