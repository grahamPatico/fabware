import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, X, AlertTriangle, Minus, Loader2, Wrench } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { readChatPrefs } from "@/lib/chatPrefs";

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
  const head = `${rule.label}: ${rule.total} checks (${counts.join(", ")})`;
  if (rule.messages.length === 0) return head;
  return `${head}\n\n${rule.messages.join("\n")}`;
}

interface Props {
  projectId: Id<"projects">;
  /** Offer a one-click "ask the agent to fix this" action. Off for shared views. */
  canFix?: boolean;
}

export default function RulesStatusStrip({ projectId, canFix = false }: Props) {
  const data = useQuery(api.validation.getAssemblyValidation, projectId ? { projectId } : "skip");
  const project = useQuery(api.projects.get, canFix && projectId ? { projectId } : "skip");
  const startRun = useMutation(api.agentRuns.start);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);
  const [fixError, setFixError] = useState(false);

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
        Manufacturing checks appear here once the design has parts.
      </div>
    );
  }

  const aggregated = aggregate(data.rules);
  const passInstances = data.rules.filter((r: { status: string }) => r.status === "pass").length;
  const failing = aggregated.filter((r) => r.status === "fail");
  const openRule = aggregated.find((r) => r.id === openRuleId) ?? null;
  const agentBusy = project?.agentRun?.status === "running";

  const askAgentToFix = async () => {
    setFixError(false);
    const { model, effort } = readChatPrefs();
    const list = failing.map((r) => `- ${r.label}: ${r.messages[0] ?? ""}`).join("\n");
    try {
      await startRun({
        projectId,
        content: `Fix the failing manufacturing checks:\n${list}`,
        model,
        effort,
      });
    } catch {
      setFixError(true);
    }
  };

  return (
    <div className="px-3 py-2 border-b border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Checks ({passInstances}/{data.rules.length} pass)
        </div>
        {canFix && failing.length > 0 && (
          <button
            type="button"
            onClick={askAgentToFix}
            disabled={agentBusy}
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary font-mono text-[10px] uppercase tracking-wider hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wrench className="w-3 h-3" />
            {agentBusy ? "Agent working" : fixError ? "Couldn't start. Retry" : `Fix ${failing.length === 1 ? "this" : "these"} for me`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {aggregated.map(rule => {
          const style = STATUS_STYLES[rule.status] ?? STATUS_STYLES.na;
          const Icon = style.icon;
          const isOpen = openRuleId === rule.id;
          return (
            <button
              type="button"
              key={rule.id}
              title={tooltipFor(rule)}
              aria-expanded={isOpen}
              onClick={() => setOpenRuleId(isOpen ? null : rule.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border ${style.border} ${style.bg} ${style.color} font-mono text-[10px] hover:brightness-125 ${isOpen ? "ring-1 ring-current" : ""}`}
            >
              <Icon className="w-3 h-3" />
              <span className="uppercase tracking-wider">{rule.label}</span>
              {rule.total > 1 && (
                <span className="text-[9px] opacity-70">
                  ({rule.failCount > 0 ? `${rule.failCount}/` : ""}{rule.total})
                </span>
              )}
            </button>
          );
        })}
      </div>
      {openRule && (
        <div className="mt-2 rounded border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
          {openRule.messages.length === 0 ? (
            <p>{openRule.label}</p>
          ) : (
            openRule.messages.map((m, i) => <p key={i}>{m}</p>)
          )}
        </div>
      )}
    </div>
  );
}
