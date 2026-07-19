import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const mikrotikSyncQueue = new Queue("mikrotik-sync", {
  connection: {
    url: REDIS_URL,
  },
});

export async function addSyncJob(name: string, data: any = {}, opts: any = {}) {
  try {
    await mikrotikSyncQueue.add(name, data, opts);
    console.log(`[Queue] Added job: ${name}`);
  } catch (err) {
    console.error(`[Queue] Failed to add job ${name}:`, err);
  }
}
