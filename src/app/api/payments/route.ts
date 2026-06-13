import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    
    // Select all payments with customer and billing relationships
    const { data: payments, error } = await supabase
      .from("payments")
      .select(`
        *,
        customers (
          id,
          full_name,
          account_number,
          pppoe_username
        ),
        bills (
          id,
          billing_year,
          billing_month,
          amount_due,
          status
        )
      `)
      .order("submitted_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(payments || []);
  } catch (error: any) {
    console.error("[GET Payments Route Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payments." },
      { status: 500 }
    );
  }
}
