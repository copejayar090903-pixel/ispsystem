import { BrevoClient } from "@getbrevo/brevo";

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

// ─── Brevo API Client ─────────────────────────────────────────────────────────

function createBrevoClient(): BrevoClient {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey || apiKey === "your_brevo_api_key_here") {
    throw new Error(
      "BREVO_API_KEY is not configured. Set it in your .env file."
    );
  }

  return new BrevoClient({ apiKey });
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
  const bankName     = process.env.PAYMENT_BANK_NAME            ?? "N/A";
  const bankAcctNum  = process.env.PAYMENT_BANK_ACCOUNT_NUMBER  ?? "N/A";
  const bankAcctName = process.env.PAYMENT_BANK_ACCOUNT_NAME    ?? "ISP";
  const officeAddr   = process.env.PAYMENT_OFFICE_ADDRESS       ?? "N/A";
  const supportEmail = process.env.PAYMENT_SUPPORT_EMAIL        ?? "support@yourisp.com";
  const supportPhone = process.env.PAYMENT_SUPPORT_PHONE        ?? "N/A";
  const senderName   = process.env.BREVO_SENDER_NAME            ?? "ISP Billing System";

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
  .bank{background:#fffbeb;color:#b45309;border-bottom:1px solid #fde68a}
  .cash{background:#faf5ff;color:#7e22ce;border-bottom:1px solid #e9d5ff}
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

    <div class="pay-card">
      <div class="pay-hdr bank">&#127968; Bank Transfer &mdash; ${bankName}</div>
      <div class="pay-body">
        <div class="pi"><span class="pi-lbl">Bank</span><span class="pi-val">${bankName}</span></div>
        <div class="pi"><span class="pi-lbl">Account Name</span><span class="pi-val">${bankAcctName}</span></div>
        <div class="ref">&#128205; Use <strong>${accountNumber}</strong> as the transfer <strong>Reference / Memo</strong></div>
      </div>
    </div>

    <div class="pay-card">
      <div class="pay-hdr cash">&#128181; Cash Payment (Walk-in)</div>
      <div class="pay-body">
        <div class="pi"><span class="pi-lbl">Office Address</span><span class="pi-val" style="font-family:inherit;text-align:right;max-width:300px">${officeAddr}</span></div>
        <div class="ref">&#128205; Bring your Account Number <strong>${accountNumber}</strong> when paying at our office</div>
      </div>
    </div>

    <div class="divider"></div>

    <p class="sec-title">&#127760; Pay Online via Our Portal</p>
    <div class="pay-card" style="border-color:#bfdbfe">
      <div class="pay-hdr" style="background:#eff6ff;color:#1d4ed8;border-bottom:1px solid #bfdbfe">&#128187; Online Payment Portal — Fastest & Easiest</div>
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
  const bankName     = process.env.PAYMENT_BANK_NAME           ?? "N/A";
  const bankAcctNum  = process.env.PAYMENT_BANK_ACCOUNT_NUMBER ?? "N/A";
  const bankAcctName = process.env.PAYMENT_BANK_ACCOUNT_NAME   ?? "ISP";
  const officeAddr   = process.env.PAYMENT_OFFICE_ADDRESS      ?? "N/A";
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

3. BANK TRANSFER (${bankName})
   Account Name : ${bankAcctName}
   Reference    : Enter ${accountNumber} as Memo/Reference

4. CASH (Walk-in)
   Office       : ${officeAddr}
   Bring your Account Number: ${accountNumber}

5. ONLINE PORTAL (Easiest & Fastest)
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

// ─── Send Billing Reminder via Brevo API ─────────────────────────────────────

export async function sendBillingReminder(data: BillingReminderPayload): Promise<void> {
  const client = createBrevoClient();

  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "noreply@yourisp.com";
  const senderName  = process.env.BREVO_SENDER_NAME  ?? "ISP Billing System";

  await client.transactionalEmails.sendTransacEmail({
    sender: {
      email: senderEmail,
      name: senderName,
    },
    to: [
      {
        email: data.customerEmail,
        name: data.customerName,
      },
    ],
    subject: `⚠️ Billing Reminder: ${formatPHP(data.amountDue)} due on ${data.dueDate} — Acct #${data.accountNumber}`,
    htmlContent: buildReminderEmailHtml(data),
    textContent: buildReminderEmailText(data),
    headers: {
      "X-Mailer": "ISP-Billing-System/1.0",
    },
  });
}
