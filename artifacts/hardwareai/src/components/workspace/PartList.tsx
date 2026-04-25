import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PartKindBadge } from "./PartKindBadge";

interface Props {
  projectId: Id<"projects">;
  focusedPartId: Id<"parts"> | null;
  onFocusPart: (id: Id<"parts"> | null) => void;
}

export default function PartList({ projectId, focusedPartId, onFocusPart }: Props) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <div className="flex flex-col min-h-0">
      <div className="p-3 border-b border-border">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Parts</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {parts === undefined && <div className="p-3 text-xs font-mono text-muted-foreground">Loading…</div>}
        {parts?.length === 0 && <div className="p-3 text-xs font-mono text-muted-foreground italic">No parts yet.</div>}
        {parts?.map(p => (
          <button
            key={p._id}
            onClick={() => onFocusPart(p._id === focusedPartId ? null : p._id)}
            className={`w-full text-left p-2.5 border-b border-border/40 font-mono text-xs hover:bg-muted/40 transition-colors ${
              p._id === focusedPartId ? "bg-primary/10 border-l-2 border-l-primary" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">{p.label}</span>
              <PartKindBadge kind={p.kind} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {p.partType} · {p.material ?? "—"} · {p.thickness ?? "—"}"
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
