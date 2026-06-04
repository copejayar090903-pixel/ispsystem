import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { reason, adminId } = (await request.json()) as { reason?: string; adminId?: string };

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("payments")
      .update({
        status: "rejected",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: "Payment rejected." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reject payment." },
      { status: 500 },
    );
  }
}
