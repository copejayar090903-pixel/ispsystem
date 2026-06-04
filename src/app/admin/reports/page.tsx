"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";

const reports = [
  "Daily Collection",
  "Weekly Collection",
  "Monthly Collection",
  "Yearly Collection",
  "Paid Customers",
  "Unpaid Customers",
  "Overdue Customers",
  "Disconnected Customers",
  "Revenue Report",
  "Customer Growth Report",
];

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Generate collection, customer, delinquency, and revenue reports with export options." actions={<Button><Download className="h-4 w-4" /> Export All</Button>} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <Card key={report} className="transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-none">
            <CardHeader>
              <CardTitle>{report}</CardTitle>
              <CardDescription>Filter by date range, status, plan, and payment method.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success(`${report} CSV export queued.`)}><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
              <Button variant="outline" size="sm" onClick={() => toast.success(`${report} Excel export queued.`)}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              <Button variant="outline" size="sm" onClick={() => toast.success(`${report} PDF export queued.`)}><FileText className="h-4 w-4" /> PDF</Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}
