import { useQuery } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PartKindBadge } from "./PartKindBadge";

interface Props {
  projectId: Id<"projects">;
  focusedPartId: Id<"parts"> | null;
  onFocusPart: (id: Id<"parts"> | null) => void;
  hiddenPartIds?: Set<string>;
  onTogglePart?: (id: Id<"parts">) => void;
}

export default function PartList({ projectId, focusedPartId, onFocusPart, hiddenPartIds, onTogglePart }: Props) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <div className="flex flex-col min-h-0">
      <div className="p-3 border-b border-border">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Parts</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {parts === undefined && <div className="p-3 text-xs font-mono text-muted-foreground">Loading…</div>}
        {parts?.length === 0 && <div className="p-3 text-xs font-mono text-muted-foreground italic">No parts yet.</div>}
        {parts?.map(p => {
          const hidden = hiddenPartIds?.has(p._id as unknown as string) ?? false;
          return (
            <div
              key={p._id}
              className={`flex items-stretch border-b border-border/40 ${
                p._id === focusedPartId ? "bg-primary/10 border-l-2 border-l-primary" : ""
              } ${hidden ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                onClick={() => onFocusPart(p._id === focusedPartId ? null : p._id)}
                className="flex-1 text-left p-2.5 font-mono text-xs hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold">{p.label}</span>
                  <PartKindBadge kind={p.kind} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {p.partType} · {p.material ?? "—"} · {p.thickness ?? "—"}"
                </div>
              </button>
              {onTogglePart && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onTogglePart(p._id); }}
                  className="px-2.5 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                  title={hidden ? "Show" : "Hide"}
                  aria-label={hidden ? "Show part" : "Hide part"}
                >
                  {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
