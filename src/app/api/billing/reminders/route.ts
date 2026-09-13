import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendBillingReminder, type BillingReminderPayload } from "@/src/lib/brevo";
import { sendBillingReminderSms, type BillingReminderSmsPayload } from "@/src/lib/httpsms";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function POST(req: NextRequest) {
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (cronSecret && cronSecret !== "change_this_to_a_random_secret") {
    const providedSecret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-cron-secret");

    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Parse optional body params (channels override, daysBeforeDue)
  let bodyChannels: string[] | null = null;
  let bodyDaysBeforeDue: number | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body.channels) && body.channels.length > 0) bodyChannels = body.channels;
    if (typeof body.daysBeforeDue === "number" && body.daysBeforeDue >= 1) bodyDaysBeforeDue = body.daysBeforeDue;
  } catch { /* empty body is fine */ }

  // daysBeforeDue: query param > body > default (3)
  const queryDays = parseInt(req.nextUrl.searchParams.get("daysBeforeDue") ?? "", 10);
  const daysBeforeDue = (!isNaN(queryDays) && queryDays >= 1) ? queryDays : (bodyDaysBeforeDue ?? 3);

  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysBeforeDue);

  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay   = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

  try {
    const supabase = createSupabaseServerClient();

    // Query active/overdue customers whose due_date is in exactly 5 days
    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id,
        full_name,
        account_number,
        email,
        contact_number,
        pppoe_username,
        due_date,
        status,
        plans (
          plan_name,
          speed,
          monthly_fee
        )
      `)
      .in("status", ["active", "overdue"])
      .gte("due_date", startOfDay)
      .lte("due_date", endOfDay);

    if (error) throw error;

    const targetDateStr = startOfDay.split("T")[0];

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        message: `No customers due in ${daysBeforeDue} day(s) (${targetDateStr}). No reminders sent.`,
        targetDate: targetDateStr,
        daysBeforeDue,
        email: { sent: 0, skipped: 0, errors: [] },
        sms: { sent: 0, skipped: 0, errors: [] },
      });
    }

    let emailSent = 0;
    let emailSkipped = 0;
    const emailErrors: Array<{ customerId: string; customerName: string; error: string }> = [];

    let smsSent = 0;
    let smsSkipped = 0;
    const smsErrors: Array<{ customerId: string; customerName: string; error: string }> = [];

    // Allowed channels: from body, or both by default
    const allowedChannels = bodyChannels ?? ["email", "sms"];

    for (const customer of customers) {
      const plan = customer.plans as any;
      const customerName = customer.full_name ?? "Valued Customer";
      const dueDateObj = new Date(customer.due_date);
      const amountDue = Number(plan?.monthly_fee ?? 0);

      const periodStart = new Date(dueDateObj.getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-PH");
      const periodEnd = dueDateObj.toLocaleDateString("en-PH");

      let emailSentForThisCustomer = false;
      let smsSentForThisCustomer = false;

      // ── Email Reminder ──────────────────────────────────────────────────
      if (allowedChannels.includes("email") && customer.email) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.round((dueDateObj.getTime() - Date.now()) / msPerDay);

        const emailPayload: BillingReminderPayload = {
          customerName,
          customerEmail: customer.email,
          accountNumber: customer.account_number ?? "N/A",
          planName: plan?.plan_name ?? "Standard Plan",
          planSpeed: plan?.speed ?? "N/A",
          amountDue,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          dueDate: periodEnd,
          billingMonth: MONTH_NAMES[dueDateObj.getMonth() + 1] ?? "N/A",
          billingYear: dueDateObj.getFullYear(),
          daysRemaining,
        };

        try {
          await sendBillingReminder(emailPayload);
          emailSent++;
          emailSentForThisCustomer = true;
          console.log(`[Billing Reminder] ✅ Email sent to ${customer.email}`);
        } catch (emailError: any) {
          const errMsg = emailError instanceof Error ? emailError.message : String(emailError);
          emailErrors.push({
            customerId: customer.id,
            customerName,
            error: errMsg,
          });
          console.error(`[Billing Reminder] ❌ Email failed for ${customer.email}: ${errMsg}`);
        }
      } else {
        emailSkipped++;
      }

      // ── SMS Reminder via httpSMS ────────────────────────────────────────
      if (allowedChannels.includes("sms") && customer.contact_number && customer.contact_number !== "-") {
        const smsPayload: BillingReminderSmsPayload = {
          customerName,
          contactNumber: customer.contact_number,
          accountNumber: customer.account_number ?? "N/A",
          planName: plan?.plan_name ?? "Standard Plan",
          planSpeed: plan?.speed ?? "N/A",
          amountDue,
          dueDate: periodEnd,
        };

        try {
          const smsResult = await sendBillingReminderSms(smsPayload);

          if (smsResult.success) {
            smsSent++;
            smsSentForThisCustomer = true;
            console.log(`[Billing Reminder] ✅ SMS sent to ${customer.contact_number}`);

            await writeLog({
              event_type: "sms_sent",
              description: `SMS billing reminder sent to ${customerName} (${customer.contact_number}) — ${periodEnd}`,
              pppoe_username: customer.pppoe_username,
              customer_name: customerName,
              metadata: {
                messageId: smsResult.messageId,
                contactNumber: customer.contact_number,
                amountDue,
                dueDate: periodEnd,
              },
            });
          } else {
            const smsErrMsg = smsResult.error ?? "Unknown SMS error";
            smsErrors.push({
              customerId: customer.id,
              customerName,
              error: smsErrMsg,
            });
            console.error(`[Billing Reminder] ❌ SMS failed for ${customer.contact_number}: ${smsErrMsg}`);

            await writeLog({
              event_type: "sms_failed",
              description: `SMS billing reminder failed for ${customerName} (${customer.contact_number}): ${smsErrMsg}`,
              pppoe_username: customer.pppoe_username,
              customer_name: customerName,
              metadata: {
                contactNumber: customer.contact_number,
                error: smsErrMsg,
              },
            });
          }
        } catch (smsError: any) {
          const errMsg = smsError instanceof Error ? smsError.message : String(smsError);
          smsErrors.push({
            customerId: customer.id,
            customerName,
            error: errMsg,
          });
          console.error(`[Billing Reminder] ❌ SMS exception for ${customer.contact_number}: ${errMsg}`);
        }
      } else {
        smsSkipped++;
      }

      // ── Stamp reminder timestamps if any sent successfully ────────
      const updates: Record<string, string> = {};
      const sentTime = new Date().toISOString();
      if (emailSentForThisCustomer) updates.reminder_sent_at = sentTime;
      if (smsSentForThisCustomer) updates.sms_reminder_sent_at = sentTime;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("customers")
          .update(updates)
          .eq("id", customer.id);
      }
    }

    return NextResponse.json({
      message: `Billing reminders processed for ${targetDateStr} (${daysBeforeDue} day(s) before due).`,
      targetDate: targetDateStr,
      daysBeforeDue,
      totalEligible: customers.length,
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

  const queryDays = parseInt(req.nextUrl.searchParams.get("daysBeforeDue") ?? "", 10);
  const daysBeforeDue = (!isNaN(queryDays) && queryDays >= 1) ? queryDays : 3;

  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysBeforeDue);

  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

  try {
    const supabase = createSupabaseServerClient();

    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id,
        full_name,
        account_number,
        email,
        contact_number,
        due_date,
        status,
        plans (
          monthly_fee
        )
      `)
      .in("status", ["active", "overdue"])
      .gte("due_date", startOfDay)
      .lte("due_date", endOfDay);

    if (error) throw error;

    const preview = (customers ?? []).map((c) => {
      const plan = c.plans as any;
      return {
        billId: c.id,
        customerName: c.full_name ?? "N/A",
        accountNumber: c.account_number ?? "N/A",
        email: c.email ?? null,
        contactNumber: c.contact_number ?? null,
        hasEmail: !!c.email,
        hasPhone: !!c.contact_number && c.contact_number !== "-",
        amountDue: plan?.monthly_fee ?? 0,
        dueDate: c.due_date ? c.due_date.split("T")[0] : "-",
        status: c.status,
      };
    });

    const targetDateStr = startOfDay.split("T")[0];

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
