import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export type ReminderScheduleConfig = {
  enabled: boolean;
  hour: number;       // 0–23
  minute: number;     // 0–59
  daysBeforeDue: number;
  channels: ("email" | "sms")[];
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const SETTINGS_KEY = "reminder_schedule";

const DEFAULT_CONFIG: ReminderScheduleConfig = {
  enabled: false,
  hour: 8,
  minute: 0,
  daysBeforeDue: 3,
  channels: ["email", "sms"],
  lastRunAt: null,
  nextRunAt: null,
};

/**
 * GET /api/billing/reminders/settings
 * Returns the current reminder schedule configuration.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("settings")
      .select("value, updated_at")
      .eq("key", SETTINGS_KEY)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const config: ReminderScheduleConfig = data?.value ?? DEFAULT_CONFIG;

    return NextResponse.json({
      config,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error: any) {
    console.error("[ReminderSettings GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch reminder settings." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/billing/reminders/settings
 * Saves the reminder schedule configuration.
 * Body: Partial<ReminderScheduleConfig>
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createSupabaseServerClient();

    // Fetch current config first
    const { data: existing } = await supabase
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .single();

    const current: ReminderScheduleConfig = existing?.value ?? DEFAULT_CONFIG;

    // Merge only known fields (validate & sanitise)
    const updated: ReminderScheduleConfig = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      hour: typeof body.hour === "number" && body.hour >= 0 && body.hour <= 23
        ? Math.floor(body.hour) : current.hour,
      minute: typeof body.minute === "number" && body.minute >= 0 && body.minute <= 59
        ? Math.floor(body.minute) : current.minute,
      daysBeforeDue: typeof body.daysBeforeDue === "number" && body.daysBeforeDue >= 1
        ? Math.floor(body.daysBeforeDue) : current.daysBeforeDue,
      channels: Array.isArray(body.channels)
        ? body.channels.filter((c: string) => ["email", "sms"].includes(c))
        : current.channels,
      lastRunAt: body.lastRunAt !== undefined ? body.lastRunAt : current.lastRunAt,
      nextRunAt: body.nextRunAt !== undefined ? body.nextRunAt : current.nextRunAt,
    };

    const { error } = await supabase
      .from("settings")
      .upsert(
        { key: SETTINGS_KEY, value: updated, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) throw error;

    console.log("[ReminderSettings] Config updated:", updated);

    return NextResponse.json({ success: true, config: updated });
  } catch (error: any) {
    console.error("[ReminderSettings PATCH] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save reminder settings." },
      { status: 500 }
    );
  }
}
