import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [customersRes, plansRes, billingsRes, paymentsRes] = await Promise.all([
      supabase.from("customers").select("status").throwOnError(),
      supabase.from("plans").select("id").throwOnError(),
      supabase.from("bills").select("status").throwOnError(),
      supabase.from("payments").select("status").throwOnError(),
    ]);

    const customers = customersRes.data ?? [];
    const bills = billingsRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const stats = {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((c) => (c as { status: string }).status === "active").length,
      disconnectedCustomers: customers.filter((c) => (c as { status: string }).status === "disconnected").length,
      overdueAccounts: customers.filter((c) => (c as { status: string }).status === "overdue").length,
      pendingPayments: payments.filter((p) => (p as { status: string }).status === "pending").length,
      totalPlans: (plansRes.data ?? []).length,
      paidBills: bills.filter((b) => (b as { status: string }).status === "paid").length,
      unpaidBills: bills.filter((b) => (b as { status: string }).status === "unpaid").length,
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch dashboard stats." },
      { status: 500 },
    );
  }
}
