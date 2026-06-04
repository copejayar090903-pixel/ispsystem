"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CalendarClock, Download, FilePlus, Printer } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency } from "@/src/lib/utils";
import { sampleBillings } from "@/src/lib/dashboard-data";

type Billing = (typeof sampleBillings)[number];

export default function BillingPage() {
  const columns = useMemo<ColumnDef<Billing>[]>(() => [
    { accessorKey: "id", header: "Billing ID", cell: ({ row }) => <span className="font-medium text-slate-950 dark:text-white">{row.original.id}</span> },
    { accessorKey: "accountNumber", header: "Account #" },
    { accessorKey: "customerName", header: "Customer" },
    { accessorKey: "plan", header: "Plan" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatCurrency(row.original.amount) },
    { accessorKey: "billingMonth", header: "Billing Month" },
    { accessorKey: "dueDate", header: "Due Date" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "Actions", cell: () => <div className="flex justify-end gap-2"><Button variant="outline" size="sm"><CalendarClock className="h-4 w-4" /> Extend</Button><Button variant="ghost" size="sm"><Printer className="h-4 w-4" /> Invoice</Button></div> },
  ], []);

  const paid = sampleBillings.filter((bill) => bill.status === "paid").length;
  const unpaid = sampleBillings.filter((bill) => bill.status === "unpaid").length;
  const overdue = sampleBillings.filter((bill) => bill.status === "overdue").length;

  return (
    <>
      <PageHeader title="Billing" description="Generate monthly bills, track unpaid/overdue accounts, and prepare invoices." actions={<><Button variant="outline"><Download className="h-4 w-4" /> Export</Button><Button onClick={() => toast.success("Monthly bill generation job queued.")}><FilePlus className="h-4 w-4" /> Generate Bills</Button></>} />
      <section className="grid gap-4 md:grid-cols-4">
        <Summary label="Paid" value={paid} status="paid" />
        <Summary label="Unpaid" value={unpaid} status="unpaid" />
        <Summary label="Overdue" value={overdue} status="overdue" />
        <Summary label="Suspended" value={sampleBillings.filter((bill) => bill.status === "suspended").length} status="suspended" />
      </section>
      <Card><CardHeader><CardTitle>Billing Records</CardTitle><CardDescription>Use tabs/filters here for paid, unpaid, overdue, and suspended billing records.</CardDescription></CardHeader><CardContent><DataTable columns={columns} data={sampleBillings} searchPlaceholder="Search billings..." /></CardContent></Card>
    </>
  );
}

function Summary({ label, value, status }: { label: string; value: number; status: string }) {
  return <Card className="p-4"><div className="flex items-center justify-between"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><Badge variant="muted">{status}</Badge></div><p className="mt-2 text-3xl font-semibold">{value}</p></Card>;
}
