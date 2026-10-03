import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/expenses — List all expenses, optionally filtered by year/month
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = req.nextUrl;
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    let query = supabase
      .from("expenses")
      .select("*")
      .order("billing_year", { ascending: false })
      .order("billing_month", { ascending: false })
      .order("created_at", { ascending: false });

    if (year) query = query.eq("billing_year", parseInt(year, 10));
    if (month) query = query.eq("billing_month", parseInt(month, 10));

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ expenses: data ?? [] });
  } catch (error) {
    console.error("[GET Expenses Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load expenses." },
      { status: 500 }
    );
  }
}

// POST /api/expenses — Create a new expense
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json();

    const { name, category, amount, billing_year, billing_month, notes } = body;

    const numAmount = Number(amount);
    const numYear = Number(billing_year);
    const numMonth = Number(billing_month);

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Expense name is required." },
        { status: 400 }
      );
    }

    if (isNaN(numAmount) || numAmount < 0) {
      return NextResponse.json(
        { error: "Amount must be a valid number greater than or equal to 0." },
        { status: 400 }
      );
    }

    if (!numYear || isNaN(numYear) || !numMonth || isNaN(numMonth) || numMonth < 1 || numMonth > 12) {
      return NextResponse.json(
        { error: "Valid billing year and month (1-12) are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        name: name.trim(),
        category: category || "operational",
        amount: numAmount,
        billing_year: numYear,
        billing_month: numMonth,
        notes: notes ? String(notes).trim() : null,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST Expenses Supabase Error]:", error);
      return NextResponse.json(
        { error: error.message || "Database failed to save expense." },
        { status: 500 }
      );
    }

    return NextResponse.json({ expense: data }, { status: 201 });
  } catch (error) {
    console.error("[POST Expenses Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create expense." },
      { status: 500 }
    );
  }
}

// DELETE /api/expenses — Delete an expense by id (passed as query param)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing expense ID." }, { status: 400 });
    }

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE Expenses Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete expense." },
      { status: 500 }
    );
  }
}
