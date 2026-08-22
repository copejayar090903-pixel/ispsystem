import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { verifyEmailActionToken } from "@/src/lib/email-token";
import {
  sendPaymentConfirmedToCustomer,
  sendPaymentRejectedToCustomer,
} from "@/src/lib/email";

export const runtime = "nodejs";

// ─── Shared Styles ────────────────────────────────────────────────────────────

const PAGE_STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:480px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{padding:40px 32px;text-align:center}
  .hdr-approve{background:linear-gradient(135deg,#14532d 0%,#16a34a 100%)}
  .hdr-reject{background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)}
  .hdr-warn{background:linear-gradient(135deg,#78350f 0%,#f59e0b 100%)}
  .hdr-error{background:linear-gradient(135deg,#581c87 0%,#7c3aed 100%)}
  .hdr h1{color:#fff;font-size:20px;font-weight:700;margin-top:12px}
  .hdr p{color:rgba(255,255,255,.7);font-size:13px;margin-top:5px}
  .icon{font-size:48px;display:block}
  .body{padding:32px}
  .msg{font-size:15px;color:#334155;line-height:1.7;text-align:center;margin-bottom:20px}
  .detail{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:4px 20px 8px;margin-bottom:24px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .row:last-child{border-bottom:none}
  .lbl{color:#64748b}
  .val{font-weight:600;color:#1e293b}
  .val-green{color:#16a34a;font-weight:700}
  label{display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:8px}
  textarea{width:100%;min-height:100px;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:inherit;resize:vertical;margin-bottom:16px}
  textarea:focus{outline:none;border-color:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.1)}
  .btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;text-align:center}
  .btn-reject{background:linear-gradient(135deg,#7f1d1d,#dc2626);color:#fff}
  .btn-reject:hover{opacity:.9}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center}
  .footer p{font-size:11px;color:#94a3b8}
`;

// ─── Helper: Build HTML page ──────────────────────────────────────────────────

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title}</title>
<style>${PAGE_STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── Helper: Format PHP currency ─────────────────────────────────────────────

function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

// ─── Helper: Method label ─────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  gcash: "GCash",
  maya: "Maya (PayMaya)",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

// ─── GET: Handle email link click ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id     = searchParams.get("id");
  const action = searchParams.get("action");
  const token  = searchParams.get("token");

  // Validate params
  if (!id || !action || !token || !["approve", "reject"].includes(action)) {
    return htmlResponse(htmlPage("Invalid Link", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">🚫</span><h1>Invalid Link</h1></div>
        <div class="body"><p class="msg">This link is invalid or malformed. Please check your email and try again.</p></div>
      </div>
    `), 400);
  }

  // Verify token
  if (!verifyEmailActionToken(id, token)) {
    return htmlResponse(htmlPage("Unauthorized", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">🔒</span><h1>Unauthorized</h1></div>
        <div class="body"><p class="msg">This link has an invalid security token. It may have been tampered with.</p></div>
      </div>
    `), 403);
  }

  const supabase = createSupabaseServerClient();

  // Fetch payment + customer + bill
  const { data: payment } = await supabase
    .from("payments")
    .select(`
      id, status, amount_paid, method, reference_number, billing_id,
      customers ( full_name, account_number, email, pppoe_username ),
      bills ( billing_period_start, billing_period_end )
    `)
    .eq("id", id)
    .single();

  if (!payment) {
    return htmlResponse(htmlPage("Not Found", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">❓</span><h1>Payment Not Found</h1></div>
        <div class="body"><p class="msg">This payment record could not be found. It may have been deleted.</p></div>
      </div>
    `), 404);
  }

  const p = payment as any;
  const cust = p.customers;
  const bill = p.bills;

  // Already processed?
  if (p.status !== "pending") {
    const statusEmoji = p.status === "verified" ? "✅" : p.status === "rejected" ? "❌" : "ℹ️";
    const statusLabel = p.status === "verified" ? "Approved" : p.status === "rejected" ? "Rejected" : p.status;
    return htmlResponse(htmlPage("Already Processed", `
      <div class="card">
        <div class="hdr hdr-warn"><span class="icon">⚠️</span><h1>Already Processed</h1></div>
        <div class="body">
          <p class="msg">This payment has already been <strong>${statusLabel.toLowerCase()}</strong>. No further action is needed.</p>
          <div class="detail">
            <div class="row"><span class="lbl">Customer</span><span class="val">${cust.full_name}</span></div>
            <div class="row"><span class="lbl">Account #</span><span class="val">${cust.account_number}</span></div>
            <div class="row"><span class="lbl">Amount</span><span class="val">${formatPHP(Number(p.amount_paid))}</span></div>
            <div class="row"><span class="lbl">Status</span><span class="val">${statusEmoji} ${statusLabel}</span></div>
          </div>
        </div>
      </div>
    `));
  }

  // ── APPROVE ──
  if (action === "approve") {
    // Update payment → verified
    const { error: payErr } = await supabase
      .from("payments")
      .update({
        status: "verified",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (payErr) {
      return htmlResponse(htmlPage("Error", `
        <div class="card">
          <div class="hdr hdr-error"><span class="icon">⚠️</span><h1>Error</h1></div>
          <div class="body"><p class="msg">Failed to approve payment: ${payErr.message}</p></div>
        </div>
      `), 500);
    }

    // Update bill → paid
    if (p.billing_id) {
      await supabase
        .from("bills")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", p.billing_id);
    }

    // Send confirmation email to customer (non-fatal)
    if (cust?.email) {
      try {
        const billingPeriod = bill?.billing_period_start && bill?.billing_period_end
          ? `${bill.billing_period_start} – ${bill.billing_period_end}`
          : null;
        await sendPaymentConfirmedToCustomer({
          customerName: cust.full_name,
          customerEmail: cust.email,
          accountNumber: cust.account_number,
          pppoeUsername: cust.pppoe_username,
          amountPaid: Number(p.amount_paid),
          method: p.method,
          referenceNumber: p.reference_number,
          billingPeriod,
          confirmedAt: new Date().toISOString(),
        });
      } catch (emailErr) {
        console.error("[email-action/approve] Failed to send customer confirmation email:", emailErr);
      }
    }

    return htmlResponse(htmlPage("Payment Approved", `
      <div class="card">
        <div class="hdr hdr-approve"><span class="icon">✅</span><h1>Payment Approved</h1><p>The customer has been notified</p></div>
        <div class="body">
          <p class="msg">The payment has been <strong>verified</strong> and the bill has been marked as <strong>paid</strong>.</p>
          <div class="detail">
            <div class="row"><span class="lbl">Customer</span><span class="val">${cust.full_name}</span></div>
            <div class="row"><span class="lbl">Account #</span><span class="val">${cust.account_number}</span></div>
            <div class="row"><span class="lbl">Amount Paid</span><span class="val val-green">${formatPHP(Number(p.amount_paid))}</span></div>
            <div class="row"><span class="lbl">Method</span><span class="val">${METHOD_LABEL[p.method] ?? p.method}</span></div>
            ${p.reference_number ? `<div class="row"><span class="lbl">Reference #</span><span class="val">${p.reference_number}</span></div>` : ""}
          </div>
        </div>
        <div class="footer"><p>You can close this page. The customer's connection will be restored by the next cron run.</p></div>
      </div>
    `));
  }

  // ── REJECT → Show form ──
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return htmlResponse(htmlPage("Reject Payment", `
    <div class="card">
      <div class="hdr hdr-reject"><span class="icon">❌</span><h1>Reject Payment</h1><p>Provide a reason for the customer</p></div>
      <div class="body">
        <div class="detail">
          <div class="row"><span class="lbl">Customer</span><span class="val">${cust.full_name}</span></div>
          <div class="row"><span class="lbl">Account #</span><span class="val">${cust.account_number}</span></div>
          <div class="row"><span class="lbl">Amount</span><span class="val">${formatPHP(Number(p.amount_paid))}</span></div>
          <div class="row"><span class="lbl">Method</span><span class="val">${METHOD_LABEL[p.method] ?? p.method}</span></div>
          ${p.reference_number ? `<div class="row"><span class="lbl">Reference #</span><span class="val">${p.reference_number}</span></div>` : ""}
        </div>
        <form method="POST" action="${appUrl}/api/payments/email-action">
          <input type="hidden" name="id" value="${id}"/>
          <input type="hidden" name="action" value="reject"/>
          <input type="hidden" name="token" value="${token}"/>
          <label for="reason">Reason for Rejection</label>
          <textarea id="reason" name="reason" placeholder="e.g. Reference number does not match our records…" required></textarea>
          <button type="submit" class="btn btn-reject">❌ Confirm Rejection</button>
        </form>
      </div>
    </div>
  `));
}

// ─── POST: Handle reject form submission ──────────────────────────────────────

export async function POST(request: NextRequest) {
  let id: string | null = null;
  let action: string | null = null;
  let token: string | null = null;
  let reason: string | null = null;

  // Support both form-encoded and JSON
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    id     = formData.get("id") as string | null;
    action = formData.get("action") as string | null;
    token  = formData.get("token") as string | null;
    reason = formData.get("reason") as string | null;
  } else {
    const body = await request.json().catch(() => ({}));
    id     = body.id;
    action = body.action;
    token  = body.token;
    reason = body.reason;
  }

  if (!id || action !== "reject" || !token) {
    return htmlResponse(htmlPage("Invalid Request", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">🚫</span><h1>Invalid Request</h1></div>
        <div class="body"><p class="msg">Missing required fields. Please go back and try again.</p></div>
      </div>
    `), 400);
  }

  if (!verifyEmailActionToken(id, token)) {
    return htmlResponse(htmlPage("Unauthorized", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">🔒</span><h1>Unauthorized</h1></div>
        <div class="body"><p class="msg">Invalid security token.</p></div>
      </div>
    `), 403);
  }

  const supabase = createSupabaseServerClient();

  // Fetch payment + customer
  const { data: payment } = await supabase
    .from("payments")
    .select(`
      id, status, amount_paid, method, reference_number,
      customers ( full_name, account_number, email )
    `)
    .eq("id", id)
    .single();

  if (!payment) {
    return htmlResponse(htmlPage("Not Found", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">❓</span><h1>Payment Not Found</h1></div>
        <div class="body"><p class="msg">This payment record could not be found.</p></div>
      </div>
    `), 404);
  }

  const p = payment as any;
  const cust = p.customers;

  if (p.status !== "pending") {
    const statusLabel = p.status === "verified" ? "approved" : p.status === "rejected" ? "rejected" : p.status;
    return htmlResponse(htmlPage("Already Processed", `
      <div class="card">
        <div class="hdr hdr-warn"><span class="icon">⚠️</span><h1>Already Processed</h1></div>
        <div class="body"><p class="msg">This payment has already been <strong>${statusLabel}</strong>.</p></div>
      </div>
    `));
  }

  // Reject the payment
  const { error } = await supabase
    .from("payments")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    return htmlResponse(htmlPage("Error", `
      <div class="card">
        <div class="hdr hdr-error"><span class="icon">⚠️</span><h1>Error</h1></div>
        <div class="body"><p class="msg">Failed to reject payment: ${error.message}</p></div>
      </div>
    `), 500);
  }

  // Send rejection email to customer (non-fatal)
  if (cust?.email) {
    try {
      await sendPaymentRejectedToCustomer({
        customerName: cust.full_name,
        customerEmail: cust.email,
        accountNumber: cust.account_number,
        amountPaid: Number(p.amount_paid),
        method: p.method,
        referenceNumber: p.reference_number,
        rejectionReason: reason?.trim() || null,
        rejectedAt: new Date().toISOString(),
      });
    } catch (emailErr) {
      console.error("[email-action/reject] Failed to send customer rejection email:", emailErr);
    }
  }

  return htmlResponse(htmlPage("Payment Rejected", `
    <div class="card">
      <div class="hdr hdr-reject"><span class="icon">❌</span><h1>Payment Rejected</h1><p>The customer has been notified</p></div>
      <div class="body">
        <p class="msg">The payment has been <strong>rejected</strong> and the customer has been notified with the reason.</p>
        <div class="detail">
          <div class="row"><span class="lbl">Customer</span><span class="val">${cust.full_name}</span></div>
          <div class="row"><span class="lbl">Account #</span><span class="val">${cust.account_number}</span></div>
          <div class="row"><span class="lbl">Amount</span><span class="val">${formatPHP(Number(p.amount_paid))}</span></div>
          ${reason ? `<div class="row"><span class="lbl">Reason</span><span class="val">${reason.trim()}</span></div>` : ""}
        </div>
      </div>
      <div class="footer"><p>You can close this page.</p></div>
    </div>
  `));
}
