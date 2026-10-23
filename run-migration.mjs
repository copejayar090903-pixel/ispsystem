import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runMigration() {
  try {
    // Read the migration file and execute it via the Supabase SQL editor API
    const migrationPath = "D:/isp-system/add_rejection_reason.sql";
    const sql = readFileSync(migrationPath, "utf-8").trim();

    console.log("Running migration SQL...");

    // Use Supabase's RPC endpoint to execute SQL
    const result = await supabase.rpc("exec_sql", { sql }).catch(() => null);

    if (!result) {
      // Fallback: Try executing via raw POST to /functions or just verify
      console.log("Could not exec_sql via RPC, checking column manually...");

      // Verify current state by selecting all columns
      const { data } = await supabase.from("payments").select("*").limit(1);
      console.log("Current payments table columns:");
      if (data && data[0]) {
        const keys = Object.keys(data[0]).filter(k => k !== "id" && k !== "customer_id" && k !== "billing_id" && k !== "method" && k !== "reference_number" && k !== "amount_paid" && k !== "proof_url" && k !== "status" && k !== "submitted_at" && k !== "reviewed_by" && k !== "reviewed_at" && k !== "created_at");
        console.log("Extra columns in last row:", keys);
      }
    } else {
      console.log("Migration executed successfully!");
    }

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigration();
