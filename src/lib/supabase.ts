import { createClient } from "@supabase/supabase-js";

export type CustomerInsert = {
  id?: string;
  account_number: string;
  full_name: string;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  installation_date: string | null;
  due_date: string | null;
  pppoe_username: string;
  plan_id: string | null;
  status: "active" | "inactive" | "disconnected" | "overdue" | "suspended";
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or the NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY pair.",
    );
  }

  return { url, key };
}

export function createSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}