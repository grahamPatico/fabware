import { useQuery } from "convex/react";
import { Bolt, Hammer, MoveDiagonal, Cog, Flame } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const KIND_META: Record<string, { label: string; icon: typeof Bolt; tone: string; verb: string }> = {
  bolted:        { label: "Bolted",   icon: Bolt,         tone: "border-amber-500/40 bg-amber-500/5 text-amber-200",   verb: "bolted to" },
  pem_inserted:  { label: "PEM",      icon: Cog,          tone: "border-sky-500/40   bg-sky-500/5   text-sky-200",     verb: "PEM-inserted into" },
  riveted:       { label: "Riveted",  icon: Hammer,       tone: "border-rose-500/40  bg-rose-500/5  text-rose-200",    verb: "riveted to" },
  hinged:        { label: "Hinged",   icon: MoveDiagonal, tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200", verb: "hinged to" },
  weld_seam:     { label: "Welded",   icon: Flame,        tone: "border-orange-500/40 bg-orange-500/5 text-orange-200",  verb: "welded to" },
  weld_joint:    { label: "Tab+Weld", icon: Flame,        tone: "border-amber-600/40 bg-amber-600/5 text-amber-200",     verb: "tab-welded to" },
};

export default function InterfaceList({ projectId }: { projectId: Id<"projects"> }) {
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const partMap = new Map((parts ?? []).map(p => [p._id, { label: p.label, role: p.role }]));

  return (
    <div className="border-t border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Interfaces
        </h3>
        {interfaces && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {interfaces.length}
          </span>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
        {(!interfaces || interfaces.length === 0) && (
          <div className="px-3 py-3 font-mono text-[11px] text-muted-foreground/60">
            None yet — interfaces appear when parts are connected.
          </div>
        )}
        {interfaces?.map(i => {
          const meta = KIND_META[i.kind] ?? { label: i.kind, icon: Cog, tone: "border-border bg-muted/20 text-muted-foreground", verb: "connected to" };
          const Icon = meta.icon;
          const a = partMap.get(i.partA);
          const b = partMap.get(i.partB);
          const aLabel = a?.label ?? a?.role ?? "?";
          const bLabel = b?.label ?? b?.role ?? "?";
          const hardwareTotal = i.hardwareRefs.reduce((acc, h) => acc + h.quantity, 0);
          const hardwareLines = i.hardwareRefs.map(h => `${h.quantity}× ${h.mcmasterPartNumber}${h.role ? ` · ${h.role}` : ""}`);
          return (
            <div key={i._id} className="px-3 py-2 hover:bg-muted/20 transition-colors">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[9px] uppercase tracking-wider ${meta.tone}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                  {hardwareTotal > 0 && <span className="opacity-70">·{hardwareTotal}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] leading-tight text-foreground/90 truncate">
                    <span className="font-semibold">{aLabel}</span>
                    <span className="text-muted-foreground mx-1">{meta.verb}</span>
                    <span className="font-semibold">{bLabel}</span>
                  </div>
                  {hardwareLines.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hardwareLines.map((line, idx) => (
                        <span key={idx} className="font-mono text-[10px] text-muted-foreground/80 px-1 py-0.5 rounded bg-muted/30">
                          {line}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
