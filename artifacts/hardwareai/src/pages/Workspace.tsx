import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "convex/react";
import { Settings2, ArrowLeft, History, Sliders } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import AssembledView from "@/components/workspace/AssembledView";
import RulesStatusStrip from "@/components/workspace/RulesStatusStrip";
import HistoryPanel from "@/components/workspace/HistoryPanel";
import AssemblyPartsPanel from "@/components/workspace/AssemblyPartsPanel";
import PartList from "@/components/workspace/PartList";
import InterfaceList from "@/components/workspace/InterfaceList";
import ArchetypeInfoChip from "@/components/workspace/ArchetypeInfoChip";
import ScopeEditor from "@/components/workspace/ScopeEditor";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function Workspace() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [focusedPartId, setFocusedPartId] = useState<Id<"parts"> | null>(null);

  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const focusedPart = parts?.find(p => p._id === focusedPartId) ?? null;

  if (!projectId) return <div>Invalid project ID</div>;
  const shortId = projectId.slice(-4).toUpperCase();

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/studio" className="text-muted-foreground hover:text-primary"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="w-px h-6 bg-border" />
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold">Studio</span>
          <div className="w-px h-6 bg-border" />
          <span className="font-mono text-sm text-muted-foreground">PRJ-{shortId}</span>
          <ArchetypeInfoChip projectId={projectId} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setScopeOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <Sliders className="w-3.5 h-3.5 mr-2" />Scope
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <History className="w-3.5 h-3.5 mr-2" />History
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left rail: parts + interfaces */}
        <aside className="w-60 border-r border-border flex flex-col">
          <PartList projectId={projectId} focusedPartId={focusedPartId} onFocusPart={setFocusedPartId} />
          <InterfaceList projectId={projectId} />
        </aside>

        {/* Middle: chat */}
        <section className="w-[28rem] border-r border-border flex flex-col">
          <ChatPanel projectId={projectId} focusedPartRole={focusedPart?.role ?? null} />
        </section>

        {/* Right: canvas */}
        <section className="flex-1 flex flex-col bg-[#0a0f18] relative">
          <RulesStatusStrip projectId={projectId} />
          <div className="flex-1 min-h-0 flex flex-col">
            <AssembledView projectId={projectId} />
          </div>
          <div className="max-h-80 shrink-0 flex flex-col min-h-0">
            <AssemblyPartsPanel projectId={projectId} />
          </div>
        </section>
      </div>

      <HistoryPanel
        projectId={projectId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentRevisionId={null}
        previewRevisionId={null}
        onPreviewRevision={() => {}}
      />
      <ScopeEditor projectId={projectId} open={scopeOpen} onOpenChange={setScopeOpen} />
    </div>
  );
}
