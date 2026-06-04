"use client";

import { CreditCard, FileImage, Search, UploadCloud, Wifi } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";

export default function CustomerPortalPage() {
  const [accountNumber, setAccountNumber] = useState("");
  const [found, setFound] = useState(false);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_34rem),linear-gradient(180deg,#f8fafc,#eef6ff)] px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-12">
      <section className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="inline-flex rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">No login required</div>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Check your ISP bill with your account number.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">View balance, due date, service status, payment instructions, and upload proof of payment securely.</p>
          <Card className="mt-8 max-w-xl bg-white/85 backdrop-blur dark:bg-slate-950/85">
            <CardHeader><CardTitle>Account Lookup</CardTitle><CardDescription>Enter the account number shown on your bill or receipt.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row"><Input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="ISP-000124" /><Button onClick={() => { setFound(true); toast.success("Account found."); }}><Search className="h-4 w-4" /> Check Bill</Button></CardContent>
          </Card>
        </div>

        <Card className="bg-white/90 shadow-2xl shadow-blue-900/10 backdrop-blur dark:bg-slate-950/90">
          <CardHeader className="border-b border-slate-100 dark:border-slate-900"><CardTitle>Billing Summary</CardTitle><CardDescription>{found ? "Here is the latest account information." : "Search an account number to show details."}</CardDescription></CardHeader>
          <CardContent className="space-y-6 pt-6">
            {found ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info label="Customer Name" value="Juan Dela Cruz" />
                  <Info label="Account Number" value={accountNumber || "ISP-000124"} />
                  <Info label="Plan" value="Plan 1299 - 30Mbps" />
                  <Info label="Monthly Fee" value="₱1,299" />
                  <Info label="Due Date" value="June 10, 2026" />
                  <Info label="Balance" value="₱1,299" />
                </div>
                <div className="flex flex-wrap gap-2"><StatusBadge status="unpaid" /><StatusBadge status="active" /></div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10"><p className="flex items-center gap-2 text-sm font-semibold text-blue-950 dark:text-blue-100"><CreditCard className="h-4 w-4" /> Payment Instructions</p><p className="mt-2 text-sm leading-6 text-blue-700 dark:text-blue-300">Pay via GCash, Maya, bank transfer, or cash. Upload proof and reference number below for admin verification.</p></div>
                <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Reference number" /><Input type="number" placeholder="Amount paid" /><label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 sm:col-span-2"><UploadCloud className="mb-2 h-5 w-5" /> Upload proof of payment<input type="file" className="hidden" /></label></div>
                <Button className="w-full" onClick={() => toast.success("Payment proof submitted for verification.")}><FileImage className="h-4 w-4" /> Submit Payment Proof</Button>
              </>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400"><Wifi className="mb-4 h-12 w-12 text-blue-500" /><p className="font-medium text-slate-700 dark:text-slate-200">Your bill appears here</p><p className="mt-1 text-sm">No password needed. Use account number only.</p></div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"><p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 font-semibold text-slate-950 dark:text-white">{value}</p></div>;
}
