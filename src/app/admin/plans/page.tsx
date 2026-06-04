"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Edit, Plus, Trash2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/src/components/admin/data-table";
import { PageHeader } from "@/src/components/admin/page-header";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { formatCurrency } from "@/src/lib/utils";

type Plan = {
  id?: string;
  plan_name: string;
  speed: string;
  monthly_fee: number;
};

type PPPoEProfile = {
  ".id": string;
  name: string;
  "rate-limit"?: string;
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [profiles, setProfiles] = useState<PPPoEProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [formValues, setFormValues] = useState<Partial<Plan>>({
    plan_name: "",
    speed: "",
    monthly_fee: 0,
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [plansRes, profilesRes] = await Promise.all([
        fetch("/api/plans", { cache: "no-store" }),
        fetch("/api/mikrotik/profiles", { cache: "no-store" }),
      ]);

      const plansData = await plansRes.json();
      const profilesData = await profilesRes.json();

      if (!plansRes.ok) throw new Error(plansData.error ?? "Failed to fetch plans.");
      if (!profilesRes.ok) throw new Error(profilesData.error ?? "Failed to fetch MikroTik profiles.");

      setPlans(plansData.plans ?? []);
      setProfiles(profilesData.profiles ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function handleEdit(plan: Plan) {
    setFormValues({
      plan_name: plan.plan_name,
      speed: plan.speed,
      monthly_fee: plan.monthly_fee,
    });
    setEditingId(plan.id ?? null);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this plan?")) return;
    try {
      const res = await fetch(`/api/plans?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete plan.");
      toast.success("Plan deleted successfully.");
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete plan.");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!formValues.plan_name || !formValues.speed || formValues.monthly_fee === undefined) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...formValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save plan.");
      toast.success(editingId ? "Plan updated successfully." : "Plan created successfully.");
      setShowForm(false);
      setEditingId(null);
      setFormValues({
        plan_name: "",
        speed: "",
        monthly_fee: 0,
      });
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save plan.");
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo<ColumnDef<Plan>[]>(
    () => [
      {
        accessorKey: "plan_name",
        header: "Plan Name",
        cell: ({ row }) => <span className="font-medium text-slate-950 dark:text-white">{row.original.plan_name}</span>,
      },
      {
        accessorKey: "speed",
        header: "MikroTik PPPoE Profile (Speed)",
        cell: ({ row }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-900">{row.original.speed}</code>,
      },
      {
        accessorKey: "monthly_fee",
        header: "Monthly Fee",
        cell: ({ row }) => formatCurrency(Number(row.original.monthly_fee)),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
              <Edit className="h-4 w-4" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void handleDelete(row.original.id!)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        ),
      },
    ],
    [plans],
  );

  return (
    <>
      <PageHeader
        title="Plans"
        description="Manage internet packages and map every package to a MikroTik PPPoE profile."
        actions={
          <Button
            onClick={() => {
              if (showForm) {
                setEditingId(null);
                setFormValues({ plan_name: "", speed: "", monthly_fee: 0 });
              }
              setShowForm(!showForm);
            }}
          >
            <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Add Plan"}
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Plan" : "Add Plan"}</CardTitle>
            <CardDescription>Create or edit an internet package mapped to RouterOS PPPoE profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSave(e)} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Plan Name</label>
                <Input
                  placeholder="e.g. Plan 1299 - 30Mbps"
                  value={formValues.plan_name}
                  onChange={(e) => setFormValues({ ...formValues, plan_name: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Monthly Fee (₱)</label>
                <Input
                  type="number"
                  placeholder="e.g. 1299"
                  value={formValues.speed === "Expired-Profile" ? 0 : (formValues.monthly_fee || "")}
                  onChange={(e) => setFormValues({ ...formValues, monthly_fee: Number(e.target.value) })}
                  disabled={formValues.speed === "Expired-Profile"}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">MikroTik PPPoE Profile (Speed)</label>
                <Select
                  value={formValues.speed || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormValues({
                      ...formValues,
                      speed: val,
                      monthly_fee: val === "Expired-Profile" ? 0 : formValues.monthly_fee
                    });
                  }}
                  required
                >
                  <option value="">Select MikroTik Profile</option>
                  {profiles.map((profile) => (
                    <option key={profile[".id"]} value={profile.name}>
                      {profile.name} {profile["rate-limit"] ? `(${profile["rate-limit"]})` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex justify-end gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormValues({ plan_name: "", speed: "", monthly_fee: 0 });
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Update Plan" : "Save Plan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Plan Management</CardTitle>
            <CardDescription>Set speeds, fees, and RouterOS profile assignments.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <DataTable columns={columns} data={plans} searchPlaceholder="Search plans..." />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>RouterOS Profiles</CardTitle>
            <CardDescription>Live profiles on MikroTik.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {profiles.map((profile) => {
                  const isMapped = plans.some((p) => p.speed === profile.name);
                  return (
                    <div
                      key={profile[".id"]}
                      className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                          {profile.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {profile["rate-limit"] ? `Limit: ${profile["rate-limit"]}` : "No rate limit"}
                        </p>
                      </div>
                      {isMapped ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Mapped
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setFormValues({
                              plan_name: `Plan - ${profile.name}`,
                              speed: profile.name,
                              monthly_fee: 0,
                            });
                            setEditingId(null);
                            setShowForm(true);
                          }}
                        >
                          + Add Plan
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}


