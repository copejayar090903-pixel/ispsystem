import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  type CustomerInsert,
} from "@/src/lib/supabase";
import { getPPPoESecrets, createPPPoESecret, changePPPoEProfile, updatePPPoESecret } from "@/src/lib/mikrotik";
import { cache } from "@/src/lib/redis";
import { writeLog } from "@/src/lib/activity-log";

export const runtime = "nodejs";

async function generateUniqueAccountNumber(supabase: any): Promise<string> {
  let isUnique = false;
  let accountNumber = "";

  while (!isUnique) {
    // Generate a random 9-digit number
    accountNumber = Math.floor(100000000 + Math.random() * 900000000).toString();

    // Check if it exists in the database
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("account_number", accountNumber)
      .limit(1);

    if (!data || data.length === 0) {
      isUnique = true;
    }
  }

  return accountNumber;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<CustomerInsert> & { id?: string; pppoe_password?: string };
    const supabase = createSupabaseServerClient();

    if (!payload.full_name || !payload.pppoe_username) {
      return NextResponse.json(
        { error: "Full name and PPPoE username are required." },
        { status: 400 },
      );
    }

    let accountNumber = payload.account_number;
    const isNew = !payload.id;

    if (isNew) {
      // Check if PPPoE username already exists on MikroTik
      const accounts = await getPPPoESecrets();
      const existingSecret = accounts.find(
        (account) => account.name === payload.pppoe_username,
      );

      if (!existingSecret) {
        // This is a brand new customer who is not yet on MikroTik.
        if (!payload.pppoe_password) {
          return NextResponse.json(
            { error: "PPPoE password is required for new customers." },
            { status: 400 },
          );
        }

        // Fetch the speed profile from plans table
        let profile = "default";
        if (payload.plan_id) {
          const { data: plan } = await supabase
            .from("plans")
            .select("speed")
            .eq("id", payload.plan_id)
            .single();
          if (plan && plan.speed) {
            profile = plan.speed;
          }
        }

        // Create the PPPoE secret on the MikroTik router
        await createPPPoESecret(
          payload.pppoe_username.trim(),
          payload.pppoe_password.trim(),
          profile,
          payload.full_name.trim()
        );
      }

      // Generate a unique 9-digit account number if not provided or set to 'auto'/'NOT_SYNCED'
      if (!accountNumber || accountNumber === "auto" || accountNumber === "NOT_SYNCED") {
        accountNumber = await generateUniqueAccountNumber(supabase);
      }
    } else {
      // If we are updating an existing customer
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("pppoe_username, plan_id, full_name")
        .eq("id", payload.id)
        .single();

      if (existingCustomer) {
        // Prepare updates for MikroTik
        const updates: { password?: string; profile?: string; comment?: string } = {};

        if (payload.pppoe_password) {
          updates.password = payload.pppoe_password.trim();
        }

        if (payload.full_name && payload.full_name.trim() !== existingCustomer.full_name) {
          updates.comment = payload.full_name.trim();
        }

        // If the plan changed, update the profile on MikroTik
        if (payload.plan_id && payload.plan_id !== existingCustomer.plan_id) {
          let profile = "default";
          const { data: plan } = await supabase
            .from("plans")
            .select("speed")
            .eq("id", payload.plan_id)
            .single();
          if (plan && plan.speed) {
            profile = plan.speed;
          }
          updates.profile = profile;
        }

        // Apply updates to MikroTik if there are any
        if (Object.keys(updates).length > 0) {
          await updatePPPoESecret(existingCustomer.pppoe_username, updates);
        }
      }
    }

    const customerData = {
      account_number: accountNumber || payload.account_number,
      full_name: payload.full_name.trim(),
      address: payload.address?.trim() || null,
      contact_number: payload.contact_number?.trim() || null,
      email: payload.email?.trim() || null,
      installation_date: payload.installation_date || new Date().toISOString().split("T")[0],
      due_date: payload.due_date || null,
      pppoe_username: payload.pppoe_username.trim(),
      plan_id: payload.plan_id || null,
      status: payload.status || "active",
    };

    const { data, error } = await supabase
      .from("customers")
      .upsert(
        (payload.id ? { id: payload.id, ...customerData } : customerData) as any,
        { onConflict: "pppoe_username" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invalidate caches
    await cache.del("dashboard:stats");
    await cache.invalidatePattern("customers:*");

    // Write activity log
    await writeLog({
      event_type: isNew ? "customer_created" : "customer_updated",
      description: isNew
        ? `New customer ${payload.full_name?.trim()} (${payload.pppoe_username?.trim()}) added.`
        : `Customer ${payload.full_name?.trim()} (${payload.pppoe_username?.trim()}) record updated.`,
      pppoe_username: payload.pppoe_username?.trim() ?? null,
      customer_name:  payload.full_name?.trim() ?? null,
    });

    return NextResponse.json({ customer: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save customer.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cacheKey = "customers:list";
    const cachedData = await cache.get<any>(cacheKey);
    if (cachedData) {
      return NextResponse.json({ customers: cachedData });
    }

    const supabase = createSupabaseServerClient();
    const { data: customers, error } = await supabase
      .from("customers")
      .select("*, plans(*), bills(id, billing_year, billing_month, status)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    // Exclude soft-deleted customers
    const nonDeleted = (customers || []).filter((c: any) => c.status !== "deleted" && !c.deleted_at);

    const customersWithPaidStatus = nonDeleted.map((customer: any) => {
      const paidThisMonth = (customer.bills || []).some(
        (bill: any) =>
          bill.billing_year === currentYear &&
          bill.billing_month === currentMonth &&
          bill.status === "paid"
      );
      
      const { bills, ...rest } = customer;
      return {
        ...rest,
        paid_this_month: paidThisMonth
      };
    });

    await cache.set(cacheKey, customersWithPaidStatus, 30); // Cache for 30s

    return NextResponse.json({ customers: customersWithPaidStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customers.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // No body
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // 1. Fetch customer details first to get PPPoE username
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, pppoe_username")
      .eq("id", id)
      .single();

    // 2. Perform soft delete
    const nowIso = new Date().toISOString();
    let updateError: any = null;

    const { error: fullUpdateErr } = await supabase
      .from("customers")
      .update({ status: "deleted", deleted_at: nowIso })
      .eq("id", id);

    if (fullUpdateErr) {
      // Fallback in case deleted_at column is not present
      const { error: statusOnlyErr } = await supabase
        .from("customers")
        .update({ status: "deleted" })
        .eq("id", id);
      updateError = statusOnlyErr;
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Disable PPPoE secret on MikroTik router if present
    if (customer?.pppoe_username) {
      try {
        const { disablePPPoE, disconnectPPPoE } = await import("@/src/lib/mikrotik");
        await disablePPPoE(customer.pppoe_username);
        await disconnectPPPoE(customer.pppoe_username);
      } catch (err) {
        console.warn("Could not disable/disconnect PPPoE on router:", err);
      }
    }

    // 4. Invalidate caches
    await cache.del("dashboard:stats");
    await cache.invalidatePattern("customers:*");

    // 5. Activity log
    await writeLog({
      event_type: "customer_deleted",
      description: `Customer ${customer?.full_name || id} (${customer?.pppoe_username || "N/A"}) was deleted (soft delete).`,
      pppoe_username: customer?.pppoe_username ?? null,
      customer_name: customer?.full_name ?? null,
    });

    return NextResponse.json({ success: true, message: "Customer deleted successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}