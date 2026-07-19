import { Worker } from "bullmq";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  getPPPoESecrets,
  getActivePPPoESessions,
  changePPPoEProfile,
  disconnectPPPoE,
} from "../lib/mikrotik";

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in worker.");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Write an activity log entry — non-fatal. */
async function log(
  event_type: string,
  description: string,
  opts?: { pppoe_username?: string; customer_name?: string; metadata?: Record<string, unknown> }
) {
  try {
    await supabase.from("activity_logs").insert({
      event_type,
      description,
      pppoe_username: opts?.pppoe_username ?? null,
      customer_name:  opts?.customer_name ?? null,
      metadata:       opts?.metadata ?? null,
    });
  } catch (e) {
    console.warn("[Worker] Failed to write activity log:", e);
  }
}

export const syncWorker = new Worker(
  "mikrotik-sync",
  async (job) => {
    console.log(`[Worker] Starting job: ${job.name} (id: ${job.id})`);

    try {
      if (job.name === "full-sync") {
        await handleFullSync();
      } else {
        console.warn(`[Worker] Unknown job name: ${job.name}`);
      }
    } catch (err) {
      console.error(`[Worker] Job ${job.name} failed:`, err);
      throw err;
    }
  },
  {
    connection: {
      url: REDIS_URL,
    },
    concurrency: 1,
  }
);

syncWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job?.name} (id: ${job?.id}) completed successfully.`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.name} (id: ${job?.id}) failed:`, err);
});

