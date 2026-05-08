import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Scissors, CornerUpRight, Layers, AlertTriangle, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  focusedPartId: Id<"parts"> | null;
}

const STATUS_TONE: Record<string, string> = {
  pass: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  warn: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  fail: "text-rose-300 bg-rose-500/10 border-rose-500/30",
};

const STEP_ICON = {
  cut: Scissors,
  bend: CornerUpRight,
  interference: Layers,
} as const;

export default function BendSimulatorPanel({ focusedPartId }: Props) {
  const sim = useQuery(
    api.simulation.simulatePartById,
    focusedPartId ? { partId: focusedPartId } : "skip",
  );
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset to first step when the focused part changes.
  useEffect(() => { setActiveIdx(0); }, [focusedPartId]);

  const stepSummary = useMemo(() => {
    if (!sim) return null;
    return sim.steps.map(s => {
      const fails = s.rules.filter(r => r.status === "fail").length;
      const warns = s.rules.filter(r => r.status === "warn").length;
      const status: "pass" | "warn" | "fail" = fails > 0 ? "fail" : warns > 0 ? "warn" : "pass";
      return { id: s.id, status, label: s.label, kind: s.kind };
    });
  }, [sim]);

  if (!focusedPartId) {
    return (
      <div className="border-t border-border bg-card/30 px-3 py-2 font-mono text-[11px] text-muted-foreground/70">
        Select a sheet-metal part to simulate its laser-cut + bend sequence.
      </div>
    );
  }

  if (sim === undefined) {
    return <div className="border-t border-border bg-card/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">Loading simulator…</div>;
  }

  if (sim === null) {
    return (
      <div className="border-t border-border bg-card/30 px-3 py-2 font-mono text-[11px] text-muted-foreground/70">
        Simulator only runs on sheet-metal parts. (Selected part is printed/purchased or has no DSL.)
      </div>
    );
  }

  const active = sim.steps[activeIdx] ?? sim.steps[0];

  return (
    <div className="border-t border-border bg-card/40 flex flex-col max-h-72">
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Bend simulator</span>
          <span className="font-mono text-[11px] text-foreground">{sim.partLabel}</span>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {sim.steps.length} step{sim.steps.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Step strip */}
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
        {stepSummary?.map((s, i) => {
          const Icon = STEP_ICON[s.kind];
          const tone = STATUS_TONE[s.status];
          const isActive = i === activeIdx;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-[10px] uppercase tracking-wider transition-colors ${tone} ${
                  isActive ? "ring-1 ring-primary/60 shadow shadow-primary/20" : "opacity-80 hover:opacity-100"
                }`}
                title={s.label}
              >
                <Icon className="w-3 h-3" />
                <span className="truncate max-w-[12rem]">{s.label}</span>
                <span className="opacity-70">·</span>
                {s.status === "pass" && <CheckCircle2 className="w-3 h-3" />}
                {s.status === "warn" && <AlertTriangle className="w-3 h-3" />}
                {s.status === "fail" && <XCircle className="w-3 h-3" />}
              </button>
              {i < (stepSummary.length - 1) && <ChevronRight className="w-3 h-3 text-muted-foreground/60" />}
            </div>
          );
        })}
      </div>

      {/* Active step's rules */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
          {active.label}
        </div>
        <div className="flex flex-col gap-1">
          {active.rules.length === 0 && (
            <div className="font-mono text-[11px] text-muted-foreground/70 italic">No checks for this step.</div>
          )}
          {active.rules.map(r => {
            const tone = STATUS_TONE[r.status];
            return (
              <div key={r.id} className={`flex items-start gap-2 px-2 py-1.5 rounded border ${tone}`}>
                <span className="mt-0.5 shrink-0">
                  {r.status === "pass" && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {r.status === "warn" && <AlertTriangle className="w-3.5 h-3.5" />}
                  {r.status === "fail" && <XCircle className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] font-semibold text-foreground/90">{r.label}</div>
                  <div className="font-mono text-[11px] text-foreground/80 mt-0.5">{r.message}</div>
                  {r.suggestion && (
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">→ {r.suggestion}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
