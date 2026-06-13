const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase configuration in .env!");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function clearMockBilling() {
  console.log("Connecting to Supabase at:", url);
  
  // 1. Delete all payments first (foreign key constraint references bills)
  console.log("Clearing payments table...");
  const { error: payError } = await supabase.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (payError) {
    console.error("Error clearing payments:", payError.message);
    process.exit(1);
  }
  
  // 2. Delete all bills
  console.log("Clearing bills table...");
  const { error: billError } = await supabase.from("bills").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (billError) {
    console.error("Error clearing bills:", billError.message);
    process.exit(1);
  }

  console.log("Successfully cleared all mock billing and payment history from the database!");
}

clearMockBilling();
