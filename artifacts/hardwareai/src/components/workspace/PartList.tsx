import { useState } from "react";
import { useMutation, useQuery, useConvex } from "convex/react";
import { Eye, EyeOff, Trash2, Download, FileText } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PartKindBadge } from "./PartKindBadge";

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
  const weightByPart = new Map((weights?.perPart ?? []).map(w => [w.partId, w]));
  const costByPart = new Map((costs?.perPart ?? []).map(c => [c.partId, c]));
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
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{p.partType}</span>
                  <span>·</span>
                  <span>{p.material ?? "—"}</span>
                  <span>·</span>
                  <span>{p.thickness ?? "—"}"</span>
                  {weightByPart.has(p._id) && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">
                        {weightByPart.get(p._id)!.pounds.toFixed(2)} lb
                      </span>
                    </>
                  )}
                  {costByPart.has(p._id) && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">
                        ${costByPart.get(p._id)!.totalUsd.toFixed(2)}
                      </span>
                    </>
                  )}
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
              {(p.kind ?? "sheet_metal") === "sheet_metal" && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDownloadDxf(p._id); }}
                    className="px-2.5 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Download flat-pattern DXF"
                    aria-label="Download DXF"
                    disabled={downloading === (p._id as unknown as string)}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDownloadPdf(p._id); }}
                    className="px-2.5 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Download shop-drawing PDF"
                    aria-label="Download PDF"
                    disabled={downloading === (p._id as unknown as string)}
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
                    if (confirmingId === p._id) {
                      handleDelete(p._id);
                    } else {
                      setConfirmingId(p._id as unknown as string);
                    }
                  }}
                  onBlur={() => { if (confirmingId === p._id) setConfirmingId(null); }}
                  className={`px-2.5 transition-colors ${
                    confirmingId === p._id
                      ? "bg-rose-500/30 text-rose-200 hover:bg-rose-500/50"
                      : "hover:bg-rose-500/15 text-muted-foreground hover:text-rose-300"
                  }`}
                  title={confirmingId === p._id ? "Click again to confirm delete" : "Delete part"}
                  aria-label="Delete part"
                  disabled={deleting}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
