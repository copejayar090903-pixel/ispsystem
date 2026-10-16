"use client";

import { Bell, Menu, Search, Loader2 } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ThemeToggle } from "@/src/components/admin/theme-toggle";
import { Sidebar } from "@/src/components/admin/sidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCounts, setNotifCounts] = useState<{
    overdueCustomers: number;
    pendingReminders: number;
    newPayments: number;
    deadlineCount: number;
  }>({
    overdueCustomers: 0,
    pendingReminders: 0,
    newPayments: 0,
    deadlineCount: 0,
  });

  useEffect(() => {
    if (pathname === "/admin/login") {
      setLoading(false);
      return;
    }

    const checkAuth = () => {
      const hasCookie = document.cookie.includes("admin_logged_in=true");
      if (!hasCookie) {
        router.replace("/admin/login");
      } else {
        setAuthorized(true);
        setLoading(false);
      }
    };

    checkAuth();
  }, [pathname, router]);

  useEffect(() => {
    if (pathname === "/admin/login") return;

    async function loadNotifs() {
      try {
        const res = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setNotifCounts(data);
        }
      } catch {
        // ignore
      }
    }
    void loadNotifs();
    const interval = setInterval(() => void loadNotifs(), 20000);
    return () => clearInterval(interval);
  }, [pathname]);

  const totalAlerts =
    notifCounts.overdueCustomers +
    notifCounts.pendingReminders +
    notifCounts.newPayments +
    notifCounts.deadlineCount;

  // If path is login page, just show children directly without layout
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // While checking status or when not authorized, show a elegant fullscreen loader
  if (loading || !authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-4 text-xs font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
          Authenticating access...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_32rem),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_28rem)]" />
      
      <Sidebar open={open} onClose={() => setOpen(false)} />

      {open ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className={cn("relative transition-all duration-300", open ? "lg:pl-72" : "lg:pl-0")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="max-w-xl pl-9" placeholder="Search customers, accounts, invoices, PPPoE users..." />
          </div>

          <div className="ml-auto flex items-center gap-2 relative">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {totalAlerts > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                  </span>
                )}
              </Button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 px-2 dark:border-slate-900">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        System Notifications
                      </p>
                      {totalAlerts > 0 ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                          {totalAlerts} action{totalAlerts !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                          All clear
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1.5 text-xs">
                      {notifCounts.newPayments > 0 && (
                        <a
                          href="/admin/payments"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-300">New Payments Awaiting Review</span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            {notifCounts.newPayments} new
                          </span>
                        </a>
                      )}
                      {notifCounts.overdueCustomers > 0 && (
                        <a
                          href="/admin/customers"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-300">Overdue Customers</span>
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                            {notifCounts.overdueCustomers} overdue
                          </span>
                        </a>
                      )}
                      {notifCounts.deadlineCount > 0 && (
                        <a
                          href="/admin/dashboard"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-300">Due Within 3 Days</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            {notifCounts.deadlineCount} due soon
                          </span>
                        </a>
                      )}
                      {notifCounts.pendingReminders > 0 && (
                        <a
                          href="/admin/billing"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-300">Unpaid Billing Statements</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            {notifCounts.pendingReminders} pending
                          </span>
                        </a>
                      )}
                      {totalAlerts === 0 && (
                        <div className="py-4 text-center text-slate-400">
                          ✨ No pending notifications or overdue accounts.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <ThemeToggle />
            <button className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-900 to-blue-600 text-xs font-semibold text-white">
                AD
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-medium">Admin</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Owner</span>
              </span>
            </button>
          </div>
        </header>

        <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
