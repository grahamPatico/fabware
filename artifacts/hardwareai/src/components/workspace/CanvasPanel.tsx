import React, { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPartSpec,
  useExportDxf,
  useListRevisions,
  useUndoRevision,
  useRedoRevision,
  useGetRevision,
  getGetPartSpecQueryKey,
  getListRevisionsQueryKey,
  getGetValidationQueryKey,
  getGetProjectMessagesQueryKey,
  getGetRevisionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
  History,
  Eye,
  X,
  Square,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FoldedPreview = lazy(() => import("./FoldedPreview"));

function safeJsonArray(s: string | null | undefined): number[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

interface Props {
  projectId: number;
  previewRevisionId?: number | null;
  onClearPreview?: () => void;
  onOpenHistory?: () => void;
}

export default function CanvasPanel({
  projectId,
  previewRevisionId = null,
  onClearPreview,
  onOpenHistory,
}: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: activeSpec, isLoading: isLoadingSpec } = useGetPartSpec(projectId, {
    query: { enabled: !!projectId, queryKey: getGetPartSpecQueryKey(projectId) },
  });
  const { data: revisions = [] } = useListRevisions(projectId, {
    query: { enabled: !!projectId, queryKey: getListRevisionsQueryKey(projectId) },
  });
  const { data: previewData, isLoading: isLoadingPreview } = useGetRevision(
    projectId,
    previewRevisionId ?? 0,
    {
      query: {
        enabled: !!projectId && previewRevisionId != null,
        queryKey: getGetRevisionQueryKey(projectId, previewRevisionId ?? 0),
      },
    }
  );

  const exportDxf = useExportDxf();
  const undoMut = useUndoRevision();
  const redoMut = useRedoRevision();

  const isPreviewing = previewRevisionId != null;
  const partSpec = isPreviewing ? previewData?.partSpec ?? null : activeSpec ?? null;
  const previewRev = isPreviewing
    ? revisions.find((r) => r.id === previewRevisionId)
    : null;

  const currentIdx = activeSpec?.currentRevisionId
    ? revisions.findIndex((r) => r.id === activeSpec.currentRevisionId)
    : revisions.length - 1;
  const canUndo = currentIdx > 0;
  const canRedo = currentIdx >= 0 && currentIdx < revisions.length - 1;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetPartSpecQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getListRevisionsQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetValidationQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectMessagesQueryKey(projectId) });
  };

  const [view, setView] = useState<"flat" | "folded">("flat");

  const bendAnglesArr = safeJsonArray(partSpec?.bendAngles);
  const hasBend = bendAnglesArr.length > 0;
  const canFold = hasBend && !!partSpec?.svgPreview && !!partSpec?.width && !!partSpec?.height;

  const handleExport = () => {
    if (!activeSpec?.id) return;
    exportDxf.mutate(
      { id: projectId },
      { onSuccess: () => setLocation(`/project/${projectId}/export`) }
    );
  };

  const showLoader = isPreviewing ? isLoadingPreview : isLoadingSpec;

  return (
    <div className="flex flex-col h-full w-full relative">
      {isPreviewing && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-primary/15 border-b border-primary/40 backdrop-blur px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-primary">
            <Eye className="w-3.5 h-3.5" />
            <span className="uppercase tracking-widest font-bold">
              Previewing Revision {previewRev?.revisionNumber ?? "?"}
            </span>
            <span className="text-primary/70 hidden md:inline">
              — chat is disabled. Restore this revision or return to current to edit.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 font-mono text-[10px] uppercase tracking-widest border-primary/40"
            onClick={onClearPreview}
          >
            <X className="w-3 h-3 mr-1" /> Return to Current
          </Button>
        </div>
      )}

      <div className={`absolute right-4 z-10 flex gap-2 items-center ${isPreviewing ? 'top-14' : 'top-4'}`}>
        {revisions.length > 0 && (
          <div className="flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded shadow-lg shadow-black/50 px-2 py-1 mr-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!canUndo || undoMut.isPending || isPreviewing}
              onClick={() => undoMut.mutate({ id: projectId }, { onSuccess: invalidateAll })}
              title="Previous revision"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-[10px] font-mono text-muted-foreground hover:text-primary uppercase tracking-widest flex items-center gap-1 px-1 transition-colors"
              title="Open revision history"
            >
              <History className="w-3 h-3" /> REV {Math.max(currentIdx + 1, 1)}/{revisions.length}
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!canRedo || redoMut.isPending || isPreviewing}
              onClick={() => redoMut.mutate({ id: projectId }, { onSuccess: invalidateAll })}
              title="Next revision"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        {canFold && (
          <div className="flex rounded-md border border-border bg-card/80 backdrop-blur-sm shadow-lg shadow-black/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setView("flat")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                view === "flat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-view-flat"
            >
              <Square className="w-3.5 h-3.5" />
              Flat
            </button>
            <button
              type="button"
              onClick={() => setView("folded")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                view === "folded" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-view-folded"
            >
              <Box className="w-3.5 h-3.5" />
              3D Fold
            </button>
          </div>
        )}
        <Button
          onClick={handleExport}
          disabled={!activeSpec || exportDxf.isPending || isPreviewing || (!activeSpec.svgPreview && !activeSpec.material)}
          className="font-mono uppercase tracking-wider text-xs shadow-lg shadow-black/50"
        >
          {exportDxf.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Export DXF + Order
        </Button>
      </div>

      <div className={`flex-1 flex items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-10 relative overflow-hidden ${isPreviewing ? 'pt-16' : ''}`}>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.1)_1px,transparent_1px)] bg-[size:100px_100px] pointer-events-none" />

        {showLoader ? (
          <div className="flex items-center gap-3 text-muted-foreground font-mono">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="uppercase tracking-widest text-sm">
              {isPreviewing ? "Loading revision..." : "Loading telemetry..."}
            </span>
          </div>
        ) : partSpec?.svgPreview ? (
          view === "folded" && canFold && !isPreviewing ? (
            <Suspense
              fallback={
                <div className="flex items-center gap-3 text-muted-foreground font-mono">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="uppercase tracking-widest text-sm">Loading 3D engine...</span>
                </div>
              }
            >
              <FoldedPreview
                svg={partSpec.svgPreview}
                width={partSpec.width!}
                height={partSpec.height!}
                thickness={partSpec.thickness ?? 0.075}
                bendAnglesDeg={bendAnglesArr}
              />
            </Suspense>
          ) : (
            <div
              className={`w-full h-full max-w-2xl max-h-[60vh] flex items-center justify-center text-white stroke-white fill-none border bg-black/40 backdrop-blur-sm rounded shadow-2xl p-8 ${
                isPreviewing ? "border-primary/40 ring-1 ring-primary/30" : "border-white/10"
              }`}
              dangerouslySetInnerHTML={{ __html: partSpec.svgPreview }}
            />
          )
        ) : (
          <div className="flex flex-col items-center text-muted-foreground/50 font-mono">
            <div className="w-32 h-32 border-2 border-dashed border-muted-foreground/20 rounded mb-4 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 opacity-20" />
            </div>
            <p className="uppercase tracking-widest text-sm text-center">No visual data<br/>Awaiting specifications</p>
          </div>
        )}
      </div>

      <div className="h-48 border-t border-border bg-card/90 backdrop-blur shrink-0 p-4 font-mono overflow-y-auto">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex justify-between">
          <span>
            Manufacturing Parameters
            {isPreviewing && (
              <span className="ml-2 text-primary normal-case tracking-normal">
                (preview · rev {previewRev?.revisionNumber ?? "?"})
              </span>
            )}
          </span>
          {partSpec?.updatedAt && <span>LAST SYNC: {new Date(partSpec.updatedAt).toLocaleTimeString()}</span>}
        </h3>

        {partSpec ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SpecCard label="Part Type" value={partSpec.partType || 'UNSPECIFIED'} />
            <SpecCard label="Material" value={partSpec.material || 'UNSPECIFIED'} highlight={!!partSpec.material} />
            <SpecCard label="Thickness" value={partSpec.thickness ? `${partSpec.thickness}"` : 'UNSPECIFIED'} />
            <div className="flex flex-col gap-1 p-2 bg-background border border-border rounded">
              <span className="text-[10px] text-muted-foreground uppercase">Dimensions (W&times;H)</span>
              <span className="text-sm font-bold text-primary">
                {partSpec.width || '?'}&times;{partSpec.height || '?'}{partSpec.depth ? <>&times;{partSpec.depth}</> : null}"
              </span>
            </div>
            {partSpec.bendAngles && partSpec.bendAngles !== "[]" && (
              <SpecCard label="Bending" value="REQUIRED" highlight />
            )}
            {partSpec.powderCoat && (
              <SpecCard label="Finish" value={`POWDER COAT: ${partSpec.powderCoatColor || 'STANDARD'}`} highlight />
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground/50 text-center py-4">No active parameters detected</div>
        )}
      </div>
    </div>
  );
}

function SpecCard({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 p-2 border rounded ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-background border-border'}`}>
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className={`text-sm font-bold truncate ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
