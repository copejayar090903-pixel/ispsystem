import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { changePPPoEProfile, disconnectPPPoE } from "@/src/lib/mikrotik";

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

    // 2. Determine target speed profile
    if (planId) {
      const { data: plan } = await supabase
        .from("plans")
        .select("speed")
        .eq("id", planId)
        .single();
      if (plan && plan.speed && plan.speed !== "Expired-Profile") {
        targetProfile = plan.speed;
        planFoundAndValid = true;
      }
    }

    if (!planFoundAndValid) {
      // If customer has no plan or their plan speed is Expired-Profile, try to find "PLAN 700"
      const { data: plan700 } = await supabase
        .from("plans")
        .select("id, speed")
        .ilike("plan_name", "%PLAN 700%")
        .limit(1)
        .maybeSingle();

      if (plan700) {
        planId = plan700.id;
        targetProfile = plan700.speed;
      } else {
        // Fallback profile if no PLAN 700 exists
        targetProfile = "30mbps";
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
    const newDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // 5. Update customer record in Supabase
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
