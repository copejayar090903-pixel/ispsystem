import { syncWorker } from "./sync-worker";
import { mikrotikSyncQueue, addSyncJob } from "./queue";

console.log("[Worker] Starting background processes...");

async function initRepeatableJobs() {
  try {
    const repeatableJobs = await mikrotikSyncQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await mikrotikSyncQueue.removeRepeatableByKey(job.key);
    }

    await addSyncJob("full-sync", {}, {
      repeat: {
        every: 5 * 60 * 1000
      }
    });

    console.log("[Worker] Registered repeatable 'full-sync' job (runs every 5 minutes).");
  } catch (err) {
    console.error("[Worker] Error setting up repeatable jobs:", err);
  }
}

async function runInitialSync() {
  console.log("[Worker] Triggering initial startup sync job...");
  await addSyncJob("full-sync");
}

syncWorker.on("ready", () => {
  console.log("[Worker] BullMQ Worker is ready and listening.");
});

initRepeatableJobs().then(() => runInitialSync());
