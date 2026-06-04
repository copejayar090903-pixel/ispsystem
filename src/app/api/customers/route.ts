import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  type CustomerInsert,
} from "@/src/lib/supabase";
import { getPPPoESecrets, createPPPoESecret, changePPPoEProfile, updatePPPoESecret } from "@/src/lib/mikrotik";

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

    return NextResponse.json({ customer: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save customer.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data: customers, error } = await supabase
      .from("customers")
      .select("*, plans(*)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customers.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}