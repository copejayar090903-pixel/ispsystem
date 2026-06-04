import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

const tones = {
  blue: "from-blue-500 to-cyan-400",
  green: "from-emerald-500 to-lime-400",
  amber: "from-amber-500 to-orange-400",
  slate: "from-slate-600 to-slate-400",
};

export function StatCard({ label, value, change, tone = "blue" }: { label: string; value: string; change: string; tone?: keyof typeof tones }) {
  const positive = !change.startsWith("-");

  return (
    <Card className="overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
        </div>
        <div className={cn("h-12 w-12 rounded-2xl bg-gradient-to-br shadow-lg", tones[tone])} />
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        {positive ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> : <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />}
        <span>{change}</span>
      </div>
    </Card>
  );
}
