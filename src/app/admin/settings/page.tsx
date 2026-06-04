"use client";

import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input, Textarea } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Configure company profile, billing rules, payment channels, admin users, notifications, and MikroTik connectivity." actions={<Button onClick={() => toast.success("Settings ready to save to Supabase.")}><Save className="h-4 w-4" /> Save Settings</Button>} />
      <section className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Company Profile</CardTitle><CardDescription>Displayed on invoices, receipts, and customer portal.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Input placeholder="Company Name" /><Input placeholder="Contact Number" /><Input placeholder="Email" /><Input placeholder="Logo URL" /><Textarea className="md:col-span-2" placeholder="Company Address" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Billing Settings</CardTitle><CardDescription>Automation rules for bill generation and service control.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Input placeholder="Default due day (10)" type="number" /><Input placeholder="Grace period days (3)" type="number" /><Select><option>Auto-disconnect enabled</option><option>Auto-disconnect disabled</option></Select><Select><option>Auto-reconnect enabled</option><option>Auto-reconnect disabled</option></Select></CardContent></Card>
        <Card><CardHeader><CardTitle>Payment Methods</CardTitle><CardDescription>Instructions shown to customers when uploading proof.</CardDescription></CardHeader><CardContent className="grid gap-4"><Textarea placeholder="GCash account details" /><Textarea placeholder="Maya account details" /><Textarea placeholder="Bank transfer details" /></CardContent></Card>
        <Card><CardHeader><CardTitle>MikroTik API Settings</CardTitle><CardDescription>Credentials are environment variables and never exposed to the browser.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><Input value="MIKROTIK_HOST" readOnly /><Input value="MIKROTIK_PORT" readOnly /><Input placeholder="ZeroTier IP display" /><Select><option>RouterOS API enabled</option><option>RouterOS API disabled</option></Select></CardContent></Card>
      </section>
    </>
  );
}
