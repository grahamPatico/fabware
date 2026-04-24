import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export default function InterfaceList({ projectId }: { projectId: Id<"projects"> }) {
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const partMap = new Map((parts ?? []).map(p => [p._id, p.role]));

  return (
    <div className="border-t border-border">
      <div className="p-3 border-b border-border">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Interfaces {interfaces && `(${interfaces.length})`}
        </h3>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {interfaces?.map(i => (
          <div key={i._id} className="p-2 border-b border-border/40 font-mono text-[11px]">
            {partMap.get(i.partA) ?? "?"} ←{i.kind}×{i.hardwareRefs.reduce((a, h) => a + h.quantity, 0)}→ {partMap.get(i.partB) ?? "?"}
          </div>
        ))}
      </div>
    </div>
  );
}
