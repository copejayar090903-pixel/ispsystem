import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * We verify this header so the route cannot be triggered by arbitrary callers.
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[BillGenCron] CRON_SECRET is not set. Route is unprotected.");
    return true;
  }
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/cron/generate-bills
 *
 * Called by Vercel Cron at 00:05 UTC on the 1st of every month.
 * Also callable manually (with Authorization header) for testing.
 *
 * Generates a bill for every active customer that does not already have one
 * for the current billing cycle (year + month). Mirrors the logic in
 * POST /api/billing/generate but runs automatically.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  console.log(
    `[BillGenCron] ▶ Starting automatic bill generation for ${month}/${year} at ${now.toISOString()}`
  );

  try {
    const supabase = createSupabaseServerClient();

    const pad = (n: number) => String(n).padStart(2, "0");
    const maxDay = new Date(year, month, 0).getDate();
    const firstDayStr = `${year}-${pad(month)}-01`;
    const lastDayStr = `${year}-${pad(month)}-${pad(maxDay)}`;

    // ── 1. Fetch all active customers with their plan's monthly fee ──────────
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, full_name, plan_id, due_date, installation_date, plans(monthly_fee)")
      .eq("status", "active");

    if (custErr) throw custErr;

    if (!customers || customers.length === 0) {
      console.log("[BillGenCron] ✅ No active customers found. Nothing to do.");
      return NextResponse.json({
        ok: true,
        count: 0,
        message: "No active customers found.",
      });
    }

    // ── 2. Check for existing bills so we never create duplicates ─────────────
    const { data: existingBills } = await supabase
      .from("bills")
      .select("customer_id")
      .eq("billing_year", year)
      .eq("billing_month", month);

    const existingCustomerIds = new Set(
      (existingBills || []).map((b) => b.customer_id)
    );

    const customersToBill = customers.filter(
      (c) => !existingCustomerIds.has(c.id)
    );

    if (customersToBill.length === 0) {
      console.log(
        `[BillGenCron] ✅ All ${customers.length} active customer(s) already have bills for ${month}/${year}.`
      );
      return NextResponse.json({
        ok: true,
        count: 0,
        message: `Bills for all active customers have already been generated for ${month}/${year}.`,
      });
    }

    // ── 3. Build bill records ─────────────────────────────────────────────────
    const billsToInsert = customersToBill.map((customer) => {
      const monthlyFee =
        (customer as unknown as { plans?: { monthly_fee?: number } }).plans
          ?.monthly_fee ?? 0;

      // Calculate due date based on customer's due_date or installation_date
      let dueDay = 10; // Default to the 10th
      const dateSource = customer.due_date || customer.installation_date;
      if (dateSource) {
        try {
          const dateObj = new Date(dateSource);
          if (!isNaN(dateObj.getTime())) {
            dueDay = dateObj.getDate();
          }
        } catch {
          console.error(
            "[BillGenCron] Failed to parse customer date:",
            dateSource
          );
        }
      }

      const cappedDay = Math.min(dueDay, maxDay);
      const dueDateStr = `${year}-${pad(month)}-${pad(cappedDay)}`;

      return {
        customer_id: customer.id,
        billing_year: year,
        billing_month: month,
        billing_period_start: firstDayStr,
        billing_period_end: lastDayStr,
        due_date: dueDateStr,
        amount_due: monthlyFee,
        status: "unpaid" as const,
      };
    });

    // ── 4. Insert bills ───────────────────────────────────────────────────────
    const { error: insertErr } = await supabase
      .from("bills")
      .insert(billsToInsert)
      .select();

    if (insertErr) throw insertErr;

    // ── 5. Activity log ───────────────────────────────────────────────────────
    await writeLog({
      event_type: "bill_generated",
      description: `Auto-generated ${billsToInsert.length} bill(s) for ${month}/${year}.`,
      metadata: {
        billingYear: year,
        billingMonth: month,
        billCount: billsToInsert.length,
        trigger: "cron",
      },
    });

    console.log(
      `[BillGenCron] ✅ Done. Generated ${billsToInsert.length} bill(s) for ${month}/${year}.`
    );

    return NextResponse.json({
      ok: true,
      count: billsToInsert.length,
      message: `Auto-generated ${billsToInsert.length} bill(s) for ${month}/${year}.`,
      runAt: now.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto bill generation failed.";
    console.error("[BillGenCron] Fatal error:", error);

    // Log the failure too
    await writeLog({
      event_type: "bill_generated",
      description: `Auto bill generation failed for ${month}/${year}: ${message}`,
      metadata: { error: message, trigger: "cron" },
    }).catch(() => {}); // never let log failure mask the real error

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