async function handleFullSync() {
  console.log("[Worker] Performing full MikroTik ↔ Supabase sync...");

  // 1. Fetch from database
  const { data: dbCustomers, error: custErr } = await supabase
    .from("customers")
    .select("*, plans(*)")
    .order("created_at", { ascending: false });

  const { data: plans, error: plansErr } = await supabase
    .from("plans")
    .select("*");

  if (custErr || !dbCustomers) throw new Error(`DB Customers query failed: ${custErr?.message}`);
  if (plansErr || !plans) throw new Error(`DB Plans query failed: ${plansErr?.message}`);

  // 2. Fetch from MikroTik (gracefully catch errors)
  let secrets: any[] = [];
  let activeSessions: any[] = [];
  try {
    secrets = await getPPPoESecrets();
    activeSessions = await getActivePPPoESessions();
  } catch (err) {
    console.error("[Worker] Failed to reach MikroTik router. Sync aborted.", err);
    await log("sync_error", "Background sync failed — MikroTik router unreachable.", {
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  let didUpdate = false;

  // A. Auto-import new active sessions that are not in DB
  const unsynced = activeSessions.filter((session) => {
    const username = session.user || session.name || "";
    return !dbCustomers.some((c) => c.pppoe_username === username);
  });

  if (unsynced.length > 0) {
    for (const session of unsynced) {
      const username = session.user || session.name || "";
      const secret = secrets.find((s) => s.name === username);
      const selectedPlan = plans.find((p) => p.speed === secret?.profile);

      try {
        console.log(`[Worker] Auto-syncing new customer: ${username}`);
        
        let isUnique = false;
        let accountNumber = "";
        while (!isUnique) {
          accountNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
          const { data } = await supabase.from("customers").select("id").eq("account_number", accountNumber).limit(1);
          if (!data || data.length === 0) isUnique = true;
        }

        const payload = {
          account_number: accountNumber,
          full_name: secret?.comment?.trim() || username,
          contact_number: "-",
          email: null,
          pppoe_username: username,
          plan_id: selectedPlan?.id || null,
          status: secret?.disabled === "true"
            ? "inactive"
            : secret?.profile === "Expired-Profile"
              ? "unpaid"
              : "active",
          address: secret?.comment || null,
          installation_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const { error } = await supabase.from("customers").upsert(payload, { onConflict: "pppoe_username" });
        if (error) console.error(`[Worker] Failed to upsert unsynced user ${username}:`, error.message);
        else didUpdate = true;
      } catch (e) {
        console.error(`[Worker] Auto-sync failed for ${username}:`, e);
      }
    }
  }

  // B. Sync status of existing customers if they are on Expired-Profile or moved away
  const statusMismatches = dbCustomers.filter((customer) => {
    const secret = secrets.find((s) => s.name === customer.pppoe_username);
    if (!secret) return false;

    const shouldBeUnpaid = secret.profile === "Expired-Profile";
    if (shouldBeUnpaid && customer.status !== "unpaid") return true;
    if (!shouldBeUnpaid && customer.status === "unpaid") return true;
    return false;
  });

  if (statusMismatches.length > 0) {
    for (const customer of statusMismatches) {
      const secret = secrets.find((s) => s.name === customer.pppoe_username);
      const shouldBeUnpaid = secret?.profile === "Expired-Profile";

      try {
        console.log(`[Worker] Syncing status mismatch for: ${customer.pppoe_username} (shouldBeUnpaid: ${shouldBeUnpaid})`);
        const { error } = await supabase
          .from("customers")
          .update({ status: shouldBeUnpaid ? "unpaid" : "active" })
          .eq("id", customer.id);
        if (error) console.error(`[Worker] Failed to update customer ${customer.pppoe_username} status:`, error.message);
        else didUpdate = true;
      } catch (e) {
        console.error(`[Worker] Failed to sync status for ${customer.pppoe_username}:`, e);
      }
    }
  }

  // C. Auto-expire customers whose due date has passed
  const overdueActiveCustomers = dbCustomers.filter((customer) => {
    if (!customer.due_date) return false;

    const secret = secrets.find((s) => s.name === customer.pppoe_username);
    if (!secret || secret.profile === "Expired-Profile" || secret.disabled === "true") return false;

    const dueDate = new Date(customer.due_date);
    const today = new Date();

    return dueDate.getTime() <= today.getTime();
  });

  if (overdueActiveCustomers.length > 0) {
    const expiredPlan = plans.find((p) => p.speed === "Expired-Profile");
    for (const customer of overdueActiveCustomers) {
      try {
        console.log(`[Worker] Auto-expiring customer ${customer.pppoe_username} (due date was ${customer.due_date})`);
        
        await changePPPoEProfile(customer.pppoe_username, "Expired-Profile");

        let disconnected = false;
        try {
          await disconnectPPPoE(customer.pppoe_username);
          disconnected = true;
        } catch (err) {
          console.log(`[Worker] User ${customer.pppoe_username} is offline; skipped disconnection.`);
        }

        const { error } = await supabase
          .from("customers")
          .update({
            status: "unpaid",
            plan_id: expiredPlan?.id || customer.plan_id,
          })
          .eq("id", customer.id);

        if (error) {
          console.error(`[Worker] Failed to mark customer ${customer.pppoe_username} expired in DB:`, error.message);
        } else {
          didUpdate = true;
          await log("auto_expired",
            `Customer ${customer.full_name ?? customer.pppoe_username} auto-expired (due ${customer.due_date}). ${disconnected ? "Session disconnected." : "Was already offline."}`,
            {
              pppoe_username: customer.pppoe_username,
              customer_name:  customer.full_name ?? null,
              metadata: { due_date: customer.due_date, disconnected },
            }
          );
        }
      } catch (e) {
        console.error(`[Worker] Auto-expiration failed for ${customer.pppoe_username}:`, e);
      }
    }
  }

  if (didUpdate) {
    console.log("[Worker] Changes detected. Invalidating API cache keys...");
    try {
      const RedisClient = require("ioredis");
      const client = new RedisClient(REDIS_URL);
      await client.del("dashboard:stats");
      await client.del("customers:list");
      await client.quit();
    } catch (e) {
      console.warn("[Worker] Failed to clear Redis cache keys:", e);
    }
    await log("sync_complete", `Sync complete — changes applied to ${overdueActiveCustomers.length} customer(s).`, {
      metadata: { expired: overdueActiveCustomers.length },
    });
  } else {
    console.log("[Worker] Full sync complete. No changes needed.");
    await log("sync_complete", "Background sync complete — no changes needed.");
  }
}
