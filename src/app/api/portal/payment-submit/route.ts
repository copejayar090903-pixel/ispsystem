import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { sendPaymentSubmittedToOwner } from "@/src/lib/email";
import { enablePPPoE, changePPPoEProfile } from "@/src/lib/mikrotik";

import { createWorker } from "tesseract.js";
import path from "path";

export const runtime = "nodejs";

// Max 10 MB upload
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    // ─── Immediate OCR extraction support ──────────────────────────────────
    if (action === "ocr") {
      let worker: any = null;
      try {
        const formData = await request.formData();
        const file = (formData.get("file") || formData.get("receipt")) as File | null;
        if (!file || file.size === 0) {
          return NextResponse.json({ error: "Please upload a receipt image." }, { status: 400 });
        }
        const arrayBuffer = await file.arrayBuffer();
        const workerPath = path.resolve(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
        worker = await createWorker("eng", 1, { workerPath, cachePath: process.cwd(), gzip: false });
        const ret = await worker.recognize(Buffer.from(arrayBuffer));
        const rawText: string = ret.data?.text || "";

        let amount: number | null = null;
        const totalAmountMatch = rawText.match(
          /(?:Total\s*Amount\s*(?:Sent)?|Amount\s*Sent)\s*[:=]?\s*[£P₱p]?\s*([\d,]+(?:\.\d{1,2})?)/i
        );
        if (totalAmountMatch) {
          amount = parseFloat(totalAmountMatch[1].replace(/,/g, ""));
        } else {
          const amountMatch = rawText.match(/Amount\s*[:=]?\s*[£P₱p]?\s*([\d,]+(?:\.\d{1,2})?)/i);
          if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(/,/g, ""));
          } else {
            const genericAmountMatch = rawText.match(/[£P₱p]\s*([\d,]+(?:\.\d{1,2})?)/);
            if (genericAmountMatch) {
              amount = parseFloat(genericAmountMatch[1].replace(/,/g, ""));
            }
          }
        }

        let referenceNumber: string | null = null;
        const refMatch = rawText.match(/Ref(?:\s*No|\s*Number|\.|\#)?\.?:?\s*([0-9\s]{8,25})/i);
        if (refMatch) {
          referenceNumber = refMatch[1].trim();
        }

        let dateStr: string | null = null;
        const dateMatch = rawText.match(
          /([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i
        );
        if (dateMatch) {
          dateStr = dateMatch[1].trim();
        }

        let customerName: string | null = null;
        const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
        const expressSendIdx = lines.findIndex((l: string) => /Express Send|Sent to|To\b/i.test(l));
        if (expressSendIdx !== -1 && lines[expressSendIdx + 1]) {
          const candidate = lines[expressSendIdx + 1].replace(/[e\*\.]{3,}/g, "•••").trim();
          if (candidate.length >= 2 && !/^\+?\d+$/.test(candidate)) {
            customerName = candidate;
          }
        }

        return NextResponse.json({
          success: true,
          amount,
          referenceNumber,
          date: dateStr,
          customerName,
          rawText,
        });
      } finally {
        if (worker) {
          try {
            await worker.terminate();
          } catch (e) {
            // ignore
          }
        }
      }
    }

    const contentType = request.headers.get("content-type") ?? "";

    let accountNumber: string;
    let method: string;
    let referenceNumber: string | null = null;
    let amountPaid: number;
    let planId: string | null = null;
    let proofUrl: string | null = null;
    let receiptDate: string | null = null;
    let customerNameInput: string | null = null;

    // ─── Parse multipart/form-data (receipt upload) ───────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      accountNumber      = (formData.get("accountNumber") as string) ?? "";
      method             = (formData.get("method") as string) ?? "gcash";
      referenceNumber    = (formData.get("referenceNumber") as string) || null;
      amountPaid         = Number(formData.get("amountPaid") ?? 0);
      planId             = (formData.get("planId") as string) || null;
      receiptDate        = (formData.get("receiptDate") as string) || null;
      customerNameInput  = (formData.get("customerName") as string) || null;

      const file = formData.get("receipt") as File | null;

      if (file && file.size > 0) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json({ error: "Receipt image must be under 10 MB." }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();
        const ext      = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const safeExt  = ["jpg", "jpeg", "png", "webp", "gif", "pdf"].includes(ext) ? ext : "jpg";
        const path     = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(path, arrayBuffer, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          console.error("[portal/payment-submit] Storage upload error:", uploadError);
          // If storage bucket doesn't exist yet, return helpful message
          return NextResponse.json(
            {
              error:
                "Failed to upload receipt image. Please ensure the Supabase storage bucket 'payment-proofs' is created.",
            },
            { status: 500 }
          );
        }

        const { data: urlData } = supabase.storage
          .from("payment-proofs")
          .getPublicUrl(path);
        proofUrl = urlData?.publicUrl ?? null;
      }
    } else {
      // ─── Fallback: plain JSON ──────────────────────────────────────────
      const body = await request.json().catch(() => ({}));
      accountNumber     = body.accountNumber ?? "";
      method            = body.method ?? "gcash";
      referenceNumber   = body.referenceNumber ?? null;
      amountPaid        = Number(body.amountPaid ?? 0);
      planId            = body.planId ?? null;
      proofUrl          = body.proofUrl ?? null;
      receiptDate       = body.receiptDate ?? null;
      customerNameInput = body.customerName ?? null;
    }

    // ─── Basic validation ────────────────────────────────────────────────
    if (!accountNumber.trim()) {
      return NextResponse.json({ error: "Account number is required." }, { status: 400 });
    }
    if (!amountPaid || amountPaid <= 0) {
      return NextResponse.json({ error: "Amount paid must be greater than zero." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // ─── Load customer ────────────────────────────────────────────────────
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, pppoe_username, due_date, status, plan_id, plans(id, plan_name, monthly_fee)")
      .eq("account_number", accountNumber.trim())
      .single();

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // ─── Resolve plan being paid for ──────────────────────────────────────
    const effectivePlanId = planId ?? customer.plan_id;
    let planFee: number | null = null;
    let planName = "";

    if (effectivePlanId) {
      const { data: plan } = await supabase
        .from("plans")
        .select("id, plan_name, monthly_fee")
        .eq("id", effectivePlanId)
        .single();

      if (plan) {
        planFee  = Number(plan.monthly_fee);
        planName = plan.plan_name;
      }
    }

    // ─── Plan and load match validation ───────────────────────────────────
    // User requirement: "make sure the plan and load are match first before saving"
    if (planFee !== null && Math.round(amountPaid) !== Math.round(planFee)) {
      return NextResponse.json(
        {
          error: `Plan and load amount do not match! The selected plan "${planName}" costs ₱${planFee.toLocaleString()}, but the load amount from the receipt is ₱${amountPaid.toLocaleString()}. Please make sure the plan and load amount match before submitting.`,
        },
        { status: 422 }
      );
    }

    // ─── Automatic Customer Renewal ───────────────────────────────────────
    // User requirement: "after providing that it will automatically renew the customer"
    // Calculate new due date (30 days extension)
    const now = new Date();
    let baseDate = now;
    if (customer.due_date) {
      const currentDue = new Date(customer.due_date);
      if (currentDue > now) {
        baseDate = currentDue; // Extend from current expiration date
      }
    }
    const newDueDateObj = new Date(baseDate);
    newDueDateObj.setDate(newDueDateObj.getDate() + 30);
    const newDueDateStr = newDueDateObj.toISOString();

    // 1. Update customer: status -> active, due_date extended, plan updated
    const { error: customerUpdateError } = await supabase
      .from("customers")
      .update({
        status: "active",
        due_date: newDueDateStr,
        plan_id: effectivePlanId ?? customer.plan_id,
      })
      .eq("id", customer.id);

    if (customerUpdateError) {
      console.error("[portal/payment-submit] Customer renewal update error:", customerUpdateError);
    }

    // 2. Synchronize with MikroTik router to ensure active connection
    if (customer.pppoe_username) {
      try {
        await enablePPPoE(customer.pppoe_username);
        if (planName) {
          await changePPPoEProfile(customer.pppoe_username, planName);
        }
      } catch (mikrotikErr) {
        console.warn("[portal/payment-submit] MikroTik auto-enable note:", mikrotikErr);
      }
    }

    // 3. Find or create bill for this renewal cycle to keep billing records clean
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const { data: existingBill } = await supabase
      .from("bills")
      .select("id, status")
      .eq("customer_id", customer.id)
      .eq("billing_year", currentYear)
      .eq("billing_month", currentMonth)
      .maybeSingle();

    let billingId: string | null = existingBill?.id ?? null;

    if (existingBill) {
      // Mark bill as paid with current payment
      await supabase
        .from("bills")
        .update({
          status: "paid",
          paid_at: now.toISOString(),
          due_date: newDueDateStr,
        })
        .eq("id", existingBill.id);
    } else {
      // Insert new paid bill for this cycle
      const periodStart = now.toISOString().split("T")[0];
      const periodEnd = newDueDateStr.split("T")[0];
      const { data: newBill } = await supabase
        .from("bills")
        .insert({
          customer_id: customer.id,
          billing_year: currentYear,
          billing_month: currentMonth,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          due_date: newDueDateStr,
          amount_due: planFee ?? amountPaid,
          status: "paid",
          paid_at: now.toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (newBill) {
        billingId = newBill.id;
      }
    }

    // ─── Insert payment record (Pending Admin Review) ──────────────────────
    // User requirement: "after that it will review by the admin to confirm it and send it to the owner email"
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        customer_id:      customer.id,
        billing_id:       billingId,
        plan_id:          effectivePlanId ?? null,
        method,
        reference_number: referenceNumber,
        amount_paid:      amountPaid,
        proof_url:        proofUrl,
        status:           "pending",
        submitted_at:     now.toISOString(),
      })
      .select("id")
      .single();

    if (paymentError) throw paymentError;

    // ─── Send owner email alert for Admin Review ───────────────────────────
    try {
      await sendPaymentSubmittedToOwner({
        paymentId:       payment.id,
        customerName:    customerNameInput || customer.full_name,
        accountNumber,
        pppoeUsername:   customer.pppoe_username,
        amountPaid,
        method,
        referenceNumber,
        billingPeriod:   planName ? `Plan: ${planName} (Auto-Renewed)` : "Plan Auto-Renewal",
        submittedAt:     receiptDate || now.toISOString(),
        proofUrl:        proofUrl ?? undefined,
      });
    } catch (emailError) {
      console.error("[portal/payment-submit] Failed to send owner email:", emailError);
    }

    return NextResponse.json({
      ok: true,
      payment,
      newDueDate: newDueDateStr,
      message: "Subscription successfully renewed! Your receipt has been submitted for admin confirmation.",
    });
  } catch (error) {
    console.error("[portal/payment-submit] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit payment." },
      { status: 500 }
    );
  }
}
