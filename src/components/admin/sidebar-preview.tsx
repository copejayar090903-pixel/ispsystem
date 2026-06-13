"use client";

import { AlertCircle, Bell, Menu, Search, Sun } from "lucide-react";
import { Button } from "@/src/components/ui/button";

/**
 * Sidebar Preview Component
 * Demonstrates the new admin sidebar with badges and navigation
 */
export function SidebarPreview() {
  return (
    <div className="grid min-h-screen grid-cols-4 gap-8 bg-slate-50 p-8 dark:bg-slate-950">
      {/* Sidebar Visual */}
      <div className="col-span-1 rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-lg">
            <span className="text-xs font-bold">ISP</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Devcop IT Solution</p>
            <p className="text-xs text-slate-500">v1.0</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1 p-4">
          {[
            { label: "Dashboard", badge: null },
            { label: "Customers", badge: "12 overdue" },
            { label: "PPPoE Accounts", badge: null },
            { label: "Plans", badge: null },
            { label: "Billing", badge: "4 pending" },
            { label: "Payments", badge: "3 new" },
          ].map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span>{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Info Box */}
        <div className="absolute bottom-20 left-4 right-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs font-semibold text-blue-950 dark:text-blue-100">RouterOS Secure</p>
              <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">All API calls server-side</p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature List */}
      <div className="col-span-3 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">Admin Sidebar Enhanced</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">New features and improvements</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <span className="text-lg">🏷️</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Smart Badges</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Real-time notification badges show pending items: "12 overdue", "4 pending", "3 new"
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-500/20">
              <span className="text-lg">📱</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Mobile Responsive</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Hamburger menu on mobile, full sidebar on desktop. Smooth slide-out animation
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20">
              <span className="text-lg">🌙</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Dark Mode</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Full dark mode support with smooth theme transitions via next-themes
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <span className="text-lg">🔐</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Security Info</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Bottom panel reminds admins of RouterOS security practices
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-500/20">
              <span className="text-lg">⚡</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Active States</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Current page highlighted with dark background and white text for clarity
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-500/20">
              <span className="text-lg">📂</span>
            </div>
            <h3 className="mt-4 font-semibold text-slate-950 dark:text-slate-50">Expandable Sections</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Support for nested navigation with collapsible menu sections (ready for extension)
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-semibold text-slate-950 dark:text-slate-50">9 Navigation Routes</h3>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            {[
              "📊 Dashboard",
              "👥 Customers",
              "📡 PPPoE Accounts",
              "💳 Plans",
              "📋 Billing",
              "💰 Payments",
              "🖥️ MikroTik",
              "📈 Reports",
              "⚙️ Settings",
            ].map((item) => (
              <div key={item} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
