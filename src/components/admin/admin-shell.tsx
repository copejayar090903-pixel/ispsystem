"use client";

import { Bell, Menu, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ThemeToggle } from "@/src/components/admin/theme-toggle";
import { Sidebar } from "@/src/components/admin/sidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);

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

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
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
