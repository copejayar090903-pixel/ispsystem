import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type   = searchParams.get("type");
    const limit  = Math.min(Number(searchParams.get("limit") ?? "200"), 500);
    const offset = Number(searchParams.get("offset") ?? "0");

    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type && type !== "all") {
      query = query.eq("event_type", type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch logs." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_type, pppoe_username, customer_name, description, metadata } = body;

    if (!event_type || !description) {
      return NextResponse.json({ error: "event_type and description are required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("activity_logs")
      .insert({ event_type, pppoe_username, customer_name, description, metadata })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ log: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to insert log." },
      { status: 500 }
    );
  }
}
