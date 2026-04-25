import { useQuery } from "convex/react";
import { Check, X, AlertTriangle, Minus, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Status = "pass" | "warn" | "fail";

const STATUS_STYLES: Record<
  string,
  { icon: typeof Check; color: string; bg: string; border: string }
> = {
  pass: { icon: Check, color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  warn: { icon: AlertTriangle, color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  fail: { icon: X, color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/30" },
  na: { icon: Minus, color: "text-muted-foreground", bg: "bg-muted/20", border: "border-border" },
};

const STATUS_RANK: Record<Status, number> = { pass: 0, warn: 1, fail: 2 };

interface AggregatedRule {
  id: string;
  label: string;
  status: Status;
  total: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  messages: string[];
}

function aggregate(rules: Array<{ id: string; label: string; status: string; message?: string }>): AggregatedRule[] {
  const map = new Map<string, AggregatedRule>();
  for (const r of rules) {
    const status = (r.status === "pass" || r.status === "warn" || r.status === "fail") ? r.status : "pass";
    const existing = map.get(r.id);
    if (existing) {
      existing.total += 1;
      if (status === "pass") existing.passCount += 1;
      else if (status === "warn") existing.warnCount += 1;
      else existing.failCount += 1;
      if (STATUS_RANK[status] > STATUS_RANK[existing.status]) existing.status = status;
      if (r.message && existing.messages.length < 5) existing.messages.push(r.message);
    } else {
      map.set(r.id, {
        id: r.id,
        label: r.label,
        status,
        total: 1,
        passCount: status === "pass" ? 1 : 0,
        warnCount: status === "warn" ? 1 : 0,
        failCount: status === "fail" ? 1 : 0,
        messages: r.message ? [r.message] : [],
      });
    }
  }
  // Stable order: fail → warn → pass, then by label
  return Array.from(map.values()).sort((a, b) => {
    const rd = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    return rd !== 0 ? rd : a.label.localeCompare(b.label);
  });
}

function tooltipFor(rule: AggregatedRule): string {
  if (rule.total === 1) return rule.messages[0] ?? rule.label;
  const counts: string[] = [];
  if (rule.failCount) counts.push(`${rule.failCount} fail`);
  if (rule.warnCount) counts.push(`${rule.warnCount} warn`);
  if (rule.passCount) counts.push(`${rule.passCount} pass`);
  const head = `${rule.label} — ${rule.total} interfaces (${counts.join(", ")})`;
  if (rule.messages.length === 0) return head;
  return `${head}\n\n${rule.messages.join("\n")}`;
}

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

  const aggregated = aggregate(data.rules);
  const passInstances = data.rules.filter(r => r.status === "pass").length;

  return (
    <div className="px-3 py-2 border-b border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Assembly Rules ({passInstances}/{data.rules.length} pass)
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {aggregated.map(rule => {
          const style = STATUS_STYLES[rule.status] ?? STATUS_STYLES.na;
          const Icon = style.icon;
          return (
            <div
              key={rule.id}
              title={tooltipFor(rule)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border ${style.border} ${style.bg} ${style.color} font-mono text-[10px]`}
            >
              <Icon className="w-3 h-3" />
              <span className="uppercase tracking-wider">{rule.label}</span>
              {rule.total > 1 && (
                <span className="text-[9px] opacity-70">
                  ({rule.failCount > 0 ? `${rule.failCount}/` : ""}{rule.total})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
