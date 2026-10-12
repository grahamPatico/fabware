import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { JourneyView } from "../../../../convex/lib/journey";
import { Skeleton } from "@/components/ui/skeleton";
import { Prose, Section } from "../parts";

interface MechanicalStageProps {
  mechanical: JourneyView["mechanical"];
  /** The first message for the design agent. Undefined while it loads. */
  brief: string | undefined;
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function MechanicalStage({ mechanical, brief }: MechanicalStageProps) {
  if (mechanical.partCount === 0) {
    return (
      <div className="space-y-4">
        <Prose className="text-muted-foreground">
          The design agent starts from this brief. It is built from the steps you have finished so far.
        </Prose>
        <Section title="Design brief">
          {brief === undefined ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading the brief">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : brief.trim() === "" ? (
            <Prose className="text-muted-foreground">
              There is no brief yet. Finish the earlier steps first.
            </Prose>
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {brief}
            </pre>
          )}
        </Section>
      </div>
    );
  }

  const clean = mechanical.fails === 0 && mechanical.warns === 0;
  return (
    <div className="space-y-4">
      <p className="text-lg font-bold tracking-tight">{countLabel(mechanical.partCount, "part", "parts")}</p>
      {clean ? (
        <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span className="text-emerald-200">No rule failures</span>
        </div>
      ) : (
        <div
          className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
            mechanical.fails > 0
              ? "border-destructive/40 bg-destructive/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}
        >
          <AlertTriangle
            className={`mt-0.5 h-4 w-4 shrink-0 ${mechanical.fails > 0 ? "text-destructive" : "text-amber-300"}`}
          />
          <div className="min-w-0 space-y-1">
            <p>
              <span className={mechanical.fails > 0 ? "font-bold text-destructive" : "text-muted-foreground"}>
                {countLabel(mechanical.fails, "rule failure", "rule failures")}
              </span>
              <span className="text-muted-foreground"> · </span>
              <span className={mechanical.warns > 0 ? "text-amber-200" : "text-muted-foreground"}>
                {countLabel(mechanical.warns, "warning", "warnings")}
              </span>
            </p>
            <p className="text-muted-foreground">
              {mechanical.fails > 0
                ? "Open the studio and ask the agent to fix the failures before you order."
                : "The warnings are worth a look in the studio."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
