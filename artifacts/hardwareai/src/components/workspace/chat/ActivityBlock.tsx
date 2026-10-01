import { memo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Cog,
  Lightbulb,
  Link2,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Doc } from "../../../../convex/_generated/dataModel";

type Message = Doc<"messages">;

/** Icon for one agent action, chosen by the tool it called. */
export function iconForTool(toolName: string | undefined): LucideIcon {
  const name = toolName ?? "";
  if (name.startsWith("search")) return Search;
  if (name === "add_interface") return Link2;
  if (name.startsWith("add_")) return Plus;
  if (name === "remove_part") return Trash2;
  if (name.startsWith("refine") || name.startsWith("update")) return Wrench;
  if (name === "check_manufacturing") return ShieldCheck;
  if (name === "gather_inspiration") return Lightbulb;
  if (name === "capture_scope") return SlidersHorizontal;
  return Cog;
}

function readableToolName(toolName: string | undefined): string {
  const name = (toolName ?? "").replace(/_/g, " ").trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Action";
}

function ActivityRow({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false);
  const text = msg.content.trim();
  // The row already carries an icon, and results are written as light
  // markdown for the model: drop the leading emoji and the bold markers.
  const firstLine =
    text
      .split("\n")
      .map((line) => line.replace(/^[^\p{L}\p{N}"'(]+/u, "").replace(/\*\*/g, "").trim())
      .find((line) => line !== "") ?? readableToolName(msg.toolName);
  const expandable = text.includes("\n");
  const failed = msg.isError === true;
  const Icon = failed ? AlertTriangle : iconForTool(msg.toolName);

  const summary = (
    <>
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${failed ? "text-amber-300" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate" title={firstLine}>
        {failed && <span className="sr-only">Failed: </span>}
        {firstLine}
      </span>
      {expandable && (
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      )}
    </>
  );

  const rowTone = failed ? "bg-amber-500/10 text-amber-200" : "text-foreground/90";

  return (
    <li className={rowTone}>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {summary}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1.5">{summary}</div>
      )}
      {expandable && open && (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/40 bg-background/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/80">
          {text}
        </div>
      )}
    </li>
  );
}

/** A run of consecutive agent actions, collapsed into one card. */
function ActivityBlockImpl({ rows }: { rows: Message[] }) {
  const failedCount = rows.filter((r) => r.isError === true).length;
  return (
    <div className="w-full overflow-hidden rounded border border-border bg-card/60 font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <ListChecks className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {rows.length} {rows.length === 1 ? "action" : "actions"}
        </span>
        {failedCount > 0 && (
          <span className="text-amber-300">· {failedCount} failed</span>
        )}
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((row) => (
          <ActivityRow key={row._id} msg={row} />
        ))}
      </ul>
    </div>
  );
}

const ActivityBlock = memo(ActivityBlockImpl);
export default ActivityBlock;
