import React from "react";
import { useQuery } from "convex/react";
import { Check, X, AlertTriangle, Minus, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const STATUS_STYLES: Record<
  string,
  { icon: typeof Check; color: string; bg: string; border: string }
> = {
  pass: { icon: Check, color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  warn: { icon: AlertTriangle, color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  fail: { icon: X, color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/30" },
  na: { icon: Minus, color: "text-muted-foreground", bg: "bg-muted/20", border: "border-border" },
};

export default function RulesStatusStrip({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.validation.getAssemblyValidation, projectId ? { projectId } : "skip");

  if (data === undefined) {
    return (
      <div className="px-4 py-2 border-b border-border bg-card/60 backdrop-blur text-[11px] font-mono text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking assembly rules…
      </div>
    );
  }

  if (!data.rules || data.rules.length === 0) {
    return (
      <div className="px-4 py-2 border-b border-border bg-card/60 backdrop-blur text-[11px] font-mono text-muted-foreground">
        Assembly rules will appear once parts are defined.
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Assembly Rules ({data.rules.filter((r) => r.status === "pass").length}/
          {data.rules.length} pass)
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.rules.map((rule) => {
          const style = STATUS_STYLES[rule.status] ?? STATUS_STYLES.na;
          const Icon = style.icon;
          return (
            <div
              key={rule.id}
              title={rule.message}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border ${style.border} ${style.bg} ${style.color} font-mono text-[10px]`}
            >
              <Icon className="w-3 h-3" />
              <span className="uppercase tracking-wider">{rule.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
