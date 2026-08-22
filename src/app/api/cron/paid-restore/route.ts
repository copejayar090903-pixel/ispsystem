import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import {
  changePPPoEProfile,
  enablePPPoE,
  disconnectPPPoE,
  MikrotikError,
} from "@/src/lib/mikrotik";
import { writeLog } from "@/src/lib/activity-log";
import { cache } from "@/src/lib/redis";

export const runtime = "nodejs";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * We verify this header so the route cannot be triggered by arbitrary callers.
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[PaidRestoreCron] CRON_SECRET is not set. Route is unprotected.");
    return true;
  }
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/cron/paid-restore
 *
 * Called by Vercel Cron every hour.
 * Also callable manually (with Authorization header) for testing.
 *
 * Policy:
 *   Finds all customers whose status is `overdue` or `suspended` but who have
 *   a paid bill for the **current billing cycle** (year + month). For each:
 *     1. Fetch their plan's speed profile.
 *     2. Re-enable PPPoE secret on MikroTik if they were suspended.
 *     3. Change MikroTik profile back to their paid plan's speed.
 *     4. Disconnect active session to force reconnect with restored speed.
 *     5. Update customer: status → "active", due_date → now + 30 days.
 *     6. Write activity log.
 *
 * This is intentionally idempotent — running twice produces no duplicate changes
 * because customers restored in step 5 move to "active" and are excluded from
 * the next query.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  console.log(`[PaidRestoreCron] ▶ Starting paid-restore at ${now.toISOString()}`);

  try {
    const supabase = createSupabaseServerClient();

    // ── 1. Find overdue/suspended customers that have a paid bill this cycle ──
    const { data: candidates, error: fetchError } = await supabase
      .from("customers")
      .select(
        `id, full_name, pppoe_username, status, due_date, plan_id,
         plans ( id, speed ),
         bills ( id, billing_year, billing_month, status )`
      )
      .in("status", ["overdue", "suspended"]);

    if (fetchError) throw fetchError;

    if (!candidates || candidates.length === 0) {
      console.log("[PaidRestoreCron] ✅ No overdue/suspended customers. Nothing to do.");
      return NextResponse.json({
        message: "No overdue/suspended customers found.",
        processed: 0,
        restored: 0,
        skipped: 0,
        errors: [],
      });
    }

    // Filter to only those with a paid bill this cycle
    const toRestore = candidates.filter((customer) => {
      const bills: any[] = (customer.bills as any[]) ?? [];
      return bills.some(
        (b) =>
          b.billing_year === currentYear &&
          b.billing_month === currentMonth &&
          b.status === "paid"
      );
    });

    if (toRestore.length === 0) {
      console.log(
        `[PaidRestoreCron] ✅ ${candidates.length} overdue/suspended customer(s) found but none paid this cycle. Nothing to restore.`
      );
      return NextResponse.json({
        message: "No customers to restore.",
        processed: candidates.length,
        restored: 0,
        skipped: candidates.length,
        errors: [],
      });
    }

    console.log(`[PaidRestoreCron] Found ${toRestore.length} customer(s) to restore.`);

    // ── 2. Process each candidate ─────────────────────────────────────────────
    let restored = 0;
    let skipped = 0;
    const errors: Array<{ pppoe_username: string; error: string }> = [];

    // New due date: 30 days from now
    const newDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    for (const customer of toRestore) {
      const pppoeUsername: string = customer.pppoe_username;
      const previousStatus: string = customer.status;
      const plan = (customer.plans as unknown as { id: string; speed: string } | null);

      // Determine the speed profile to restore.
      // Fall back to "default" if plan data is missing or is the expired profile.
      const targetProfile =
        plan?.speed && plan.speed !== "Expired-Profile" ? plan.speed : "default";

      console.log(
        `[PaidRestoreCron] 🔄 Restoring ${pppoeUsername} (was: ${previousStatus}, profile: ${targetProfile})`
      );

      try {
        // ── 2a. Re-enable PPPoE secret if customer was suspended ─────────────
        if (previousStatus === "suspended") {
          try {
            await enablePPPoE(pppoeUsername);
          } catch (mikrotikErr) {
            if (
              mikrotikErr instanceof MikrotikError &&
              mikrotikErr.code === "NOT_FOUND"
            ) {
              console.warn(
                `[PaidRestoreCron] ⚠ PPPoE secret not found for ${pppoeUsername} — skipping enablePPPoE.`
              );
            } else {
              throw mikrotikErr;
            }
          }
        }

        // ── 2b. Restore the paid plan's speed profile on MikroTik ────────────
        try {
          await changePPPoEProfile(pppoeUsername, targetProfile);

          // ── 2c. Kick the active session so reconnect picks up new profile ──
          try {
            await disconnectPPPoE(pppoeUsername);
          } catch {
            // User may already be offline — not an error
            console.log(
              `[PaidRestoreCron] Session disconnect skipped for ${pppoeUsername} (likely offline).`
            );
          }
        } catch (mikrotikErr) {
          if (
            mikrotikErr instanceof MikrotikError &&
            mikrotikErr.code === "NOT_FOUND"
          ) {
            console.warn(
              `[PaidRestoreCron] ⚠ PPPoE secret not found for ${pppoeUsername} — skipping profile change.`
            );
          } else {
            throw mikrotikErr;
          }
        }

        // ── 2d. Update customer record ────────────────────────────────────────
        const updatePayload: Record<string, unknown> = {
          status: "active",
          due_date: newDueDate,
        };

        // Restore the original plan_id if the customer was moved to the Expired plan
        if (plan?.id && customer.plan_id !== plan.id) {
          updatePayload.plan_id = plan.id;
        }

        await supabase
          .from("customers")
          .update(updatePayload)
          .eq("id", customer.id);

        // ── 2e. Write activity log ────────────────────────────────────────────
        await writeLog({
          event_type: "status_change",
          description: `Auto-restored ${customer.full_name} (${pppoeUsername}) to active — paid bill detected for ${currentMonth}/${currentYear}. Profile set to ${targetProfile}. Next due: ${newDueDate.split("T")[0]}.`,
          pppoe_username: pppoeUsername,
          customer_name: customer.full_name,
          metadata: {
            previousStatus,
            newStatus: "active",
            profile: targetProfile,
            newDueDate,
            billingYear: currentYear,
            billingMonth: currentMonth,
          },
        });

        console.log(
          `[PaidRestoreCron] ✅ Restored ${pppoeUsername} (${previousStatus} → active).`
        );
        restored++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[PaidRestoreCron] ❌ Error restoring ${pppoeUsername}: ${errMsg}`);
        errors.push({ pppoe_username: pppoeUsername, error: errMsg });
      }
    }

    // ── 3. Invalidate caches so admin UI reflects new statuses ────────────────
    if (restored > 0) {
      await cache.del("dashboard:stats");
      await cache.invalidatePattern("customers:*");
      console.log("[PaidRestoreCron] 🗑 Caches invalidated.");
    }

    // ── 4. Summary log ────────────────────────────────────────────────────────
    console.log(
      `[PaidRestoreCron] ✅ Done. ${restored} restored, ${skipped} skipped, ${errors.length} error(s).`
    );

    return NextResponse.json({
      message: `Paid-restore complete. ${restored} restored, ${skipped} skipped, ${errors.length} error(s).`,
      runAt: now.toISOString(),
      evaluated: toRestore.length,
      restored,
      skipped,
      errorCount: errors.length,
      errors,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Paid-restore cron job failed.";
    console.error("[PaidRestoreCron] Fatal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
