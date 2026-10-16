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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const date = searchParams.get("date"); // e.g. "2026-10-10"
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const supabase = createSupabaseServerClient();
    let query = supabase.from("activity_logs").delete();

    if (id) {
      query = query.eq("id", id);
    } else if (date) {
      // Delete all logs for the full 24-hour day in UTC/local range
      const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
      const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();
      query = query.gte("created_at", startOfDay).lte("created_at", endOfDay);
    } else if (startDate || endDate) {
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);
    } else {
      return NextResponse.json(
        { error: "Must provide 'id', 'date' (YYYY-MM-DD), or 'startDate'/'endDate' parameter." },
        { status: 400 }
      );
    }

    const { data, error, count } = await query.select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      deletedCount: data?.length ?? 0,
      deletedLogs: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete logs." },
      { status: 500 }
    );
  }
}
