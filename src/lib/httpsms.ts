// ─── httpSMS Integration ──────────────────────────────────────────────────────
// Sends SMS messages via the httpSMS API (https://docs.httpsms.com/).
// Requires an Android phone with the httpSMS app as the SMS gateway.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BillingReminderSmsPayload {
  customerName: string;
  contactNumber: string;
  accountNumber: string;
  planName: string;
  planSpeed: string;
  amountDue: number;
  dueDate: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

function getHttpSmsConfig() {
  const apiKey = process.env.HTTPSMS_API_KEY;
  const senderPhone = process.env.HTTPSMS_SENDER_PHONE;

  if (!apiKey || apiKey === "your_httpsms_api_key_here") {
    return {
      error: "HTTPSMS_API_KEY is not configured. Set it in your .env file. Get your API key from https://httpsms.com/settings",
    };
  }

  if (!senderPhone || senderPhone === "+639XXXXXXXXX") {
    return {
      error: "HTTPSMS_SENDER_PHONE is not configured. Set it in your .env file. Use your Android phone number in international format (e.g., +639XXXXXXXXX).",
    };
  }

  return { apiKey, senderPhone };
}

// ─── Phone Number Normalization ───────────────────────────────────────────────

/**
 * Converts a Philippine phone number from local format to international format.
 * - "09171234567"  → "+639171234567"
 * - "+639171234567" → "+639171234567" (already international)
 * - "9171234567"   → "+639171234567"
 *
 * Returns null if the number is clearly invalid or empty.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Strip all whitespace, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");

  // Skip clearly non-phone values
  if (cleaned === "-" || cleaned.length < 7) return null;

  // Already in international format with +63
  if (cleaned.startsWith("+63")) {
    return cleaned;
  }

  // Starts with 63 (without +), e.g. "639171234567"
  if (cleaned.startsWith("63") && cleaned.length >= 12) {
    return `+${cleaned}`;
  }

  // Local format starting with 0, e.g. "09171234567"
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return `+63${cleaned.substring(1)}`;
  }

  // Just the subscriber number, e.g. "9171234567"
  if (cleaned.length === 10 && cleaned.startsWith("9")) {
    return `+63${cleaned}`;
  }

  // If it already starts with +, assume it's valid international
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Can't normalize — return null
  console.warn(`[httpSMS] Could not normalize phone number: "${phone}"`);
  return null;
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

// ─── SMS Message Builder ──────────────────────────────────────────────────────

/**
 * Builds a concise billing reminder SMS.
 * Kept under ~320 characters to fit in 2 SMS segments.
 */
export function buildBillingReminderSms(data: BillingReminderSmsPayload): string {
  const {
    customerName,
    accountNumber,
    planSpeed,
    amountDue,
    dueDate,
  } = data;

  const gcashNumber = process.env.PAYMENT_GCASH_NUMBER ?? "09759209976";

  // Format the due date nicely
  let formattedDueDate: string;
  try {
    formattedDueDate = new Date(dueDate).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    formattedDueDate = dueDate;
  }

  // Use first name only to save characters
  const firstName = customerName.split(" ")[0];

  return [
    `[ISP Billing Reminder]`,
    ``,
    `Hi ${firstName},`,
    ``,
    `Your internet bill is due in 3 days.`,
    ``,
    `Acct#: ${accountNumber}`,
    `Plan: ${planSpeed}`,
    `Amount Due: ${formatPHP(amountDue)}`,
    `Due Date: ${formattedDueDate}`,
    ``,
    `Pay via GCash/Maya: ${gcashNumber}`,
    `Reference: ${accountNumber}`,
    ``,
    `Portal: isp-system-beta.vercel.app`,
    ``,
    `Avoid disconnection - pay before the due date!`,
  ].join("\n");
}

// ─── Core SMS Sender ──────────────────────────────────────────────────────────

/**
 * Sends an SMS message via the httpSMS API.
 *
 * @see https://docs.httpsms.com/
 * API endpoint: POST https://api.httpsms.com/v1/messages/send
 */
export async function sendSms(to: string, content: string): Promise<SmsResult> {
  const config = getHttpSmsConfig();
  if ('error' in config) {
    console.error(`[httpSMS] Configuration error:`, config.error);
    return {
      success: false,
      error: config.error,
    };
  }
  const { apiKey, senderPhone } = config;

  try {
    const response = await fetch("https://api.httpsms.com/v1/messages/send", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        from: senderPhone,
        to,
        encrypted: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[httpSMS] API error (${response.status}):`, errorBody);
      return {
        success: false,
        error: `httpSMS API returned ${response.status}: ${errorBody}`,
      };
    }

    const result = await response.json();

    console.log(`[httpSMS] ✅ SMS sent to ${to} (messageId: ${result?.data?.id ?? "N/A"})`);

    return {
      success: true,
      messageId: result?.data?.id,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[httpSMS] ❌ Failed to send SMS to ${to}:`, errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}

// ─── High-Level: Send Billing Reminder SMS ────────────────────────────────────

/**
 * Builds and sends a billing reminder SMS to a customer.
 * Handles phone number normalization automatically.
 *
 * @returns SmsResult with success/failure status
 */
export async function sendBillingReminderSms(
  data: BillingReminderSmsPayload
): Promise<SmsResult> {
  const normalizedPhone = normalizePhoneNumber(data.contactNumber);

  if (!normalizedPhone) {
    return {
      success: false,
      error: `Invalid or missing phone number: "${data.contactNumber}"`,
    };
  }

  const messageBody = buildBillingReminderSms(data);
  return sendSms(normalizedPhone, messageBody);
}
