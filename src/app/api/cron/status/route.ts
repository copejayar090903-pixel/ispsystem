import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/cron/status
 *
 * Returns a preview of:
 * - All customers whose due_date has passed and will be affected on the next cron run
 * - The configured cron schedule
 * - Whether CRON_SECRET is configured
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const SUSPENSION_THRESHOLD_DAYS = 5;

    // Fetch customers whose due_date has passed and aren't already fully suspended
    const { data: candidates, error } = await supabase
      .from("customers")
      .select(
        `id, full_name, pppoe_username, status, due_date, plan_id,
         plans ( plan_name, speed ),
         bills ( id, billing_year, billing_month, status )`
      )
      .in("status", ["active", "overdue", "suspended"])
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });

    if (error) throw error;

    const CRON_SECRET_SET = !!process.env.CRON_SECRET;

    // Classify each candidate
    const classified = (candidates ?? []).map((customer) => {
      const bills: any[] = (customer.bills as any[]) ?? [];
      const dueDate = new Date(customer.due_date as string);
      const msOverdue = now.getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(msOverdue / (1000 * 60 * 60 * 24));

      // Check if paid this cycle
      const paidThisCycle = bills.some(
        (b) =>
          b.billing_year === currentYear &&
          b.billing_month === currentMonth &&
          b.status === "paid"
      );

      let projectedAction: "skip_paid" | "skip_not_due" | "mark_overdue" | "suspend" | "already_suspended" = "skip_not_due";

      if (daysOverdue < 0) {
        projectedAction = "skip_not_due";
      } else if (paidThisCycle) {
        projectedAction = "skip_paid";
      } else if (customer.status === "suspended" && daysOverdue > SUSPENSION_THRESHOLD_DAYS) {
        projectedAction = "already_suspended";
      } else if (daysOverdue > SUSPENSION_THRESHOLD_DAYS) {
        projectedAction = "suspend";
      } else {
        projectedAction = "mark_overdue";
      }

      return {
        id: customer.id,
        full_name: customer.full_name,
        pppoe_username: customer.pppoe_username,
        currentStatus: customer.status,
        due_date: customer.due_date,
        daysOverdue: Math.max(0, daysOverdue),
        paidThisCycle,
        projectedAction,
        plan: (customer.plans as any)?.plan_name ?? "—",
        speed: (customer.plans as any)?.speed ?? "—",
      };
    });

    // Split into will-be-affected vs not
    const willBeAffected = classified.filter(
      (c) => c.projectedAction === "mark_overdue" || c.projectedAction === "suspend"
    );
    const skipped = classified.filter(
      (c) => c.projectedAction === "skip_paid" || c.projectedAction === "already_suspended"
    );
    const notDue = classified.filter((c) => c.projectedAction === "skip_not_due");

    return NextResponse.json({
      generatedAt: now.toISOString(),
      cronSecretConfigured: CRON_SECRET_SET,
      schedule: {
        daily: "0 0 * * * (midnight UTC)",
        hourly: "0 * * * * (every hour UTC)",
        suspensionThresholdDays: SUSPENSION_THRESHOLD_DAYS,
      },
      summary: {
        totalCustomers: classified.length,
        willBeAffected: willBeAffected.length,
        skipped: skipped.length,
        notDueYet: notDue.length,
      },
      willBeAffected,
      skipped,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch cron status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
