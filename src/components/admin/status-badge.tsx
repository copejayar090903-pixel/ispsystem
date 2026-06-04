import { Badge } from "@/src/components/ui/badge";

type KnownStatus = "active" | "inactive" | "disconnected" | "overdue" | "suspended" | "paid" | "unpaid" | "pending" | "verified" | "rejected" | "online" | "offline";

const toneByStatus: Record<KnownStatus, "success" | "warning" | "danger" | "muted" | "info"> = {
  active: "success",
  inactive: "muted",
  disconnected: "danger",
  overdue: "warning",
  suspended: "danger",
  paid: "success",
  unpaid: "warning",
  pending: "info",
  verified: "success",
  rejected: "danger",
  online: "success",
  offline: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase() as KnownStatus;
  const variant = toneByStatus[normalized] ?? "muted";

  return <Badge variant={variant}>{status}</Badge>;
}
