import React from "react";
import { useQuery, useMutation } from "convex/react";
import { History, RotateCcw, Loader2, Check, Eye } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

interface Props {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRevisionId: Id<"partRevisions"> | null;
  previewRevisionId: Id<"partRevisions"> | null;
  onPreviewRevision: (id: Id<"partRevisions"> | null) => void;
}

export default function HistoryPanel({
  projectId,
  open,
  onOpenChange,
  currentRevisionId,
  previewRevisionId,
  onPreviewRevision,
}: Props) {
  const revisions = useQuery(api.revisions.list, open && projectId ? { projectId } : "skip");
  const restore = useMutation(api.revisions.restore);
  const [restoring, setRestoring] = React.useState(false);

  const isLoading = revisions === undefined;
  const sorted = revisions ? [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber) : [];

  const handleRestore = async (revisionId: Id<"partRevisions">) => {
    setRestoring(true);
    try {
      await restore({ projectId, revisionId });
      onPreviewRevision(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] sm:w-[420px] bg-card border-l border-border p-0 flex flex-col"
      >
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <History className="w-3 h-3" /> Revision History
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground/70">
            Click any revision to preview it. Restore to make it the active design.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground font-mono text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/60 font-mono text-xs px-8 text-center">
              <History className="w-6 h-6 mb-2 opacity-50" />
              No revisions yet. Send a design request to start the timeline.
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {sorted.map((rev) => {
                const isCurrent = rev.id === currentRevisionId;
                const isPreviewing = rev.id === previewRevisionId;
                return (
                  <li
                    key={rev.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      isPreviewing
                        ? "bg-primary/10 border-l-2 border-l-primary"
                        : isCurrent
                          ? "bg-card border-l-2 border-l-emerald-500"
                          : "border-l-2 border-l-transparent hover:bg-muted/50"
                    }`}
                    onClick={() => onPreviewRevision(isCurrent || isPreviewing ? null : rev.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          REV {rev.revisionNumber}
                        </span>
                        {isCurrent && (
                          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        )}
                        {!isCurrent && isPreviewing && (
                          <span className="font-mono text-[10px] uppercase tracking-widest text-primary flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Previewing
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatRelative(rev.createdAt)}
                      </span>
                    </div>
                    {rev.rationale && (
                      <p className="font-mono text-[11px] text-muted-foreground line-clamp-3 leading-snug">
                        {rev.rationale}
                      </p>
                    )}
                    {!isCurrent && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 font-mono text-[10px] uppercase tracking-widest"
                          disabled={restoring}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(rev.id);
                          }}
                        >
                          {restoring ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          Restore
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
