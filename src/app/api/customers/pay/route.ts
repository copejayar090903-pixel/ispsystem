import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { changePPPoEProfile, disconnectPPPoE } from "@/src/lib/mikrotik";
import { cache } from "@/src/lib/redis";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { username } = (await request.json()) as { username?: string };

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // 1. Fetch customer from database
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("pppoe_username", username)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: "Customer not found in database." }, { status: 404 });
    }

    let planId = customer.plan_id;
    let targetProfile = "default";
    let planFoundAndValid = false;
    let monthlyFee = 0;

    // 2. Determine target speed profile and plan details
    if (planId) {
      const { data: plan } = await supabase
        .from("plans")
        .select("speed, monthly_fee")
        .eq("id", planId)
        .single();
      if (plan && plan.speed && plan.speed !== "Expired-Profile") {
        targetProfile = plan.speed;
        monthlyFee = Number(plan.monthly_fee || 0);
        planFoundAndValid = true;
      }
    }

    if (!planFoundAndValid) {
      // If customer has no plan or their plan speed is Expired-Profile, try to find "PLAN 700"
      const { data: plan700 } = await supabase
        .from("plans")
        .select("id, speed, monthly_fee")
        .ilike("plan_name", "%PLAN 700%")
        .limit(1)
        .maybeSingle();

      if (plan700) {
        planId = plan700.id;
        targetProfile = plan700.speed;
        monthlyFee = Number(plan700.monthly_fee || 0);
      } else {
        // Fallback profile if no PLAN 700 exists
        targetProfile = "30mbps";
        monthlyFee = 700;
      }
    }

    // 3. Restore profile on MikroTik (away from Expired-Profile)
    let mikrotikSyncError = null;
    try {
      await changePPPoEProfile(username, targetProfile);

      // Kick the active connection so they reconnect with their restored plan profile immediately
      try {
        await disconnectPPPoE(username);
      } catch (e) {
        console.log("Failed to disconnect active session (user might not be currently online):", e);
      }
    } catch (e) {
      console.error("MikroTik sync failed during payment processing:", e);
      mikrotikSyncError = e instanceof Error ? e.message : String(e);
    }

    // 4. Calculate new due date (30 days from today)
    const newDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 5. Create or update bill, and insert payment record
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed
    const pad = (n: number) => String(n).padStart(2, "0");
    const maxDay = new Date(year, month, 0).getDate();
    const firstDayStr = `${year}-${pad(month)}-01`;
    const lastDayStr = `${year}-${pad(month)}-${pad(maxDay)}`;

    // Try to find if a bill already exists for this customer for the current month/year
    const { data: existingBill } = await supabase
      .from("bills")
      .select("id, status")
      .eq("customer_id", customer.id)
      .eq("billing_year", year)
      .eq("billing_month", month)
      .maybeSingle();

    let billId = existingBill?.id;
    if (existingBill) {
      // Update bill to paid
      await supabase
        .from("bills")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", existingBill.id);
    } else {
      // Insert new paid bill
      const { data: newBill, error: billError } = await supabase
        .from("bills")
        .insert({
          customer_id: customer.id,
          billing_year: year,
          billing_month: month,
          billing_period_start: firstDayStr,
          billing_period_end: lastDayStr,
          due_date: newDueDate,
          amount_due: monthlyFee,
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      
      if (!billError && newBill) {
        billId = newBill.id;
      }
    }

    if (billId) {
      // Insert payment record
      await supabase
        .from("payments")
        .insert({
          customer_id: customer.id,
          billing_id: billId,
          method: "cash",
          amount_paid: monthlyFee,
          status: "verified",
          submitted_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
        });
    }

    // 6. Update customer record in Supabase
    const { data: updatedCustomer, error: updateError } = await supabase
      .from("customers")
      .update({
        status: "active",
        due_date: newDueDate,
        plan_id: planId,
      })
      .eq("id", customer.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Invalidate caches
    await cache.del("dashboard:stats");
    await cache.invalidatePattern("customers:*");

    // Write activity log
    await writeLog({
      event_type: "payment",
      description: `Payment recorded for ${customer.full_name ?? username}. Next due: ${newDueDate.split("T")[0]}.`,
      pppoe_username: username,
      customer_name: customer.full_name ?? null,
      metadata: { amount: monthlyFee, new_due_date: newDueDate, mikrotik_error: mikrotikSyncError ?? null },
    });

    return NextResponse.json({
      ok: true,
      customer: updatedCustomer,
      warning: mikrotikSyncError
        ? `Payment saved to database, but MikroTik router was unreachable: ${mikrotikSyncError}. Router will sync automatically once online.`
        : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process payment." },
      { status: 500 },
    );
  }
}
