import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendBillingReminder, type BillingReminderPayload } from "@/src/lib/brevo";
import {
  sendBillingReminderSms,
  type BillingReminderSmsPayload,
} from "@/src/lib/httpsms";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * POST /api/billing/reminders
 *
 * Finds all unpaid bills with a due date exactly 3 days from today
 * and sends billing reminder emails via Brevo + SMS via httpSMS.
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
          contact_number,
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
        email: { sent: 0, skipped: 0, errors: [] },
        sms: { sent: 0, skipped: 0, errors: [] },
      });
    }

    // ── Send reminder for each eligible bill ────────────────────────────────
    let emailSent = 0;
    let emailSkipped = 0;
    const emailErrors: Array<{ billId: string; customerName: string; error: string }> = [];

    let smsSent = 0;
    let smsSkipped = 0;
    const smsErrors: Array<{ billId: string; customerName: string; error: string }> = [];

    for (const bill of bills) {
      const customer = bill.customers as any;

      if (!customer) {
        emailSkipped++;
        smsSkipped++;
        continue;
      }

      const plan = customer.plans as any;
      const customerName = customer.full_name ?? "Valued Customer";

      // ── Email Reminder ──────────────────────────────────────────────────
      if (customer.email) {
        const emailPayload: BillingReminderPayload = {
          customerName,
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
          await sendBillingReminder(emailPayload);
          emailSent++;
          console.log(
            `[Billing Reminder] ✅ Email sent to ${customer.email} (Account: ${customer.account_number})`
          );
        } catch (emailError: any) {
          const errMsg = emailError instanceof Error ? emailError.message : String(emailError);
          emailErrors.push({
            billId: bill.id,
            customerName,
            error: errMsg,
          });
          console.error(
            `[Billing Reminder] ❌ Email failed for ${customer.email}: ${errMsg}`
          );
        }
      } else {
        emailSkipped++;
        console.warn(`[Billing Reminder] ⏭ Skipped email for bill ${bill.id}: no email address.`);
      }

      // ── SMS Reminder via httpSMS ────────────────────────────────────────
      if (customer.contact_number && customer.contact_number !== "-") {
        const smsPayload: BillingReminderSmsPayload = {
          customerName,
          contactNumber: customer.contact_number,
          accountNumber: customer.account_number ?? "N/A",
          planName: plan?.plan_name ?? "Standard Plan",
          planSpeed: plan?.speed ?? "N/A",
          amountDue: Number(bill.amount_due),
          dueDate: bill.due_date ?? targetDateStr,
        };

        try {
          const smsResult = await sendBillingReminderSms(smsPayload);

          if (smsResult.success) {
            smsSent++;
            console.log(
              `[Billing Reminder] ✅ SMS sent to ${customer.contact_number} (Account: ${customer.account_number})`
            );

            await writeLog({
              event_type: "sms_sent",
              description: `SMS billing reminder sent to ${customerName} (${customer.contact_number}) — ${bill.due_date}`,
              pppoe_username: customer.pppoe_username,
              customer_name: customerName,
              metadata: {
                messageId: smsResult.messageId,
                contactNumber: customer.contact_number,
                amountDue: bill.amount_due,
                dueDate: bill.due_date,
              },
            });
          } else {
            smsErrors.push({
              billId: bill.id,
              customerName,
              error: smsResult.error ?? "Unknown SMS error",
            });
            console.error(
              `[Billing Reminder] ❌ SMS failed for ${customer.contact_number}: ${smsResult.error}`
            );

            await writeLog({
              event_type: "sms_failed",
              description: `SMS billing reminder failed for ${customerName} (${customer.contact_number}): ${smsResult.error}`,
              pppoe_username: customer.pppoe_username,
              customer_name: customerName,
              metadata: {
                contactNumber: customer.contact_number,
                error: smsResult.error,
              },
            });
          }
        } catch (smsError: any) {
          const errMsg = smsError instanceof Error ? smsError.message : String(smsError);
          smsErrors.push({
            billId: bill.id,
            customerName,
            error: errMsg,
          });
          console.error(
            `[Billing Reminder] ❌ SMS exception for ${customer.contact_number}: ${errMsg}`
          );
        }
      } else {
        smsSkipped++;
        console.warn(`[Billing Reminder] ⏭ Skipped SMS for bill ${bill.id}: no contact number.`);
      }

      // ── Stamp reminder_sent_at if at least one channel succeeded ────────
      if (emailSent > 0 || smsSent > 0) {
        await supabase
          .from("bills")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", bill.id);
      }
    }

    return NextResponse.json({
      message: `Billing reminders processed for ${targetDateStr}.`,
      targetDate: targetDateStr,
      totalEligible: bills.length,
      email: {
        sent: emailSent,
        skipped: emailSkipped,
        errorCount: emailErrors.length,
        errors: emailErrors,
      },
      sms: {
        sent: smsSent,
        skipped: smsSkipped,
        errorCount: smsErrors.length,
        errors: smsErrors,
      },
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
 * Useful for testing without actually sending emails or SMS.
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
          email,
          contact_number
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
        contactNumber: c?.contact_number ?? null,
        hasEmail: !!c?.email,
        hasPhone: !!c?.contact_number && c?.contact_number !== "-",
        amountDue: b.amount_due,
        dueDate: b.due_date,
        status: b.status,
      };
    });

    return NextResponse.json({
      targetDate: targetDateStr,
      totalFound: preview.length,
      email: {
        wouldSend: preview.filter((p) => p.hasEmail).length,
        wouldSkip: preview.filter((p) => !p.hasEmail).length,
      },
      sms: {
        wouldSend: preview.filter((p) => p.hasPhone).length,
        wouldSkip: preview.filter((p) => !p.hasPhone).length,
      },
      bills: preview,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview reminders." },
      { status: 500 }
    );
  }
}
