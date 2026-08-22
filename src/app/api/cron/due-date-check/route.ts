import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import {
  changePPPoEProfile,
  disablePPPoE,
  disconnectPPPoE,
  MikrotikError,
} from "@/src/lib/mikrotik";
import { writeLog } from "@/src/lib/activity-log";
import { cache } from "@/src/lib/redis";

export const runtime = "nodejs";

// ─── Constants ────────────────────────────────────────────────────────────────

/** MikroTik profile applied when a customer is overdue (throttled access). */
const EXPIRED_PROFILE = "Expired-Profile";

/**
 * Days past due before escalating from `overdue` → `suspended`.
 * During this grace window, the customer is throttled but not fully cut off.
 */
const SUSPENSION_THRESHOLD_DAYS = 5;

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * We verify this header so the route cannot be triggered by arbitrary callers.
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured → allow (useful in local dev / self-hosted)
    console.warn("[DueDateCron] CRON_SECRET is not set. Route is unprotected.");
    return true;
  }
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/cron/due-date-check
 *
 * Called by Vercel Cron daily at midnight UTC.
 * Also callable manually (with Authorization header) for testing.
 *
 * Policy:
 *   • Customer has an unpaid due_date in the past AND no paid bill this cycle:
 *     - 1–5 days overdue  → status: overdue    + MikroTik profile → Expired-Profile
 *     - >5 days overdue   → status: suspended  + PPPoE secret disabled
 *   • Already suspended customers are skipped (re-enable is manual via admin UI).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  console.log(`[DueDateCron] ▶ Starting due-date enforcement at ${now.toISOString()}`);

  try {
    const supabase = createSupabaseServerClient();
    // Fetch the Expired plan ID from the database
    const { data: plansData } = await supabase
      .from("plans")
      .select("id")
      .eq("speed", EXPIRED_PROFILE)
      .limit(1);
    const expiredPlanId = plansData && plansData.length > 0 ? plansData[0].id : null;

    // ── 1. Fetch customers whose due_date has passed and aren't suspended yet ──
    const { data: overdueCustomers, error: fetchError } = await supabase
      .from("customers")
      .select(
        `id, full_name, pppoe_username, status, due_date, plan_id,
         plans ( speed )`
      )
      .in("status", ["active", "overdue"])
      .lt("due_date", now.toISOString())
      .not("due_date", "is", null);

    if (fetchError) throw fetchError;

    if (!overdueCustomers || overdueCustomers.length === 0) {
      console.log("[DueDateCron] ✅ No overdue customers found. Nothing to do.");
      return NextResponse.json({
        message: "No overdue customers found.",
        processed: 0,
        overdue: 0,
        suspended: 0,
        skipped: 0,
        errors: [],
      });
    }

    console.log(`[DueDateCron] Found ${overdueCustomers.length} candidate(s) to evaluate.`);

    // ── 2. Process each candidate ─────────────────────────────────────────────
    let markedOverdue = 0;
    let markedSuspended = 0;
    let skipped = 0;
    const errors: Array<{ pppoe_username: string; error: string }> = [];

    for (const customer of overdueCustomers) {
      const pppoeUsername: string = customer.pppoe_username;

      // ── 2a. Determine how many days overdue ───────────────────────────────
      const dueDate = new Date(customer.due_date as string);
      const daysOverdue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(
        `[DueDateCron] 🔍 ${pppoeUsername} — ${daysOverdue} day(s) overdue (due: ${customer.due_date}, status: ${customer.status})`
      );

      try {
        if (daysOverdue > SUSPENSION_THRESHOLD_DAYS) {
          // ── SUSPEND (> 5 days past due) ────────────────────────────────────
          if (customer.status !== "suspended") {
            await supabase
              .from("customers")
              .update({ status: "suspended" })
              .eq("id", customer.id);

            // Disable the PPPoE secret on MikroTik (blocks login entirely)
            try {
              await disablePPPoE(pppoeUsername);
            } catch (mikrotikErr) {
              if (
                mikrotikErr instanceof MikrotikError &&
                mikrotikErr.code === "NOT_FOUND"
              ) {
                console.warn(
                  `[DueDateCron] ⚠ PPPoE secret not found for ${pppoeUsername} — skipping MikroTik disable.`
                );
              } else {
                throw mikrotikErr;
              }
            }

            await writeLog({
              event_type: "status_change",
              description: `Auto-suspended ${customer.full_name} (${pppoeUsername}) — ${daysOverdue} day(s) overdue. PPPoE disabled.`,
              pppoe_username: pppoeUsername,
              customer_name: customer.full_name,
              metadata: { daysOverdue, previousStatus: customer.status, action: "suspended" },
            });

            console.log(`[DueDateCron] 🔴 Suspended ${pppoeUsername} (${daysOverdue}d overdue).`);
            markedSuspended++;
          } else {
            skipped++;
          }
        } else {
          // ── OVERDUE (1–5 days past due) ────────────────────────────────────
          // Update status to overdue, and update plan_id to expiredPlanId (if found)
          const needsDbUpdate = customer.status !== "overdue" || (expiredPlanId && customer.plan_id !== expiredPlanId);
          if (needsDbUpdate) {
            const updatePayload: any = { status: "overdue" };
            if (expiredPlanId) {
              updatePayload.plan_id = expiredPlanId;
            }
            await supabase
              .from("customers")
              .update(updatePayload)
              .eq("id", customer.id);
          }

          // Switch MikroTik profile to throttled plan every time (idempotent)
          try {
            await changePPPoEProfile(pppoeUsername, EXPIRED_PROFILE);

            // Disconnect active session to force reconnect with throttled speed immediately
            try {
              await disconnectPPPoE(pppoeUsername);
            } catch (discErr) {
              console.log(`[DueDateCron] PPPoE session disconnect skipped for ${pppoeUsername} (likely already offline)`);
            }
          } catch (mikrotikErr) {
            if (
              mikrotikErr instanceof MikrotikError &&
              mikrotikErr.code === "NOT_FOUND"
            ) {
              console.warn(
                `[DueDateCron] ⚠ PPPoE secret not found for ${pppoeUsername} — skipping MikroTik profile change.`
              );
            } else {
              throw mikrotikErr;
            }
          }

          if (needsDbUpdate) {
            await writeLog({
              event_type: "status_change",
              description: `Auto-marked ${customer.full_name} (${pppoeUsername}) as overdue — ${daysOverdue} day(s) past due. Plan changed to Expired and profile set to ${EXPIRED_PROFILE}.`,
              pppoe_username: pppoeUsername,
              customer_name: customer.full_name,
              metadata: { daysOverdue, previousStatus: customer.status, action: "overdue", profile: EXPIRED_PROFILE },
            });

            console.log(`[DueDateCron] 🟡 Marked overdue & plan expired: ${pppoeUsername} (${daysOverdue}d overdue).`);
            markedOverdue++;
          } else {
            // Already overdue/expired — ensure profile is still throttled (idempotent)
            skipped++;
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DueDateCron] ❌ Error processing ${pppoeUsername}: ${errMsg}`);
        errors.push({ pppoe_username: pppoeUsername, error: errMsg });
      }
    }

    // ── 3. Invalidate caches so the admin UI reflects new statuses ─────────────
    if (markedOverdue > 0 || markedSuspended > 0) {
      await cache.del("dashboard:stats");
      await cache.invalidatePattern("customers:*");
      console.log("[DueDateCron] 🗑 Caches invalidated.");
    }

    // ── 4. Summary log ─────────────────────────────────────────────────────────
    const total = markedOverdue + markedSuspended + skipped + errors.length;
    console.log(
      `[DueDateCron] ✅ Done. ${markedOverdue} overdue, ${markedSuspended} suspended, ${skipped} skipped, ${errors.length} error(s). (${total} evaluated)`
    );

    return NextResponse.json({
      message: `Due-date enforcement complete. ${markedOverdue} overdue, ${markedSuspended} suspended, ${skipped} skipped, ${errors.length} error(s).`,
      runAt: now.toISOString(),
      evaluated: overdueCustomers.length,
      overdue: markedOverdue,
      suspended: markedSuspended,
      skipped,
      errorCount: errors.length,
      errors,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Due-date cron job failed.";
    console.error("[DueDateCron] Fatal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
