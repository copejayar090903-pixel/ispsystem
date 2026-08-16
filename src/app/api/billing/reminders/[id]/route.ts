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

/**
 * POST /api/billing/reminders/[id]
 *
 * Sends a billing reminder via Email (Brevo) and/or SMS (httpSMS) for a specific bill by ID.
 * Expects JSON body: { channels: ["email", "sms"] } (defaults to both if not specified).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: billId } = await params;

  if (!billId) {
    return NextResponse.json({ error: "Bill ID is required." }, { status: 400 });
  }

  // Parse request body for channel choices
  let channels: string[] = ["email", "sms"];
  try {
    const body = await req.json();
    if (body.channels && Array.isArray(body.channels)) {
      channels = body.channels;
    }
  } catch {
    // Body is empty or not JSON, fallback to default
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
          contact_number,
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
    const plan = customer?.plans as any;
    const customerName = customer?.full_name ?? "Valued Customer";

    let emailSent = false;
    let smsSent = false;
    let emailError: string | null = null;
    let smsError: string | null = null;
    let smsMessageId: string | undefined = undefined;

    // ── 1. Send Email Reminder ──
    if (channels.includes("email")) {
      if (customer?.email) {
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
          dueDate: bill.due_date ?? "N/A",
          billingMonth: MONTH_NAMES[bill.billing_month] ?? "N/A",
          billingYear: bill.billing_year,
        };

        try {
          await sendBillingReminder(emailPayload);
          emailSent = true;
          console.log(`[Billing Reminder] ✅ Manual email sent to ${customer.email}`);
        } catch (err: any) {
          emailError = err instanceof Error ? err.message : String(err);
          console.error(`[Billing Reminder] ❌ Manual email failed for ${customer.email}:`, emailError);
        }
      } else {
        emailError = "Customer has no email address on file.";
      }
    }

    // ── 2. Send SMS Reminder ──
    if (channels.includes("sms")) {
      if (customer?.contact_number && customer.contact_number !== "-") {
        const smsPayload: BillingReminderSmsPayload = {
          customerName,
          contactNumber: customer.contact_number,
          accountNumber: customer.account_number ?? "N/A",
          planName: plan?.plan_name ?? "Standard Plan",
          planSpeed: plan?.speed ?? "N/A",
          amountDue: Number(bill.amount_due),
          dueDate: bill.due_date ?? "N/A",
        };

        try {
          const smsResult = await sendBillingReminderSms(smsPayload);
          if (smsResult.success) {
            smsSent = true;
            smsMessageId = smsResult.messageId;
            console.log(`[Billing Reminder] ✅ Manual SMS sent to ${customer.contact_number}`);

            await writeLog({
              event_type: "sms_sent",
              description: `Manual SMS billing reminder sent to ${customerName} (${customer.contact_number})`,
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
            smsError = smsResult.error ?? "Unknown SMS error";
            console.error(`[Billing Reminder] ❌ Manual SMS failed for ${customer.contact_number}:`, smsError);

            await writeLog({
              event_type: "sms_failed",
              description: `Manual SMS billing reminder failed for ${customerName} (${customer.contact_number}): ${smsError}`,
              pppoe_username: customer.pppoe_username,
              customer_name: customerName,
              metadata: {
                contactNumber: customer.contact_number,
                error: smsError,
              },
            });
          }
        } catch (err: any) {
          smsError = err instanceof Error ? err.message : String(err);
          console.error(`[Billing Reminder] ❌ Manual SMS exception for ${customer.contact_number}:`, smsError);
        }
      } else {
        smsError = "Customer has no contact number on file.";
      }
    }

    // ── 3. Update Database Timestamps ──
    const updates: Record<string, string> = {};
    const sentAt = new Date().toISOString();

    if (emailSent) updates.reminder_sent_at = sentAt;
    if (smsSent) updates.sms_reminder_sent_at = sentAt;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("bills")
        .update(updates)
        .eq("id", billId);
    }

    // Return response based on what succeeded/failed
    if (!emailSent && !smsSent) {
      const mainError = emailError || smsError || "No notification was sent.";
      return NextResponse.json({ error: mainError, emailError, smsError }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      message: `Reminder sent successfully.`,
      emailSent,
      smsSent,
      emailError,
      smsError,
      sentAt,
      billId,
      customerName,
      email: customer.email,
      contactNumber: customer.contact_number,
      smsMessageId,
    });
  } catch (error: any) {
    console.error(`[Single Reminder Route Error] Bill ${billId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminders." },
      { status: 500 }
    );
  }
}
