import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createSupabaseServerClient();

    const payment = await supabase
      .from("payments")
      .select(`
        *,
        customers (
          id,
          full_name,
          account_number,
          pppoe_username,
          email
        ),
        bills (
          id,
          billing_year,
          billing_month,
          amount_due,
          status
        )
      `)
      .eq("id", id)
      .single();

    if (!payment.data) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    return NextResponse.json(payment.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payment." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete payment." },
      { status: 500 }
    );
  }
}
