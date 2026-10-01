import { useState } from "react";
import { useMutation, useQuery, useConvex } from "convex/react";
import { Eye, EyeOff, Trash2, Download, FileText } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PartKindBadge } from "./PartKindBadge";

/** Per-part rows returned by `api.manufacturing.weightSummary` / `costSummary`. */
type WeightRow = { partId: string; role: string; label: string; material: string | null; thickness: number | null; pounds: number; kg: number; areaIn2: number };
type CostRow = { partId: string; role: string; label: string; material: number; cuts: number; bends: number; finish: number; totalUsd: number };

const ACTION_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50";

interface Props {
  projectId: Id<"projects">;
  focusedPartId: Id<"parts"> | null;
  onFocusPart: (id: Id<"parts"> | null) => void;
  hiddenPartIds?: Set<string>;
  onTogglePart?: (id: Id<"parts">) => void;
  readOnly?: boolean;
}

export default function PartList({ projectId, focusedPartId, onFocusPart, hiddenPartIds, onTogglePart, readOnly = false }: Props) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const weights = useQuery(api.manufacturing.weightSummary, projectId ? { projectId } : "skip");
  const costs = useQuery(api.manufacturing.costSummary, projectId ? { projectId } : "skip");
  const weightByPart = new Map<string, WeightRow>((weights?.perPart ?? []).map((w: WeightRow) => [w.partId, w]));
  const costByPart = new Map<string, CostRow>((costs?.perPart ?? []).map((c: CostRow) => [c.partId, c]));
  const removePart = useMutation(api.parts.removePart);
  const convex = useConvex();
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownloadDxf = async (id: Id<"parts">) => {
    setDownloading(id as unknown as string);
    try {
      const result = await convex.query(api.dxf.partDxf, { partId: id });
      if (!result) return;
      const blob = new Blob([result.dxf], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadPdf = async (id: Id<"parts">) => {
    setDownloading(id as unknown as string);
    try {
      const result = await convex.query(api.pdf.partPdf, { partId: id });
      if (!result) return;
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (id: Id<"parts">) => {
    if (deleting) return;
    setDeleting(true);
    try {
      if (id === focusedPartId) onFocusPart(null);
      await removePart({ partId: id });
    } finally {
      setConfirmingId(null);
      setDeleting(false);
    }
  };
  return (
    <div className="flex flex-col min-h-0">
      <div className="p-3 border-b border-border flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Parts</h3>
        {(weights || costs) && (
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground flex flex-col items-end gap-0.5">
            {weights && weights.totals.pounds > 0 && (
              <span>≈ {weights.totals.pounds.toFixed(2)} lb · {weights.totals.kg.toFixed(2)} kg</span>
            )}
            {costs && costs.totals.totalUsd > 0 && (
              <span title="First-pass SCS cost estimate (±30%)">
                ≈ ${costs.totals.totalUsd.toFixed(2)} SCS
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {parts === undefined && <div className="p-3 text-xs font-mono text-muted-foreground">Loading…</div>}
        {parts?.length === 0 && <div className="p-3 text-xs font-mono text-muted-foreground italic">No parts yet.</div>}
        {parts?.map((p: Doc<"parts">) => {
          const key = p._id as unknown as string;
          const hidden = hiddenPartIds?.has(key) ?? false;
          const focused = p._id === focusedPartId;
          const confirming = confirmingId === key;
          const busy = downloading === key;
          const isSheetMetal = (p.kind ?? "sheet_metal") === "sheet_metal";
          const hasActions = !!onTogglePart || isSheetMetal || !readOnly;
          const weight = weightByPart.get(p._id);
          const cost = costByPart.get(p._id);
          const meta = [
            p.partType,
            p.material ?? "—",
            `${p.thickness ?? "—"}"`,
            weight ? `${weight.pounds.toFixed(2)} lb` : null,
            cost ? `$${cost.totalUsd.toFixed(2)}` : null,
          ].filter((v): v is string => !!v).join(" · ");
          // Actions never take width from the row text. On the focused part
          // they sit on their own line; on the others they float over the end
          // of the meta line while the row is hovered or holds keyboard
          // focus, so moving the pointer down the list doesn't make rows jump
          // and the label line stays clickable across its full width.
          const actionsClass = focused
            ? "flex items-center gap-0.5 px-1.5 pb-1.5"
            : `absolute right-1 bottom-0.5 z-10 items-center gap-0.5 rounded border border-border bg-card shadow-md ${
                confirming || busy ? "flex" : "hidden group-hover:flex group-focus-within:flex"
              }`;
          const actionSize = focused ? "h-6 w-6" : "h-[22px] w-[22px]";
          const actionButton = `${ACTION_BUTTON} ${actionSize}`;
          return (
            <div
              key={p._id}
              className={`group relative border-b border-border/40 ${
                focused ? "bg-primary/10 border-l-2 border-l-primary" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onFocusPart(focused ? null : p._id)}
                aria-pressed={focused}
                className={`block w-full min-w-0 px-2.5 py-2 text-left font-mono text-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 ${
                  hidden ? "opacity-40" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-bold" title={p.label}>{p.label}</span>
                  <span className="shrink-0"><PartKindBadge kind={p.kind} /></span>
                </div>
                <div className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground" title={meta}>
                  {meta}
                </div>
              </button>
              {hasActions && (
              <div className={actionsClass}>
                {onTogglePart && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTogglePart(p._id); }}
                    className={actionButton}
                    title={hidden ? "Show in 3D view" : "Hide in 3D view"}
                    aria-label={hidden ? `Show ${p.label}` : `Hide ${p.label}`}
                  >
                    {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
                {isSheetMetal && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDownloadDxf(p._id); }}
                      className={actionButton}
                      title="Download flat-pattern DXF"
                      aria-label={`Download DXF for ${p.label}`}
                      disabled={busy}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDownloadPdf(p._id); }}
                      className={actionButton}
                      title="Download shop-drawing PDF"
                      aria-label={`Download PDF for ${p.label}`}
                      disabled={busy}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirming) {
                        handleDelete(p._id);
                      } else {
                        setConfirmingId(key);
                      }
                    }}
                    onBlur={() => { if (confirming) setConfirmingId(null); }}
                    className={`inline-flex shrink-0 items-center justify-center gap-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50 ${
                      confirming
                        ? `${focused ? "h-6" : "h-[22px]"} bg-rose-500/30 px-1.5 text-rose-200 hover:bg-rose-500/50`
                        : `${actionSize} text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300`
                    }`}
                    title={confirming ? "Click again to confirm delete" : "Delete part"}
                    aria-label={confirming ? `Confirm delete ${p.label}` : `Delete ${p.label}`}
                    disabled={deleting}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {confirming && <span className="font-mono text-[10px] uppercase tracking-wider">Delete?</span>}
                  </button>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
