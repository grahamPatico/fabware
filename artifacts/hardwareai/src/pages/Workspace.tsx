import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "convex/react";
import { Settings2, ArrowLeft, History } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import CanvasPanel from "@/components/workspace/CanvasPanel";
import GuidedInputPanel from "@/components/workspace/GuidedInputPanel";
import RulesStatusStrip from "@/components/workspace/RulesStatusStrip";
import HistoryPanel from "@/components/workspace/HistoryPanel";
import AssemblyPartsPanel from "@/components/workspace/AssemblyPartsPanel";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function Workspace() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewRevisionId, setPreviewRevisionId] = useState<Id<"partRevisions"> | null>(null);

  const partSpec = useQuery(
    api.partSpecs.getForProject,
    projectId ? { projectId } : "skip",
  );

  if (!projectId) return <div>Invalid Project ID</div>;

  const isPreviewing = previewRevisionId != null;
  const shortId = projectId.slice(-4).toUpperCase();

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/studio"
            className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center p-1 rounded-md hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-2 text-primary">
            <Settings2 className="w-4 h-4" />
            <span className="font-mono uppercase tracking-wider text-xs font-bold">Studio</span>
          </div>
          <div className="w-px h-6 bg-border" />
          <span className="font-mono text-sm text-muted-foreground">PRJ-{shortId}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          className="font-mono text-xs uppercase tracking-widest"
          title="Revision history"
        >
          <History className="w-3.5 h-3.5 mr-2" />
          History
        </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-2/5 border-r border-border flex flex-col bg-card/30">
          <div className="flex-1 min-h-0 flex flex-col">
            <ChatPanel projectId={projectId} disabled={isPreviewing} />
          </div>
          <GuidedInputPanel projectId={projectId} disabled={isPreviewing} />
        </div>

        <div className="w-3/5 flex flex-col bg-[#0a0f18] relative">
          <RulesStatusStrip projectId={projectId} />
          <div className="flex-1 min-h-0 flex flex-col">
            <CanvasPanel
              projectId={projectId}
              previewRevisionId={previewRevisionId}
              onClearPreview={() => setPreviewRevisionId(null)}
              onOpenHistory={() => setHistoryOpen(true)}
            />
          </div>
          <div className="max-h-80 shrink-0 flex flex-col min-h-0">
            <AssemblyPartsPanel projectId={projectId} />
          </div>
        </div>
      </div>

      <HistoryPanel
        projectId={projectId}
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setPreviewRevisionId(null);
        }}
        currentRevisionId={partSpec?.currentRevisionId ?? null}
        previewRevisionId={previewRevisionId}
        onPreviewRevision={setPreviewRevisionId}
      />
    </div>
  );
}
