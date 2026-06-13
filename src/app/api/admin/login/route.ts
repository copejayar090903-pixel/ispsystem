import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { email, password } = payload;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    let authSuccess = false;

    // 1. Try Database authentication via Supabase Auth
    try {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error && data.user) {
        authSuccess = true;
      }
    } catch (e) {
      console.error("Supabase database auth error, checking fallback:", e);
    }

    // 2. Fallback to Env/Hardcoded verification if database check was unsuccessful
    if (!authSuccess) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@devcop.com";
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

      if (email.trim().toLowerCase() === adminEmail.trim().toLowerCase() && password === adminPassword) {
        authSuccess = true;
      }
    }

    if (authSuccess) {
      const response = NextResponse.json({ success: true, message: "Logged in successfully." });
      // Set the session cookie
      response.headers.set(
        "Set-Cookie",
        `admin_logged_in=true; Path=/; Max-Age=86400; SameSite=Lax${
          process.env.NODE_ENV === "production" ? "; Secure" : ""
        }`
      );
      return response;
    }

    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully." });
  response.headers.set(
    "Set-Cookie",
    "admin_logged_in=; Path=/; Max-Age=0; SameSite=Lax"
  );
  return response;
}
