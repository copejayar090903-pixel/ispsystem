"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, FileImage, Plus, ReceiptText, XCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { StatusBadge } from "@/src/components/admin/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { formatCurrency } from "@/src/lib/utils";
import { samplePayments } from "@/src/lib/dashboard-data";

type Payment = (typeof samplePayments)[number];

export default function PaymentsPage() {
  const columns = useMemo<ColumnDef<Payment>[]>(() => [
    { accessorKey: "id", header: "Payment ID", cell: ({ row }) => <span className="font-medium text-slate-950 dark:text-white">{row.original.id}</span> },
    { accessorKey: "accountNumber", header: "Account #" },
    { accessorKey: "customerName", header: "Customer" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatCurrency(row.original.amount) },
    { accessorKey: "method", header: "Method" },
    { accessorKey: "reference", header: "Reference" },
    { accessorKey: "proof", header: "Proof", cell: ({ row }) => <Button variant="ghost" size="sm"><FileImage className="h-4 w-4" /> {row.original.proof}</Button> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "submittedAt", header: "Submitted" },
    { accessorKey: "verifiedAt", header: "Verified" },
    { id: "actions", header: "Actions", cell: ({ row }) => <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => toast.success(`${row.original.id} approved. Billing paid and PPPoE enable queued.`)}><CheckCircle2 className="h-4 w-4" /> Approve</Button><Button variant="ghost" size="sm" onClick={() => toast.error(`${row.original.id} rejected.`)}><XCircle className="h-4 w-4" /> Reject</Button></div> },
  ], []);

  return (
    <>
      <PageHeader title="Payments" description="Review payment submissions, verify proof images, approve reconnection, and generate receipts." actions={<><Button variant="outline"><ReceiptText className="h-4 w-4" /> Receipts</Button><Button><Plus className="h-4 w-4" /> Manual Payment</Button></>} />
      <Card><CardHeader><CardTitle>Payment Submissions</CardTitle><CardDescription>Approving a payment should mark the bill paid, update activity logs, and enable PPPoE.</CardDescription></CardHeader><CardContent><DataTable columns={columns} data={samplePayments} searchPlaceholder="Search payments..." /></CardContent></Card>
    </>
  );
}
