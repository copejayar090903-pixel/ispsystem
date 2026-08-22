const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase configuration!");
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log("Checking payment with full joins: 6c85173a-6b72-4fa5-830c-c7c3365f3e48");
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      customers ( full_name, account_number, email, pppoe_username ),
      bills ( billing_period_start, billing_period_end )
    `)
    .eq("id", "6c85173a-6b72-4fa5-830c-c7c3365f3e48")
    .single();

  const { verifyEmailActionToken } = require("./src/lib/email-token");
  const token = "2509842c59ff7cdf4e78ef33ca03bb8ad12c8de82460314dab5de30b24755d0d";
  const isValid = verifyEmailActionToken("6c85173a-6b72-4fa5-830c-c7c3365f3e48", token);
  console.log("Is Token Valid?", isValid);

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Query Data:", data);
  }

  console.log("\nRecent payments:");
  const { data: recent, error: recentError } = await supabase
    .from("payments")
    .select("id, status, amount_paid, method, reference_number, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (recentError) {
    console.error("Recent error:", recentError);
  } else {
    console.log(recent);
  }
}

check();
