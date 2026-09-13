import { Worker } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_PORT = process.env.PORT || "3000";

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * BullMQ Worker for "billing-reminders" queue.
 *
 * Handles jobs:
 *  - "send-reminders" : Checks the reminder_schedule settings and (if enabled & on schedule)
 *                       POSTs to /api/billing/reminders with the configured daysBeforeDue.
 *
 * This worker runs 24/7 via PM2 alongside the main sync-worker.
 */
export const reminderWorker = new Worker(
  "billing-reminders",
  async (job) => {
    console.log(`[ReminderWorker] Job: ${job.name} (id: ${job.id})`);

    if (job.name === "send-reminders") {
      await handleSendReminders();
    } else {
      console.warn(`[ReminderWorker] Unknown job: ${job.name}`);
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 1,
  }
);

reminderWorker.on("completed", (job) => {
  console.log(`[ReminderWorker] Job ${job?.name} (id: ${job?.id}) completed.`);
});

reminderWorker.on("failed", (job, err) => {
  console.error(`[ReminderWorker] Job ${job?.name} (id: ${job?.id}) failed:`, err);
});

async function handleSendReminders() {
  // 1. Load schedule config from DB
  const { data: settingRow, error: settingErr } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reminder_schedule")
    .single();

  if (settingErr || !settingRow) {
    console.log("[ReminderWorker] No reminder_schedule config found. Skipping.");
    return;
  }

  const config = settingRow.value as {
    enabled: boolean;
    hour: number;
    minute: number;
    daysBeforeDue: number;
    channels: string[];
    lastRunAt: string | null;
  };

  if (!config.enabled) {
    console.log("[ReminderWorker] Auto-reminders disabled. Skipping.");
    return;
  }

  // 2. Check if it's the right hour/minute (job fires every minute via cron "* * * * *")
  const now = new Date();
  // Use Philippine Time (UTC+8) for the schedule comparison
  const phtNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const currentHour = phtNow.getHours();
  const currentMinute = phtNow.getMinutes();

  if (currentHour !== config.hour || currentMinute !== config.minute) {
    // Not the right time — silently skip (happens every minute)
    return;
  }

  // 3. Fire the reminder API
  console.log(
    `[ReminderWorker] ⏰ Scheduled reminder time matched (${config.hour}:${String(config.minute).padStart(2, "0")} PHT). Firing reminders...`
  );

  try {
    const baseUrl = `http://localhost:${APP_PORT}`;
    const url = `${baseUrl}/api/billing/reminders?daysBeforeDue=${config.daysBeforeDue}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass enabled channels in body
        ...(process.env.REMINDER_CRON_SECRET
          ? { "x-cron-secret": process.env.REMINDER_CRON_SECRET }
          : {}),
      },
      body: JSON.stringify({ channels: config.channels }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error ?? `HTTP ${res.status}`);
    }

    const sentAt = new Date().toISOString();

    // 4. Update lastRunAt in settings
    await supabase
      .from("settings")
      .update({
        value: { ...config, lastRunAt: sentAt },
        updated_at: sentAt,
      })
      .eq("key", "reminder_schedule");

    console.log(
      `[ReminderWorker] ✅ Auto-reminders fired. Email: ${result.email?.sent ?? 0} sent, SMS: ${result.sms?.sent ?? 0} sent.`
    );

    // 5. Write activity log
    await supabase.from("activity_logs").insert({
      event_type: "auto_reminder_sent",
      description: `Scheduled billing reminders dispatched: ${result.email?.sent ?? 0} email, ${result.sms?.sent ?? 0} SMS.`,
      pppoe_username: null,
      customer_name: null,
      metadata: {
        emailSent: result.email?.sent ?? 0,
        smsSent: result.sms?.sent ?? 0,
        emailErrors: result.email?.errorCount ?? 0,
        smsErrors: result.sms?.errorCount ?? 0,
        daysBeforeDue: config.daysBeforeDue,
        channels: config.channels,
      },
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ReminderWorker] ❌ Failed to fire reminders:", msg);

    await supabase.from("activity_logs").insert({
      event_type: "auto_reminder_failed",
      description: `Scheduled billing reminder dispatch failed: ${msg}`,
      pppoe_username: null,
      customer_name: null,
      metadata: { error: msg },
    });
  }
}
