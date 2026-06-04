export type CustomerStatus = "active" | "disconnected" | "overdue" | "suspended";
export type BillStatus = "paid" | "unpaid" | "overdue" | "suspended";
export type PaymentStatus = "pending" | "verified" | "rejected";

export const dashboardStats = [
  { label: "Total Customers", value: "1,284", change: "+8.2%", tone: "blue" },
  { label: "Active Customers", value: "1,096", change: "+5.1%", tone: "green" },
  { label: "Disconnected", value: "72", change: "-2.4%", tone: "slate" },
  { label: "Overdue Accounts", value: "116", change: "+12", tone: "amber" },
  { label: "Pending Payments", value: "38", change: "+6 today", tone: "blue" },
  { label: "Monthly Revenue", value: "₱1.42M", change: "+14.3%", tone: "green" },
  { label: "Online PPPoE", value: "934", change: "72.7% online", tone: "green" },
  { label: "Offline PPPoE", value: "350", change: "27.3% offline", tone: "slate" },
];

export const revenueData = [
  { month: "Jan", revenue: 980000, target: 900000 },
  { month: "Feb", revenue: 1045000, target: 940000 },
  { month: "Mar", revenue: 1102000, target: 980000 },
  { month: "Apr", revenue: 1188000, target: 1040000 },
  { month: "May", revenue: 1295000, target: 1110000 },
  { month: "Jun", revenue: 1420000, target: 1200000 },
];

export const paidUnpaidData = [
  { name: "Paid", value: 856 },
  { name: "Unpaid", value: 312 },
  { name: "Overdue", value: 116 },
];

export const growthData = [
  { month: "Jan", customers: 1028 },
  { month: "Feb", customers: 1074 },
  { month: "Mar", customers: 1136 },
  { month: "Apr", customers: 1182 },
  { month: "May", customers: 1231 },
  { month: "Jun", customers: 1284 },
];

export const planDistributionData = [
  { name: "20Mbps", customers: 442 },
  { name: "30Mbps", customers: 386 },
  { name: "50Mbps", customers: 298 },
  { name: "100Mbps", customers: 158 },
];

export const sampleCustomers = [
  {
    accountNumber: "ISP-000124",
    fullName: "Juan Dela Cruz",
    address: "Poblacion, San Jose",
    contactNumber: "0917 123 4567",
    email: "juan@example.com",
    pppoeUsername: "juan124",
    plan: "Plan 1299 - 30Mbps",
    dueDate: "2026-06-10",
    status: "active" as CustomerStatus,
    createdAt: "2026-01-12",
  },
  {
    accountNumber: "ISP-000125",
    fullName: "Maria Santos",
    address: "Zone 4, Riverside",
    contactNumber: "0998 884 2211",
    email: "maria@example.com",
    pppoeUsername: "maria125",
    plan: "Plan 999 - 20Mbps",
    dueDate: "2026-06-05",
    status: "overdue" as CustomerStatus,
    createdAt: "2026-02-03",
  },
  {
    accountNumber: "ISP-000126",
    fullName: "Ramon Garcia",
    address: "Greenfield Subdivision",
    contactNumber: "0920 221 7788",
    email: "ramon@example.com",
    pppoeUsername: "ramon126",
    plan: "Plan 1499 - 50Mbps",
    dueDate: "2026-06-15",
    status: "suspended" as CustomerStatus,
    createdAt: "2026-03-19",
  },
  {
    accountNumber: "ISP-000127",
    fullName: "Ana Reyes",
    address: "Maharlika Highway",
    contactNumber: "0915 331 9090",
    email: "ana@example.com",
    pppoeUsername: "ana127",
    plan: "Plan 1999 - 100Mbps",
    dueDate: "2026-06-20",
    status: "active" as CustomerStatus,
    createdAt: "2026-04-07",
  },
];

export const samplePlans = [
  { name: "Plan 999 - 20Mbps", speed: "20Mbps", monthlyFee: 999, profile: "plan-20mbps", status: "Active", description: "Entry home fiber plan" },
  { name: "Plan 1299 - 30Mbps", speed: "30Mbps", monthlyFee: 1299, profile: "plan-30mbps", status: "Active", description: "Balanced family streaming plan" },
  { name: "Plan 1499 - 50Mbps", speed: "50Mbps", monthlyFee: 1499, profile: "plan-50mbps", status: "Active", description: "Work-from-home and gaming plan" },
  { name: "Plan 1999 - 100Mbps", speed: "100Mbps", monthlyFee: 1999, profile: "plan-100mbps", status: "Active", description: "Premium household plan" },
];

export const sampleBillings = [
  { id: "BILL-2026-0001", accountNumber: "ISP-000124", customerName: "Juan Dela Cruz", plan: "Plan 1299", amount: 1299, billingMonth: "June 2026", dueDate: "2026-06-10", status: "paid" as BillStatus },
  { id: "BILL-2026-0002", accountNumber: "ISP-000125", customerName: "Maria Santos", plan: "Plan 999", amount: 999, billingMonth: "June 2026", dueDate: "2026-06-05", status: "overdue" as BillStatus },
  { id: "BILL-2026-0003", accountNumber: "ISP-000126", customerName: "Ramon Garcia", plan: "Plan 1499", amount: 1499, billingMonth: "June 2026", dueDate: "2026-06-15", status: "suspended" as BillStatus },
  { id: "BILL-2026-0004", accountNumber: "ISP-000127", customerName: "Ana Reyes", plan: "Plan 1999", amount: 1999, billingMonth: "June 2026", dueDate: "2026-06-20", status: "unpaid" as BillStatus },
];

export const samplePayments = [
  { id: "PAY-10042", accountNumber: "ISP-000124", customerName: "Juan Dela Cruz", amount: 1299, method: "GCash", reference: "GC-884201", proof: "Uploaded", status: "verified" as PaymentStatus, submittedAt: "2026-06-02 08:42", verifiedAt: "2026-06-02 09:04" },
  { id: "PAY-10043", accountNumber: "ISP-000125", customerName: "Maria Santos", amount: 999, method: "Maya", reference: "MY-201955", proof: "Uploaded", status: "pending" as PaymentStatus, submittedAt: "2026-06-03 10:16", verifiedAt: "-" },
  { id: "PAY-10044", accountNumber: "ISP-000126", customerName: "Ramon Garcia", amount: 1499, method: "Bank Transfer", reference: "BT-766912", proof: "Uploaded", status: "rejected" as PaymentStatus, submittedAt: "2026-06-01 19:02", verifiedAt: "2026-06-01 20:20" },
];

export const activityItems = [
  { title: "Payment verified", detail: "Juan Dela Cruz paid ₱1,299 via GCash", time: "12 min ago", type: "payment" },
  { title: "PPPoE disabled", detail: "maria125 was disabled due to overdue bill", time: "42 min ago", type: "mikrotik" },
  { title: "New customer", detail: "Ana Reyes synced from MikroTik PPPoE secrets", time: "1 hr ago", type: "customer" },
  { title: "MikroTik sync", detail: "1,284 PPPoE secrets scanned successfully", time: "2 hrs ago", type: "sync" },
];
