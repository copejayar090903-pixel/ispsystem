import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";
import {
  getRouterIdentity,
  getSystemResource,
  getActivePPPoESessions,
  getPPPoEProfiles,
  getPPPoESecrets,
  MikrotikError,
} from "@/src/lib/mikrotik";

export const runtime = "nodejs";

export async function GET() {
  // 1. Test Supabase Database
  let dbStatus = {
    connected: false,
    latencyMs: 0,
    stats: {
      customers: 0,
      plans: 0,
      bills: 0,
      payments: 0,
    },
    error: null as string | null,
  };

  const dbStart = Date.now();
  let dbCustomersList: any[] = [];
  try {
    const supabase = createSupabaseServerClient();
    const [custRes, plansRes, billsRes, payRes] = await Promise.all([
      supabase.from("customers").select("id, full_name, pppoe_username, plan_id, status, plans(id, plan_name, speed)").throwOnError(),
      supabase.from("plans").select("id").throwOnError(),
      supabase.from("bills").select("id").throwOnError(),
      supabase.from("payments").select("id").throwOnError(),
    ]);

    dbCustomersList = custRes.data || [];
    dbStatus = {
      connected: true,
      latencyMs: Date.now() - dbStart,
      stats: {
        customers: dbCustomersList.length,
        plans: (plansRes.data || []).length,
        bills: (billsRes.data || []).length,
        payments: (payRes.data || []).length,
      },
      error: null,
    };
  } catch (err: any) {
    console.error("[Database Diagnostics Error]:", err);
    dbStatus = {
      connected: false,
      latencyMs: Date.now() - dbStart,
      stats: { customers: 0, plans: 0, bills: 0, payments: 0 },
      error: err?.message || String(err),
    };
  }

  // 2. Test MikroTik connection
  let mikrotikStatus = {
    connected: false,
    latencyMs: 0,
    identity: null as any,
    resource: null as any,
    activeSessionsCount: 0,
    profilesCount: 0,
    secretsCount: 0,
    error: null as string | null,
  };

  const mtStart = Date.now();
  let mtSecretsList: any[] = [];
  try {
    const [identity, resource, sessions, profiles, secrets] = await Promise.all([
      getRouterIdentity(),
      getSystemResource(),
      getActivePPPoESessions(),
      getPPPoEProfiles(),
      getPPPoESecrets(),
    ]);

    mtSecretsList = secrets || [];
    mikrotikStatus = {
      connected: true,
      latencyMs: Date.now() - mtStart,
      identity,
      resource,
      activeSessionsCount: (sessions || []).length,
      profilesCount: (profiles || []).length,
      secretsCount: mtSecretsList.length,
      error: null,
    };
  } catch (err: any) {
    console.error("[MikroTik Diagnostics Error]:", err);
    mikrotikStatus = {
      connected: false,
      latencyMs: Date.now() - mtStart,
      identity: null,
      resource: null,
      activeSessionsCount: 0,
      profilesCount: 0,
      secretsCount: 0,
      error: err instanceof MikrotikError ? err.message : (err?.message || "Cannot connect to MikroTik. Check VPN connection."),
    };
  }

  // 3. Compute anomalies
  const anomalies: {
    missingInMikrotik: any[];
    orphanedInMikrotik: any[];
    statusMismatches: any[];
    profileMismatches: any[];
  } = {
    missingInMikrotik: [],
    orphanedInMikrotik: [],
    statusMismatches: [],
    profileMismatches: [],
  };

  if (dbStatus.connected && mikrotikStatus.connected) {
    const dbCustMap = new Map<string, any>();
    for (const cust of dbCustomersList) {
      if (cust.pppoe_username) {
        dbCustMap.set(cust.pppoe_username.toLowerCase().trim(), cust);
      }
    }

    const mtSecretsMap = new Map<string, any>();
    for (const sec of mtSecretsList) {
      if (sec.name) {
        mtSecretsMap.set(sec.name.toLowerCase().trim(), sec);
      }
    }

    // A. Missing in MikroTik (Active/Inactive Customer in DB but no secret on router)
    for (const cust of dbCustomersList) {
      if (!cust.pppoe_username) continue;
      const lowerUsername = cust.pppoe_username.toLowerCase().trim();
      if (!mtSecretsMap.has(lowerUsername)) {
        const planObj = cust.plans as any;
        anomalies.missingInMikrotik.push({
          customerId: cust.id,
          name: cust.full_name,
          pppoe_username: cust.pppoe_username,
          expectedProfile: planObj?.speed || "default",
          status: cust.status,
        });
      }
    }

    // B. Orphaned in MikroTik (Secret exists on MikroTik but no customer in DB)
    for (const sec of mtSecretsList) {
      if (!sec.name) continue;
      const lowerName = sec.name.toLowerCase().trim();
      if (!dbCustMap.has(lowerName)) {
        anomalies.orphanedInMikrotik.push({
          id: sec[".id"],
          name: sec.name,
          profile: sec.profile || "",
          comment: sec.comment || "",
          disabled: sec.disabled === "yes" || sec.disabled === "true",
        });
      }
    }

    // C. Status Mismatches (Active in DB but disabled in router, or inactive in DB but enabled on router)
    for (const cust of dbCustomersList) {
      if (!cust.pppoe_username) continue;
      const lowerUsername = cust.pppoe_username.toLowerCase().trim();
      const sec = mtSecretsMap.get(lowerUsername);
      if (!sec) continue;

      const secretDisabled = sec.disabled === "yes" || sec.disabled === "true";
      const isDbActive = cust.status === "active";

      if (isDbActive && secretDisabled) {
        anomalies.statusMismatches.push({
          customerId: cust.id,
          name: cust.full_name,
          pppoe_username: cust.pppoe_username,
          dbStatus: cust.status,
          routerDisabled: true,
          details: "Customer is Active in DB, but PPPoE Secret is disabled on router.",
        });
      } else if (!isDbActive && !secretDisabled) {
        anomalies.statusMismatches.push({
          customerId: cust.id,
          name: cust.full_name,
          pppoe_username: cust.pppoe_username,
          dbStatus: cust.status,
          routerDisabled: false,
          details: `Customer is ${cust.status.toUpperCase()} in DB, but PPPoE Secret is still ENABLED on router.`,
        });
      }
    }

    // D. Profile Mismatches (Database plan profile name != Router profile name)
    for (const cust of dbCustomersList) {
      if (!cust.pppoe_username) continue;
      const lowerUsername = cust.pppoe_username.toLowerCase().trim();
      const sec = mtSecretsMap.get(lowerUsername);
      if (!sec) continue;

      const planObj = cust.plans as any;
      const dbProfile = planObj?.speed || "default";
      const mtProfile = sec.profile || "default";

      if (dbProfile.toLowerCase() !== mtProfile.toLowerCase()) {
        anomalies.profileMismatches.push({
          customerId: cust.id,
          name: cust.full_name,
          pppoe_username: cust.pppoe_username,
          dbProfile,
          routerProfile: mtProfile,
          details: `DB plan specifies profile "${dbProfile}", but MikroTik is set to "${mtProfile}".`,
        });
      }
    }
  }

  return NextResponse.json({
    db: dbStatus,
    mikrotik: mikrotikStatus,
    anomalies,
  });
}
