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
 * Sends a billing reminder via Email (Brevo) and/or SMS (httpSMS) for a specific customer by customer ID.
 * Expects JSON body: { channels: ["email", "sms"] } (defaults to both if not specified).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params;

  if (!customerId) {
    return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });
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

    // Fetch the customer with plan info
    const { data: customer, error } = await supabase
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
      .eq("id", customerId)
      .single();

    if (error || !customer) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 }
      );
    }

    const plan = customer.plans as any;
    const customerName = customer.full_name ?? "Valued Customer";
    const amountDue = Number(plan?.monthly_fee ?? 0);

    const dueDateObj = customer.due_date ? new Date(customer.due_date) : new Date();
    const periodStart = customer.due_date 
      ? new Date(dueDateObj.getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-PH") 
      : "N/A";
    const periodEnd = customer.due_date ? dueDateObj.toLocaleDateString("en-PH") : "N/A";
    const billingMonth = customer.due_date ? MONTH_NAMES[dueDateObj.getMonth() + 1] : "N/A";
    const billingYear = customer.due_date ? dueDateObj.getFullYear() : new Date().getFullYear();

    let emailSent = false;
    let smsSent = false;
    let emailError: string | null = null;
    let smsError: string | null = null;
    let smsMessageId: string | undefined = undefined;

    // ── 1. Send Email Reminder ──
    if (channels.includes("email")) {
      if (customer.email) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysRemaining = customer.due_date
          ? Math.max(0, Math.round((dueDateObj.getTime() - Date.now()) / msPerDay))
          : 0;

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
          billingMonth,
          billingYear,
          daysRemaining,
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
      if (customer.contact_number && customer.contact_number !== "-") {
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
                amountDue,
                dueDate: periodEnd,
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
        .from("customers")
        .update(updates)
        .eq("id", customerId);
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
      billId: customerId, // keep matching key name for frontend
      customerName,
      email: customer.email,
      contactNumber: customer.contact_number,
      smsMessageId,
    });
  } catch (error: any) {
    console.error(`[Single Reminder Route Error] Customer ${customerId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminders." },
      { status: 500 }
    );
  }
}
