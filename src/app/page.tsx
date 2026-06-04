import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-cyan-700">ISP Billing System</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            MikroTik PPPoE administration with Supabase customer records.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Manage RouterOS PPPoE accounts through server-side Next.js routes and sync subscribers into your Supabase customers table.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/pppoe"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-300 hover:shadow-md"
          >
            <p className="text-lg font-semibold text-slate-950">PPPoE Accounts</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              View live RouterOS secrets, enable or disable users, and sync customers.
            </p>
          </Link>
          <Link
            href="/admin/customers"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-300 hover:shadow-md"
          >
            <p className="text-lg font-semibold text-slate-950">Customers</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add subscriber records using PPPoE accounts and profiles fetched from MikroTik.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}