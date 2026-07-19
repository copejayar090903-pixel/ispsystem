import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import { cache } from "@/src/lib/redis";

export const runtime = "nodejs";

const CACHE_KEY = "plans:all";

export async function GET() {
  try {
    const cachedPlans = await cache.get<any>(CACHE_KEY);
    if (cachedPlans) {
      return NextResponse.json({ plans: cachedPlans });
    }

    const supabase = createSupabaseServerClient();
    const { data: plans, error } = await supabase
      .from("plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await cache.set(CACHE_KEY, plans, 300); // Cache for 5 mins

    return NextResponse.json({ plans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch plans.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const supabase = createSupabaseServerClient();

    const { id, plan_name, speed, monthly_fee } = payload;
    if (!plan_name || !speed || monthly_fee === undefined) {
      return NextResponse.json(
        { error: "Plan name, speed (MikroTik profile), and monthly fee are required." },
        { status: 400 },
      );
    }

    const planData = {
      plan_name: plan_name.trim(),
      speed: speed.trim(),
      monthly_fee: speed.trim() === "Expired-Profile" ? 0 : Number(monthly_fee),
    };

    let result;
    if (id) {
      // Update
      const { data, error } = await supabase
        .from("plans")
        .update(planData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      // Insert
      const { data, error } = await supabase
        .from("plans")
        .insert(planData)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Invalidate caches
    await cache.del(CACHE_KEY);
    await cache.del("dashboard:stats");

    return NextResponse.json({ plan: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Plan ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("plans").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invalidate caches
    await cache.del(CACHE_KEY);
    await cache.del("dashboard:stats");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
