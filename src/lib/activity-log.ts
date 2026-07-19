import { createSupabaseServerClient } from "./supabase";

export type LogEventType =
  | "auto_expired"
  | "payment"
  | "customer_created"
  | "customer_updated"
  | "status_change"
  | "sync_complete"
  | "sync_error"
  | "disconnect"
  | "enable"
  | "disable"
  | "login"
  | "system";

export interface WriteLogOptions {
  event_type: LogEventType;
  description: string;
  pppoe_username?: string | null;
  customer_name?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write an activity log entry to Supabase.
 * Silently swallows errors so log failures never break the primary action.
 */
export async function writeLog(opts: WriteLogOptions): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.from("activity_logs").insert({
      event_type:    opts.event_type,
      description:   opts.description,
      pppoe_username: opts.pppoe_username ?? null,
      customer_name:  opts.customer_name ?? null,
      metadata:       opts.metadata ?? null,
    });
  } catch (err) {
    // Non-fatal — logging should never break a real action
    console.warn("[ActivityLog] Failed to write log:", err);
  }
}
