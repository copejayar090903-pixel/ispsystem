import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [customersRes, billsRes, paymentsRes] = await Promise.all([
      supabase.from("customers").select("id, status, due_date").throwOnError(),
      supabase.from("bills").select("id, status, reminder_sent_at").throwOnError(),
      supabase.from("payments").select("id, status").eq("status", "pending").throwOnError(),
    ]);

    const rawCustomers = customersRes.data || [];
    const customers = rawCustomers.filter((c: any) => c.status !== "deleted" && !c.deleted_at);
    const bills = billsRes.data || [];
    const payments = paymentsRes.data || [];

    // Overdue count: overdue bills or overdue customer accounts
    const overdueBillsCount = bills.filter((b: any) => b.status === "overdue").length;
    const overdueCustCount = customers.filter((c: any) => c.status === "overdue").length;
    const overdueCount = overdueBillsCount > 0 ? overdueBillsCount : overdueCustCount;

    // Pending reminders: unpaid bills or bills without reminder
    const unpaidBills = bills.filter((b: any) => b.status === "unpaid");
    const pendingRemindersCount = unpaidBills.filter((b: any) => !b.reminder_sent_at).length || unpaidBills.length;

    // New/pending payments awaiting review
    const newPaymentsCount = payments.length;

    // Customers due within 3 days
    const deadlineCount = customers.filter((c: any) => {
      if (!c.due_date || c.status === "suspended" || c.status === "disconnected") return false;
      const d = new Date(c.due_date);
      return d >= now && d <= threeDaysFromNow;
    }).length;

    return NextResponse.json({
      overdueCustomers: overdueCount,
      pendingReminders: pendingRemindersCount,
      newPayments: newPaymentsCount,
      deadlineCount,
    });
  } catch (error) {
    console.error("[GET Notifications Error]:", error);
    return NextResponse.json(
      { overdueCustomers: 0, pendingReminders: 0, newPayments: 0, deadlineCount: 0 },
      { status: 200 }
    );
  }
}
