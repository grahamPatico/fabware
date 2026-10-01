import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface RunStatusProps {
  /** Server timestamp (ms) the run started at. */
  startedAt: number;
  step?: string;
  toolCalls?: number;
}

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Live "what the agent is doing" row shown under the messages while a run is active. */
export default function RunStatus({ startedAt, step, toolCalls }: RunStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // The browser clock can trail the server's; never show a negative count.
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const actions = toolCalls ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded border border-primary/30 bg-card px-3 py-2 font-mono text-xs shadow-lg shadow-primary/5"
    >
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-foreground/90">{step ?? "Working"}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums">
          {/* The ticking counter is visual only, so screen readers announce
              step changes rather than every second. */}
          <span aria-hidden="true">{formatElapsed(elapsed)}</span>
          {actions > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {actions} {actions === 1 ? "action" : "actions"}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
