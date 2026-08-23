import { createSupabaseServerClient } from "@/src/lib/supabase";
import {
  changePPPoEProfile,
  enablePPPoE,
  disconnectPPPoE,
  MikrotikError,
} from "@/src/lib/mikrotik";
import { writeLog } from "@/src/lib/activity-log";
import { cache } from "@/src/lib/redis";

/**
 * Unified service function to restore a customer connection and extend their due date.
 * Typically triggered immediately when payment is verified (manual approval or PayMongo).
 *
 * @param customerId The UUID of the customer to restore.
 * @param newPlanId  Optional. If the customer paid for a different plan, pass its UUID here
 *                   to update their subscription and apply the new PPPoE speed profile.
 */
export async function restoreCustomer(customerId: string, newPlanId?: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const now = new Date();

  // 1. Fetch customer details with plan parameters
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select(`
      id,
      full_name,
      pppoe_username,
      status,
      due_date,
      plan_id,
      plans (
        id,
        speed
      )
    `)
    .eq("id", customerId)
    .single();

  if (fetchError || !customer) {
    throw new Error(`Customer lookup failed during restoration: ${fetchError?.message ?? "Customer not found."}`);
  }

  // If a new plan is being applied, update plan_id first and re-fetch the plan speed
  let plan = customer.plans as any;
  if (newPlanId && newPlanId !== customer.plan_id) {
    const { error: planUpdateError } = await supabase
      .from("customers")
      .update({ plan_id: newPlanId })
      .eq("id", customerId);

    if (planUpdateError) {
      throw new Error(`Failed to update customer plan: ${planUpdateError.message}`);
    }

    // Fetch the new plan's speed
    const { data: newPlan, error: planFetchError } = await supabase
      .from("plans")
      .select("id, speed")
      .eq("id", newPlanId)
      .single();

    if (planFetchError || !newPlan) {
      throw new Error(`Failed to fetch new plan details: ${planFetchError?.message ?? "Plan not found."}`);
    }

    plan = newPlan;
    console.log(`[CustomerService] Plan updated to ${newPlanId} (speed: ${newPlan.speed}) for ${customer.full_name}`);
  }
  const targetProfile = plan?.speed && plan.speed !== "Expired-Profile" ? plan.speed : "default";

  const pppoeUsername = customer.pppoe_username;
  const previousStatus = customer.status;

  console.log(`[CustomerService] Starting restoration for ${customer.full_name} (${pppoeUsername}). targetProfile: ${targetProfile}`);


  // 2. Re-enable PPPoE secret on MikroTik if previously suspended
  if (previousStatus === "suspended") {
    try {
      await enablePPPoE(pppoeUsername);
      console.log(`[CustomerService] Enabled PPPoE secret on MikroTik for ${pppoeUsername}`);
    } catch (mikrotikErr) {
      if (mikrotikErr instanceof MikrotikError && mikrotikErr.code === "NOT_FOUND") {
        console.warn(`[CustomerService] MikroTik secret not found for ${pppoeUsername} during enable.`);
      } else {
        throw mikrotikErr;
      }
    }
  }

  // 3. Change PPPoE speed profile back to the paid package
  try {
    await changePPPoEProfile(pppoeUsername, targetProfile);
    console.log(`[CustomerService] Restored speed profile to ${targetProfile} for ${pppoeUsername}`);

    // 4. Disconnect active session to force immediate profile reload
    try {
      await disconnectPPPoE(pppoeUsername);
      console.log(`[CustomerService] Disconnected active session to force reconnect for ${pppoeUsername}`);
    } catch {
      console.log(`[CustomerService] Active session disconnect skipped for ${pppoeUsername} (offline)`);
    }
  } catch (mikrotikErr) {
    if (mikrotikErr instanceof MikrotikError && mikrotikErr.code === "NOT_FOUND") {
      console.warn(`[CustomerService] MikroTik secret not found for ${pppoeUsername} during profile restore.`);
    } else {
      throw mikrotikErr;
    }
  }

  // 5. Calculate new due date (extend by 30 days from previous due date if in future, else 30 days from now)
  let newDueDate: Date;
  const currentDueDate = customer.due_date ? new Date(customer.due_date) : null;
  if (currentDueDate && currentDueDate.getTime() > now.getTime()) {
    newDueDate = new Date(currentDueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else {
    newDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  const newDueDateStr = newDueDate.toISOString();

  // 6. Update database record: status -> 'active', due_date -> newDueDate
  const updatePayload: Record<string, any> = {
    status: "active",
    due_date: newDueDateStr,
  };

  const { error: updateError } = await supabase
    .from("customers")
    .update(updatePayload)
    .eq("id", customer.id);

  if (updateError) {
    throw new Error(`Failed to update customer database record: ${updateError.message}`);
  }

  // 7. Write to activity log
  await writeLog({
    event_type: "status_change",
    description: `Restored ${customer.full_name} (${pppoeUsername}) to active. Speed profile set to ${targetProfile}. Next due date: ${newDueDateStr.split("T")[0]}.`,
    pppoe_username: pppoeUsername,
    customer_name: customer.full_name,
    metadata: {
      previousStatus,
      newStatus: "active",
      profile: targetProfile,
      newDueDate: newDueDateStr,
    },
  });

  // 8. Invalidate Redis cache
  await cache.del("dashboard:stats");
  await cache.invalidatePattern("customers:*");
  console.log(`[CustomerService] Successfully activated & restored customer ${customer.full_name}. Caches invalidated.`);
}
