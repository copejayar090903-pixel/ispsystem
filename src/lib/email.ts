import { Resend } from "resend";
import { generateEmailActionToken } from "@/src/lib/email-token";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillingReminderPayload {
  customerName: string;
  customerEmail: string;
  accountNumber: string;
  pppoeUsername: string;
  planName: string;
  planSpeed: string;
  amountDue: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  billingMonth: string;
  billingYear: number;
}

// ─── Resend API Client ────────────────────────────────────────────────────────

function createResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "RESEND_API_KEY is not configured. Set it in your .env file."
    );
  }

  return new Resend(apiKey);
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

// ─── HTML Email Template ──────────────────────────────────────────────────────

function buildReminderEmailHtml(data: BillingReminderPayload): string {
  const {
    customerName,
    accountNumber,
    pppoeUsername,
    planName,
    planSpeed,
    amountDue,
    billingPeriodStart,
    billingPeriodEnd,
    dueDate,
    billingMonth,
    billingYear,
  } = data;

  const gcashNumber  = process.env.PAYMENT_GCASH_NUMBER         ?? "09759209976";
  const gcashName    = process.env.PAYMENT_GCASH_NAME           ?? "Jay-ar Cope";
  const mayaNumber   = process.env.PAYMENT_MAYA_NUMBER          ?? "09759209976";
  const mayaName     = process.env.PAYMENT_MAYA_NAME            ?? "Jay-ar Cope";
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL        ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE        ?? "N/A";
  const senderName   = process.env.RESEND_SENDER_NAME           ?? "ISP Billing System";

  const formattedDueDate = new Date(dueDate).toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const year = new Date().getFullYear();

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Billing Reminder</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#1e293b}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 32px;text-align:center}
  .hdr h1{color:#fff;font-size:22px;font-weight:700;margin-top:14px}
  .hdr p{color:rgba(255,255,255,.7);font-size:13px;margin-top:5px}
  .alert{background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 24px;font-size:13px;font-weight:600;color:#92400e}
  .body{padding:32px}
  .greeting{font-size:15px;color:#334155;margin-bottom:20px;line-height:1.7}
  .sec-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .bill-card{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px}
  .bill-hdr{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:20px 24px}
  .bill-amount{font-size:36px;font-weight:800;color:#fff;letter-spacing:-1px}
  .bill-amount-lbl{font-size:12px;color:rgba(255,255,255,.65);margin-top:2px}
  .bill-rows{padding:4px 20px 8px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b}
  .val{font-weight:600;color:#1e293b}
  .val-due{color:#dc2626;font-weight:700}
  .deadline{background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:18px 24px;margin-bottom:24px;text-align:center}
  .deadline-lbl{font-size:12px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
  .deadline-val{font-size:20px;font-weight:800;color:#dc2626;margin-top:6px}
  .pay-card{border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:10px}
  .pay-hdr{padding:11px 16px;font-weight:700;font-size:13px}
  .gcash{background:#eff6ff;color:#1d4ed8;border-bottom:1px solid #bfdbfe}
  .maya{background:#f0fdf4;color:#15803d;border-bottom:1px solid #bbf7d0}
  .pay-body{padding:12px 16px;background:#fff}
  .pi{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
  .pi-lbl{color:#64748b}
  .pi-val{font-weight:700;color:#1e293b;font-family:'Courier New',monospace}
  .ref{background:#f1f5f9;border-radius:8px;padding:10px 14px;margin-top:8px;font-size:12px;color:#475569;line-height:1.5}
  .ref strong{color:#1e293b}
  .divider{height:1px;background:#e2e8f0;margin:24px 0}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center}
  .footer p{font-size:12px;color:#94a3b8;line-height:1.9}
  .footer a{color:#2563eb;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
      <rect width="52" height="52" rx="14" fill="rgba(255,255,255,.15)"/>
      <path d="M16 26h6M30 26h6M26 16v6M26 30v6" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="26" cy="26" r="8" stroke="white" stroke-width="2.5" fill="none"/>
    </svg>
    <h1>${senderName}</h1>
    <p>Monthly Billing Reminder</p>
  </div>

  <div class="alert">
    &#9888;&#65039; Your bill is due in <strong>3 days</strong> &mdash; ${formattedDueDate}
  </div>

  <div class="body">
    <p class="greeting">
      Hello <strong>${customerName}</strong>,<br/><br/>
      This is a friendly reminder that your internet subscription bill for
      <strong>${billingMonth} ${billingYear}</strong> is due in <strong>3 days</strong>.
      Please settle your balance before the deadline to avoid any service interruption.
    </p>

    <p class="sec-title">&#128203; Bill Summary</p>
    <div class="bill-card">
      <div class="bill-hdr">
        <div class="bill-amount">${formatPHP(amountDue)}</div>
        <div class="bill-amount-lbl">Total Amount Due</div>
      </div>
      <div class="bill-rows">
        <div class="row"><span class="lbl">Account Number</span><span class="val">${accountNumber}</span></div>
        <div class="row"><span class="lbl">PPPoE Username</span><span class="val">${pppoeUsername}</span></div>
        <div class="row"><span class="lbl">Internet Plan</span><span class="val">${planName} &mdash; ${planSpeed}</span></div>
        <div class="row"><span class="lbl">Billing Period</span><span class="val">${billingPeriodStart} &ndash; ${billingPeriodEnd}</span></div>
        <div class="row"><span class="lbl">Due Date</span><span class="val val-due">&#128197; ${dueDate}</span></div>
      </div>
    </div>

    <div class="deadline">
      <div class="deadline-lbl">&#9200; Payment Deadline</div>
      <div class="deadline-val">${formattedDueDate}</div>
    </div>

    <p class="sec-title">&#128179; How to Pay</p>
    <p style="font-size:13px;color:#475569;margin-bottom:14px;line-height:1.6">
      Use your <strong>Account Number (${accountNumber})</strong> as reference when making payment via any channel below:
    </p>

    <div class="pay-card">
      <div class="pay-hdr gcash">&#128247; GCash</div>
      <div class="pay-body">
        <div class="pi"><span class="pi-lbl">GCash Number</span><span class="pi-val">${gcashNumber}</span></div>
        <div class="pi"><span class="pi-lbl">Account Name</span><span class="pi-val">${gcashName}</span></div>
        <div class="ref">&#128205; In the <strong>Remarks / Note</strong> field, enter: <strong>${accountNumber}</strong></div>
      </div>
    </div>

    <div class="pay-card">
      <div class="pay-hdr maya">&#128176; Maya (PayMaya)</div>
      <div class="pay-body">
        <div class="pi"><span class="pi-lbl">Maya Number</span><span class="pi-val">${mayaNumber}</span></div>
        <div class="pi"><span class="pi-lbl">Account Name</span><span class="pi-val">${mayaName}</span></div>
        <div class="ref">&#128205; In the <strong>Remarks / Note</strong> field, enter: <strong>${accountNumber}</strong></div>
      </div>
    </div>

    <div class="divider"></div>

    <p class="sec-title">&#127760; Pay Online via Our Portal</p>
    <div class="pay-card" style="border-color:#bfdbfe">
      <div class="pay-hdr" style="background:#eff6ff;color:#1d4ed8;border-bottom:1px solid #bfdbfe">&#128187; Online Payment Portal &mdash; Fastest &amp; Easiest</div>
      <div class="pay-body">
        <p style="font-size:13px;color:#334155;margin-bottom:12px;line-height:1.7">You can submit your payment verification directly through our online portal. Here&rsquo;s how:</p>
        <ol style="font-size:13px;color:#475569;line-height:2;padding-left:18px;margin:0">
          <li>Visit <a href="https://isp-system-beta.vercel.app" style="color:#2563eb;font-weight:700;text-decoration:none">isp-system-beta.vercel.app</a></li>
          <li>Enter your <strong>Account Number: ${accountNumber}</strong> in the search box</li>
          <li>Click <strong>Search</strong> to load your billing statement</li>
          <li>Select your <strong>Payment Method</strong> (GCash, Maya, Bank Transfer, or Cash)</li>
          <li>Enter your <strong>Reference Number</strong> and <strong>Amount Paid</strong></li>
          <li>Click <strong>Submit Payment Verification</strong></li>
        </ol>
        <div class="ref" style="margin-top:12px">&#9989; Your connection will be re-enabled automatically once your payment is verified by our team.</div>
      </div>
    </div>

    <div class="divider"></div>

    <p style="font-size:13px;color:#475569;line-height:1.8">
      You can also submit your payment through our online portal at
      <a href="https://isp-system-beta.vercel.app" style="color:#2563eb;font-weight:700">isp-system-beta.vercel.app</a>
      or contact support for assistance.
    </p>
  </div>

  <div class="footer">
    <p>
      Questions? Email us at <a href="mailto:${supportEmail}">${supportEmail}</a> &nbsp;|&nbsp; Call <strong>${supportPhone}</strong><br/>
      <br/>
      <em>This is an automated billing reminder. Please do not reply to this email.</em><br/>
      <br/>
      &copy; ${year} ${senderName}. All rights reserved.
    </p>
  </div>
</div>
</body>
</html>`;
}

// ─── Plain Text Fallback ──────────────────────────────────────────────────────

function buildReminderEmailText(data: BillingReminderPayload): string {
  const {
    customerName, accountNumber, pppoeUsername, planName, planSpeed,
    amountDue, billingPeriodStart, billingPeriodEnd, dueDate, billingMonth, billingYear,
  } = data;

  const gcashNumber  = process.env.PAYMENT_GCASH_NUMBER        ?? "09759209976";
  const gcashName    = process.env.PAYMENT_GCASH_NAME          ?? "Jay-ar Cope";
  const mayaNumber   = process.env.PAYMENT_MAYA_NUMBER         ?? "09759209976";
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL       ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE       ?? "N/A";

  return `BILLING REMINDER — ${billingMonth} ${billingYear}
Bill due in 3 days: ${dueDate}

Hello ${customerName},

Your internet bill is due in 3 days. Please pay before the due date to avoid service interruption.

BILL DETAILS
═══════════════════════════════════
Account Number : ${accountNumber}
PPPoE Username : ${pppoeUsername}
Plan           : ${planName} (${planSpeed})
Billing Period : ${billingPeriodStart} – ${billingPeriodEnd}
Amount Due     : ${formatPHP(amountDue)}
Due Date       : ${dueDate}

HOW TO PAY  (use Account No. ${accountNumber} as reference)
═══════════════════════════════════
1. GCASH
   Number       : ${gcashNumber}
   Account Name : ${gcashName}
   Reference    : Enter ${accountNumber} in Remarks / Note

2. MAYA (PayMaya)
   Number       : ${mayaNumber}
   Reference    : Enter ${accountNumber} in Remarks / Note

3. ONLINE PORTAL (Easiest & Fastest)
   Visit        : https://isp-system-beta.vercel.app
   Steps:
     1. Go to https://isp-system-beta.vercel.app
     2. Enter your Account Number: ${accountNumber}
     3. Click "Search" to load your billing statement
     4. Select your Payment Method
     5. Enter your Reference Number and Amount Paid
     6. Click "Submit Payment Verification"
   Your connection will be re-enabled automatically once verified.

SUPPORT
═══════════════════════════════════
Email : ${supportEmail}
Phone : ${supportPhone}

This is an automated billing reminder. Please do not reply to this email.`;
}

// ─── Send Billing Reminder via Resend API ─────────────────────────────────────

export async function sendBillingReminder(data: BillingReminderPayload): Promise<void> {
  const client = createResendClient();

  const senderEmail = process.env.RESEND_SENDER_EMAIL ?? "onboarding@resend.dev";
  const senderName  = process.env.RESEND_SENDER_NAME  ?? "ISP Billing System";

  const { error } = await client.emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: [data.customerEmail],
    subject: `⚠️ Billing Reminder: ${formatPHP(data.amountDue)} due on ${data.dueDate} — Acct #${data.accountNumber}`,
    html: buildReminderEmailHtml(data),
    text: buildReminderEmailText(data),
    headers: {
      "X-Mailer": "ISP-Billing-System/1.0",
    },
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

// ─── Payment Submitted → Owner Alert ─────────────────────────────────────────

export interface PaymentSubmittedPayload {
  paymentId: string;
  customerName: string;
  accountNumber: string;
  pppoeUsername: string;
  amountPaid: number;
  method: string;
  referenceNumber?: string | null;
  billingPeriod?: string | null;
  submittedAt: string;
  adminUrl?: string;
}

function buildPaymentSubmittedHtml(d: PaymentSubmittedPayload, approveUrl: string, rejectUrl: string): string {
  const senderName = process.env.RESEND_SENDER_NAME ?? "ISP Billing System";
  const year       = new Date().getFullYear();

  const submitted = new Date(d.submittedAt).toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const methodLabel: Record<string, string> = {
    gcash: "GCash",
    maya: "Maya (PayMaya)",
    bank_transfer: "Bank Transfer",
    cash: "Cash",
  };

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>New Payment Submitted</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#1e293b}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 32px;text-align:center}
  .hdr h1{color:#fff;font-size:22px;font-weight:700;margin-top:14px}
  .hdr p{color:rgba(255,255,255,.7);font-size:13px;margin-top:5px}
  .badge{display:inline-block;background:rgba(255,255,255,.18);color:#fff;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;margin-top:10px;letter-spacing:.5px}
  .body{padding:32px}
  .sec-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .card{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:4px 20px 8px;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b}
  .val{font-weight:600;color:#1e293b}
  .amount{font-size:32px;font-weight:800;color:#16a34a;text-align:center;padding:20px 0 8px}
  .amount-lbl{font-size:12px;color:#64748b;text-align:center;margin-bottom:16px}
  .actions{display:flex;gap:12px;margin:0 auto 24px;justify-content:center}
  .btn-approve{display:inline-block;background:linear-gradient(135deg,#14532d,#16a34a);color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;text-align:center}
  .btn-reject{display:inline-block;background:linear-gradient(135deg,#7f1d1d,#dc2626);color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;text-align:center}
  .btn{display:block;width:fit-content;margin:0 auto 24px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;text-align:center}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center}
  .footer p{font-size:12px;color:#94a3b8;line-height:1.9}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
      <rect width="52" height="52" rx="14" fill="rgba(255,255,255,.15)"/>
      <path d="M16 26h20M26 16l10 10-10 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h1>${senderName}</h1>
    <p>New Payment Submitted</p>
    <span class="badge">&#128179; Action Required</span>
  </div>

  <div class="body">
    <div class="amount">${formatPHP(d.amountPaid)}</div>
    <div class="amount-lbl">Amount Submitted</div>

    <p class="sec-title">&#128203; Payment Details</p>
    <div class="card">
      <div class="row"><span class="lbl">Customer</span><span class="val">${d.customerName}</span></div>
      <div class="row"><span class="lbl">Account Number</span><span class="val">${d.accountNumber}</span></div>
      <div class="row"><span class="lbl">PPPoE Username</span><span class="val">${d.pppoeUsername}</span></div>
      <div class="row"><span class="lbl">Payment Method</span><span class="val">${methodLabel[d.method] ?? d.method}</span></div>
      ${d.referenceNumber ? `<div class="row"><span class="lbl">Reference #</span><span class="val">${d.referenceNumber}</span></div>` : ""}
      ${d.billingPeriod   ? `<div class="row"><span class="lbl">Billing Period</span><span class="val">${d.billingPeriod}</span></div>` : ""}
      <div class="row"><span class="lbl">Submitted At</span><span class="val">${submitted}</span></div>
    </div>

    <div class="actions">
      <a class="btn-approve" href="${approveUrl}">&#9989; Approve Payment</a>
      <a class="btn-reject" href="${rejectUrl}">&#10060; Reject Payment</a>
    </div>

    <p style="font-size:13px;color:#64748b;text-align:center;line-height:1.7">
      Click a button above to approve or reject this payment directly.
    </p>
  </div>

  <div class="footer">
    <p><em>This is an automated alert from ${senderName}.</em><br/>&copy; ${year} ${senderName}. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}

function buildPaymentSubmittedText(d: PaymentSubmittedPayload): string {
  const adminUrl = d.adminUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const submitted = new Date(d.submittedAt).toLocaleString("en-PH");
  return `NEW PAYMENT SUBMITTED — Action Required

Customer      : ${d.customerName}
Account #     : ${d.accountNumber}
PPPoE User    : ${d.pppoeUsername}
Amount        : ${formatPHP(d.amountPaid)}
Method        : ${d.method}
Reference #   : ${d.referenceNumber ?? "N/A"}
Billing Period: ${d.billingPeriod ?? "N/A"}
Submitted At  : ${submitted}

Review this payment at: ${adminUrl}/admin/billing

This is an automated alert. Do not reply to this email.`;
}

/**
 * Notify the owner/admin that a customer has submitted a payment.
 * Destination: OWNER_EMAIL env var. Non-fatal if unconfigured.
 */
export async function sendPaymentSubmittedToOwner(data: PaymentSubmittedPayload): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[Email] OWNER_EMAIL is not set — skipping owner payment alert.");
    return;
  }

  const client      = createResendClient();
  const senderEmail = process.env.RESEND_SENDER_EMAIL ?? "onboarding@resend.dev";
  const senderName  = process.env.RESEND_SENDER_NAME  ?? "ISP Billing System";
  const appUrl      = data.adminUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Generate signed URLs for one-click approve/reject
  const token = generateEmailActionToken(data.paymentId);
  const approveUrl = `${appUrl}/api/payments/email-action?id=${data.paymentId}&action=approve&token=${token}`;
  const rejectUrl  = `${appUrl}/api/payments/email-action?id=${data.paymentId}&action=reject&token=${token}`;

  const { error } = await client.emails.send({
    from:    `${senderName} <${senderEmail}>`,
    to:      [ownerEmail],
    subject: `💳 New Payment Submitted — Acct #${data.accountNumber} (${formatPHP(data.amountPaid)})`,
    html:    buildPaymentSubmittedHtml(data, approveUrl, rejectUrl),
    text:    buildPaymentSubmittedText(data),
    headers: { "X-Mailer": "ISP-Billing-System/1.0" },
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

// ─── Payment Confirmed → Customer Receipt ─────────────────────────────────────

export interface PaymentConfirmedPayload {
  customerName: string;
  customerEmail: string;
  accountNumber: string;
  pppoeUsername: string;
  amountPaid: number;
  method: string;
  referenceNumber?: string | null;
  billingPeriod?: string | null;
  confirmedAt: string;
}

function buildPaymentConfirmedHtml(d: PaymentConfirmedPayload): string {
  const senderName  = process.env.RESEND_SENDER_NAME  ?? "ISP Billing System";
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE ?? "N/A";
  const year        = new Date().getFullYear();

  const confirmedAt = new Date(d.confirmedAt).toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const methodLabel: Record<string, string> = {
    gcash: "GCash",
    maya: "Maya (PayMaya)",
    bank_transfer: "Bank Transfer",
    cash: "Cash",
  };

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Payment Confirmed</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#1e293b}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:linear-gradient(135deg,#14532d 0%,#16a34a 100%);padding:40px 32px;text-align:center}
  .hdr h1{color:#fff;font-size:22px;font-weight:700;margin-top:14px}
  .hdr p{color:rgba(255,255,255,.75);font-size:13px;margin-top:5px}
  .body{padding:32px}
  .greeting{font-size:15px;color:#334155;margin-bottom:20px;line-height:1.7}
  .status-box{background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center}
  .status-icon{font-size:40px;margin-bottom:8px}
  .status-title{font-size:18px;font-weight:800;color:#15803d}
  .status-sub{font-size:13px;color:#166534;margin-top:4px}
  .sec-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .card{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:4px 20px 8px;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b}
  .val{font-weight:600;color:#1e293b}
  .val-green{font-weight:700;color:#16a34a;font-size:15px}
  .divider{height:1px;background:#e2e8f0;margin:24px 0}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center}
  .footer p{font-size:12px;color:#94a3b8;line-height:1.9}
  .footer a{color:#2563eb;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
      <rect width="52" height="52" rx="14" fill="rgba(255,255,255,.15)"/>
      <path d="M16 26l8 8 12-14" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h1>${senderName}</h1>
    <p>Payment Confirmation</p>
  </div>

  <div class="body">
    <p class="greeting">Hello <strong>${d.customerName}</strong>,<br/><br/>
      Great news! Your payment has been <strong>verified and confirmed</strong> by our team.
      Your internet connection is now active. Thank you for paying on time!
    </p>

    <div class="status-box">
      <div class="status-icon">&#9989;</div>
      <div class="status-title">Payment Verified</div>
      <div class="status-sub">Your account is active &amp; connection is restored</div>
    </div>

    <p class="sec-title">&#128203; Payment Receipt</p>
    <div class="card">
      <div class="row"><span class="lbl">Amount Paid</span><span class="val val-green">${formatPHP(d.amountPaid)}</span></div>
      <div class="row"><span class="lbl">Account Number</span><span class="val">${d.accountNumber}</span></div>
      <div class="row"><span class="lbl">PPPoE Username</span><span class="val">${d.pppoeUsername}</span></div>
      <div class="row"><span class="lbl">Payment Method</span><span class="val">${methodLabel[d.method] ?? d.method}</span></div>
      ${d.referenceNumber ? `<div class="row"><span class="lbl">Reference #</span><span class="val">${d.referenceNumber}</span></div>` : ""}
      ${d.billingPeriod   ? `<div class="row"><span class="lbl">Billing Period</span><span class="val">${d.billingPeriod}</span></div>` : ""}
      <div class="row"><span class="lbl">Confirmed At</span><span class="val">${confirmedAt}</span></div>
    </div>

    <div class="divider"></div>

    <p style="font-size:13px;color:#475569;line-height:1.8">
      Please keep this email as your payment receipt.
      If you have any questions, contact us at
      <a href="mailto:${supportEmail}" style="color:#2563eb;font-weight:600">${supportEmail}</a>
      or call <strong>${supportPhone}</strong>.
    </p>
  </div>

  <div class="footer">
    <p>
      Questions? Email <a href="mailto:${supportEmail}">${supportEmail}</a> | Call <strong>${supportPhone}</strong><br/>
      <em>This is an automated receipt. Please do not reply to this email.</em><br/>
      &copy; ${year} ${senderName}. All rights reserved.
    </p>
  </div>
</div>
</body>
</html>`;
}

function buildPaymentConfirmedText(d: PaymentConfirmedPayload): string {
  const confirmedAt  = new Date(d.confirmedAt).toLocaleString("en-PH");
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE ?? "N/A";
  return `PAYMENT CONFIRMED — ${d.customerName}

Hello ${d.customerName},

Your payment has been verified and confirmed by our team.
Your internet connection is now active.

RECEIPT
═══════════════════════════════════
Amount Paid    : ${formatPHP(d.amountPaid)}
Account #      : ${d.accountNumber}
PPPoE Username : ${d.pppoeUsername}
Method         : ${d.method}
Reference #    : ${d.referenceNumber ?? "N/A"}
Billing Period : ${d.billingPeriod ?? "N/A"}
Confirmed At   : ${confirmedAt}

SUPPORT
═══════════════════════════════════
Email : ${supportEmail}
Phone : ${supportPhone}

This is an automated receipt. Please do not reply to this email.`;
}

/**
 * Send a payment confirmation receipt to the customer after admin approval.
 */
export async function sendPaymentConfirmedToCustomer(data: PaymentConfirmedPayload): Promise<void> {
  const client      = createResendClient();
  const senderEmail = process.env.RESEND_SENDER_EMAIL ?? "onboarding@resend.dev";
  const senderName  = process.env.RESEND_SENDER_NAME  ?? "ISP Billing System";

  const { error } = await client.emails.send({
    from:    `${senderName} <${senderEmail}>`,
    to:      [data.customerEmail],
    subject: `✅ Payment Confirmed — Acct #${data.accountNumber} (${formatPHP(data.amountPaid)})`,
    html:    buildPaymentConfirmedHtml(data),
    text:    buildPaymentConfirmedText(data),
    headers: { "X-Mailer": "ISP-Billing-System/1.0" },
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

// ─── Payment Rejected → Customer Notification ─────────────────────────────────

export interface PaymentRejectedPayload {
  customerName: string;
  customerEmail: string;
  accountNumber: string;
  amountPaid: number;
  method: string;
  referenceNumber?: string | null;
  rejectionReason?: string | null;
  rejectedAt: string;
}

function buildPaymentRejectedHtml(d: PaymentRejectedPayload): string {
  const senderName   = process.env.RESEND_SENDER_NAME      ?? "ISP Billing System";
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL   ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE   ?? "N/A";
  const portalUrl    = process.env.NEXT_PUBLIC_APP_URL      ?? "http://localhost:3000";
  const year         = new Date().getFullYear();

  const rejectedAt = new Date(d.rejectedAt).toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const methodLabel: Record<string, string> = {
    gcash: "GCash",
    maya: "Maya (PayMaya)",
    bank_transfer: "Bank Transfer",
    cash: "Cash",
  };

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Payment Not Verified</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#1e293b}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:40px 32px;text-align:center}
  .hdr h1{color:#fff;font-size:22px;font-weight:700;margin-top:14px}
  .hdr p{color:rgba(255,255,255,.75);font-size:13px;margin-top:5px}
  .body{padding:32px}
  .greeting{font-size:15px;color:#334155;margin-bottom:20px;line-height:1.7}
  .status-box{background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center}
  .status-icon{font-size:40px;margin-bottom:8px}
  .status-title{font-size:18px;font-weight:800;color:#dc2626}
  .status-sub{font-size:13px;color:#991b1b;margin-top:4px}
  .reason-box{background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:24px}
  .reason-lbl{font-size:11px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .reason-text{font-size:14px;color:#431407;line-height:1.6}
  .sec-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .card{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:4px 20px 8px;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b}
  .val{font-weight:600;color:#1e293b}
  .steps{background:#f8fafc;border-radius:12px;padding:16px 20px;margin-bottom:24px}
  .steps ol{padding-left:20px;font-size:13px;color:#475569;line-height:2.1}
  .divider{height:1px;background:#e2e8f0;margin:24px 0}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center}
  .footer p{font-size:12px;color:#94a3b8;line-height:1.9}
  .footer a{color:#2563eb;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
      <rect width="52" height="52" rx="14" fill="rgba(255,255,255,.15)"/>
      <path d="M20 20l12 12M32 20L20 32" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <h1>${senderName}</h1>
    <p>Payment Verification Failed</p>
  </div>

  <div class="body">
    <p class="greeting">Hello <strong>${d.customerName}</strong>,<br/><br/>
      We were unable to verify your recent payment submission.
      Please review the reason below and resubmit with the correct information.
    </p>

    <div class="status-box">
      <div class="status-icon">&#10060;</div>
      <div class="status-title">Payment Not Verified</div>
      <div class="status-sub">Your submission could not be confirmed</div>
    </div>

    ${d.rejectionReason ? `
    <div class="reason-box">
      <div class="reason-lbl">&#9888;&#65039; Reason for Rejection</div>
      <div class="reason-text">${d.rejectionReason}</div>
    </div>` : ""}

    <p class="sec-title">&#128203; Submitted Payment Details</p>
    <div class="card">
      <div class="row"><span class="lbl">Account Number</span><span class="val">${d.accountNumber}</span></div>
      <div class="row"><span class="lbl">Amount Submitted</span><span class="val">${formatPHP(d.amountPaid)}</span></div>
      <div class="row"><span class="lbl">Payment Method</span><span class="val">${methodLabel[d.method] ?? d.method}</span></div>
      ${d.referenceNumber ? `<div class="row"><span class="lbl">Reference #</span><span class="val">${d.referenceNumber}</span></div>` : ""}
      <div class="row"><span class="lbl">Reviewed At</span><span class="val">${rejectedAt}</span></div>
    </div>

    <p class="sec-title">&#128260; What to Do Next</p>
    <div class="steps">
      <ol>
        <li>Double-check your GCash / Maya transaction history for the correct reference number.</li>
        <li>Make sure the amount matches your outstanding balance exactly.</li>
        <li>Visit <a href="${portalUrl}" style="color:#2563eb;font-weight:700">${portalUrl}</a> and resubmit with the corrected details.</li>
        <li>Contact us if you need help finding your reference number.</li>
      </ol>
    </div>

    <div class="divider"></div>

    <p style="font-size:13px;color:#475569;line-height:1.8">
      Need assistance? Contact us at
      <a href="mailto:${supportEmail}" style="color:#2563eb;font-weight:600">${supportEmail}</a>
      or call <strong>${supportPhone}</strong>.
    </p>
  </div>

  <div class="footer">
    <p>
      Questions? Email <a href="mailto:${supportEmail}">${supportEmail}</a> | Call <strong>${supportPhone}</strong><br/>
      <em>This is an automated notification. Please do not reply to this email.</em><br/>
      &copy; ${year} ${senderName}. All rights reserved.
    </p>
  </div>
</div>
</body>
</html>`;
}

function buildPaymentRejectedText(d: PaymentRejectedPayload): string {
  const rejectedAt   = new Date(d.rejectedAt).toLocaleString("en-PH");
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE ?? "N/A";
  const portalUrl    = process.env.NEXT_PUBLIC_APP_URL    ?? "http://localhost:3000";
  return `PAYMENT NOT VERIFIED — ${d.customerName}

Hello ${d.customerName},

Your payment submission for Account #${d.accountNumber} could not be verified.

REASON
═══════════════════════════════════
${d.rejectionReason ?? "No specific reason provided. Please contact support."}

SUBMITTED PAYMENT
═══════════════════════════════════
Account #   : ${d.accountNumber}
Amount      : ${formatPHP(d.amountPaid)}
Method      : ${d.method}
Reference # : ${d.referenceNumber ?? "N/A"}
Reviewed At : ${rejectedAt}

WHAT TO DO NEXT
═══════════════════════════════════
1. Check your GCash / Maya history for the correct reference number.
2. Ensure the amount matches your outstanding balance.
3. Resubmit at: ${portalUrl}
4. Contact us if you need help.

SUPPORT
═══════════════════════════════════
Email : ${supportEmail}
Phone : ${supportPhone}

This is an automated notification. Please do not reply to this email.`;
}

/**
 * Notify the customer that their payment was rejected by the admin.
 */
export async function sendPaymentRejectedToCustomer(data: PaymentRejectedPayload): Promise<void> {
  const client      = createResendClient();
  const senderEmail = process.env.RESEND_SENDER_EMAIL ?? "onboarding@resend.dev";
  const senderName  = process.env.RESEND_SENDER_NAME  ?? "ISP Billing System";

  const { error } = await client.emails.send({
    from:    `${senderName} <${senderEmail}>`,
    to:      [data.customerEmail],
    subject: `❌ Payment Not Verified — Acct #${data.accountNumber}`,
    html:    buildPaymentRejectedHtml(data),
    text:    buildPaymentRejectedText(data),
    headers: { "X-Mailer": "ISP-Billing-System/1.0" },
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}
