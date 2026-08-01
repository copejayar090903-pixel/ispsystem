"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Network,
  ReceiptText,
  Router,
  Settings,
  Users,
  Wifi,
  ChevronDown,
  AlertCircle,
  X,
  ScrollText,
  GitFork,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  children?: SidebarItem[];
}

const sidebarItems: SidebarItem[] = [
  { href: "/admin/dashboard",  label: "Dashboard",      icon: LayoutDashboard },
  { href: "/admin/customers",  label: "Customers",      icon: Users, badge: "12 overdue" },
  { href: "/admin/pppoe",      label: "PPPoE Accounts", icon: Wifi },
  { href: "/admin/plans",      label: "Plans",          icon: ReceiptText },
  { href: "/admin/billing",    label: "Billing",        icon: FileText, badge: "4 pending" },
  { href: "/admin/payments",   label: "Payments",       icon: CreditCard, badge: "3 new" },
  { href: "/admin/mikrotik",   label: "MikroTik",       icon: Router },
  { href: "/admin/topology",   label: "Topology Map",   icon: GitFork },
  { href: "/admin/test-connection", label: "Connection Test", icon: Network },
  { href: "/admin/reports",    label: "Reports",        icon: BarChart3 },
  { href: "/admin/logs",       label: "Activity Logs",  icon: ScrollText },
  { href: "/admin/settings",   label: "Settings",       icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [activeCount, setActiveCount] = useState<number | null>(null);

  const handleSignOut = async () => {
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
      document.cookie = "admin_logged_in=; Path=/; Max-Age=0; SameSite=Lax";
      toast.success("Signed out successfully.");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error("Failed to sign out.");
    }
  };

  useEffect(() => {
    async function fetchActiveCount() {
      try {
        const res = await fetch("/api/mikrotik/active");
        if (res.ok) {
          const data = await res.json();
          if (data.sessions) {
            setActiveCount(data.sessions.length);
          }
        }
      } catch (e) {
        // ignore error
      }
    }
    void fetchActiveCount();
  }, []);

  const toggleExpand = (href: string) => {
    setExpanded((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200/80 bg-white/90 backdrop-blur-xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-950/90",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/20">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Devcop IT Solution</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">v1.0</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label="Close sidebar">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 p-4">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isExpanded = expanded.includes(item.href);
          const isCustomers = item.href === "/admin/customers";
          const displayBadge = isCustomers
            ? activeCount !== null
              ? `${activeCount} active`
              : "..."
            : item.badge;

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={() => onClose()}
                className={cn(
                  "flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition group",
                  active
                    ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
                {displayBadge && (
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    active
                      ? "bg-white/20 text-white"
                      : isCustomers
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                  )}>
                    {displayBadge}
                  </span>
                )}
                {item.children && item.children.length > 0 && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isExpanded ? "rotate-180" : ""
                    )}
                  />
                )}
              </Link>

              {/* Submenu */}
              {item.children && isExpanded && (
                <div className="mt-1 space-y-1 pl-4">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive =
                      pathname === child.href || pathname.startsWith(`${child.href}/`);

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => onClose()}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition",
                          childActive
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                            : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
                        )}
                      >
                        <ChildIcon className="h-3 w-3" />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Info Panel */}
      <div className="absolute bottom-20 left-4 right-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
        <div className="flex gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-950 dark:text-blue-100">
              RouterOS Secure
            </p>
            <p className="mt-0.5 text-xs leading-4 text-blue-700 dark:text-blue-300">
              All MikroTik API calls via server-side routes. Credentials never exposed.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white/50 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/50">
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-600 dark:text-slate-400"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
