import { syncWorker } from "./sync-worker";
import { reminderWorker } from "./reminder-worker";
import { mikrotikSyncQueue, billingReminderQueue, addSyncJob, addReminderJob } from "./queue";

console.log("[Worker] Starting background processes...");

async function initRepeatableJobs() {
  try {
    // ── MikroTik Sync — every 5 minutes ─────────────────────────────────────
    const syncRepeatableJobs = await mikrotikSyncQueue.getRepeatableJobs();
    for (const job of syncRepeatableJobs) {
      await mikrotikSyncQueue.removeRepeatableByKey(job.key);
    }

    await addSyncJob("full-sync", {}, {
      repeat: {
        every: 5 * 60 * 1000,
      },
    });

    console.log("[Worker] Registered 'full-sync' job (every 5 minutes).");

    // ── Billing Reminders — every minute (time-check is done inside the job) ─
    const reminderRepeatableJobs = await billingReminderQueue.getRepeatableJobs();
    for (const job of reminderRepeatableJobs) {
      await billingReminderQueue.removeRepeatableByKey(job.key);
    }

    await addReminderJob("send-reminders", {}, {
      repeat: {
        pattern: "* * * * *", // fires every minute; the handler checks the configured hour/minute
      },
    });

    console.log("[Worker] Registered 'send-reminders' job (every minute — time-gated).");
  } catch (err) {
    console.error("[Worker] Error setting up repeatable jobs:", err);
  }
}

async function runInitialSync() {
  console.log("[Worker] Triggering initial startup sync job...");
  await addSyncJob("full-sync");
}

syncWorker.on("ready", () => {
  console.log("[Worker] MikroTik sync worker ready.");
});

reminderWorker.on("ready", () => {
  console.log("[Worker] Billing reminder worker ready.");
});

initRepeatableJobs().then(() => runInitialSync());
