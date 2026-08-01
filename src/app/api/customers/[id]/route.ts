import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { cache } from "@/src/lib/redis";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

// ─── GET /api/customers/[id] ─────────────────────────────────────────────────
// Returns full customer details: profile, plan, billing history, payment history.
// Accepts either a UUID (customer.id) or a 9-digit account_number as [id].
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Customer id is required." }, { status: 400 });
    }

    const cacheKey = `customers:detail:${id}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const supabase = createSupabaseServerClient();

    // Support lookup by UUID or account_number (9-digit string)
    const isAccountNumber = /^\d{7,12}$/.test(id);

    const query = supabase
      .from("customers")
      .select("*, plans(id, plan_name, speed, monthly_fee)")
      .limit(1);

    const { data: customer, error: customerError } = isAccountNumber
      ? await query.eq("account_number", id).single()
      : await query.eq("id", id).single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // ── Billing history (most recent 24 months) ───────────────────────────
    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select(
        "id, billing_year, billing_month, billing_period_start, billing_period_end, due_date, amount_due, status, paid_at, created_at",
      )
      .eq("customer_id", customer.id)
      .order("billing_year", { ascending: false })
      .order("billing_month", { ascending: false })
      .limit(24);

    if (billsError) {
      console.warn("[GET /api/customers/[id]] bills error:", billsError.message);
    }

    // ── Payment history (most recent 24) ─────────────────────────────────
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select(
        "id, billing_id, method, reference_number, amount_paid, status, submitted_at, reviewed_at",
      )
      .eq("customer_id", customer.id)
      .order("submitted_at", { ascending: false })
      .limit(24);

    if (paymentsError) {
      console.warn("[GET /api/customers/[id]] payments error:", paymentsError.message);
    }

    // ── Derived summary fields ─────────────────────────────────────────────
    const allBills = bills ?? [];
    const allPayments = payments ?? [];

    const totalBilled = allBills.reduce(
      (sum, b: any) => sum + Number(b.amount_due ?? 0),
      0,
    );
    const totalPaid = allBills
      .filter((b: any) => b.status === "paid")
      .reduce((sum, b: any) => sum + Number(b.amount_due ?? 0), 0);
    const outstanding = totalBilled - totalPaid;
    const unpaidBillCount = allBills.filter(
      (b: any) => b.status === "unpaid" || b.status === "overdue",
    ).length;

    const pendingPayment =
      allPayments.find((p: any) => p.status === "pending") ?? null;

    const response = {
      customer,
      bills: allBills,
      payments: allPayments,
      summary: {
        totalBilled,
        totalPaid,
        outstanding,
        unpaidBillCount,
        pendingPayment,
      },
    };

    // Cache for 30 seconds
    await cache.set(cacheKey, response, 30);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch customer details." },
      { status: 500 },
    );
  }
}

// ─── DELETE /api/customers/[id] ──────────────────────────────────────────────
// Hard-deletes a customer record by UUID.
// Note: Cascading deletes for bills/payments should be configured at the DB level.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Customer id is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // Fetch the customer first so we can log who was deleted
    const { data: customer, error: fetchError } = await supabase
      .from("customers")
      .select("id, full_name, pppoe_username, account_number")
      .eq("id", id)
      .single();

    if (fetchError || !customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Invalidate caches
    await cache.del(`customers:detail:${id}`);
    await cache.del(`customers:detail:${customer.account_number}`);
    await cache.del("dashboard:stats");
    await cache.invalidatePattern("customers:*");

    await writeLog({
      event_type: "customer_updated",
      description: `Customer ${customer.full_name} (${customer.pppoe_username}) was deleted.`,
      pppoe_username: customer.pppoe_username ?? null,
      customer_name: customer.full_name ?? null,
    });

    return NextResponse.json({ success: true, deleted: customer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete customer." },
      { status: 500 },
    );
  }
}
