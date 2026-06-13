"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Network, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { ThemeToggle } from "@/src/components/admin/theme-toggle";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Both email and password are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed. Please check your credentials.");
      }

      toast.success("Welcome back, Admin!");
      router.push("/admin/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_28rem)] dark:bg-slate-950 px-4 transition-colors duration-300">
      {/* Theme toggle in top corner */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-xl shadow-blue-500/20">
            <Network className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-2">
            Devcop IT Solution
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Secure Admin Management Portal
          </p>
        </div>

        <Card className="bg-white/80 dark:bg-slate-900/80 border-slate-200/60 dark:border-slate-800 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold">Sign In</CardTitle>
            <CardDescription className="text-xs">
              Enter your administrative email and password to access the console
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-450 dark:text-slate-500 pointer-events-none" />
                  <Input
                    type="email"
                    placeholder="admin@devcop.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 h-11 rounded-xl border-slate-200 dark:border-slate-800 dark:bg-slate-900/50 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-450 dark:text-slate-500 pointer-events-none" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9 h-11 rounded-xl border-slate-200 dark:border-slate-800 dark:bg-slate-900/50 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/15 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying credentials...
                  </>
                ) : (
                  "Sign In to Dashboard"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-slate-450 dark:text-slate-500">
          This system is restricted to authorized personnel only. All access attempts are logged.
        </p>
      </div>
    </div>
  );
}
