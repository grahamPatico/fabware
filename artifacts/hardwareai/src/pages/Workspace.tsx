import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "convex/react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { useRef } from "react";
import {
  Settings2,
  ArrowLeft,
  History,
  Sliders,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
} from "lucide-react";
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

const RESIZE_HANDLE = "w-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";
const RESIZE_HANDLE_HORIZ = "h-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";

export default function Workspace() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [focusedPartId, setFocusedPartId] = useState<Id<"parts"> | null>(null);

  const leftRef = useRef<ImperativePanelHandle>(null);
  const chatRef = useRef<ImperativePanelHandle>(null);
  const assemblyRef = useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [assemblyCollapsed, setAssemblyCollapsed] = useState(false);

  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const focusedPart = parts?.find(p => p._id === focusedPartId) ?? null;

  if (!projectId) return <div>Invalid project ID</div>;
  const shortId = projectId.slice(-4).toUpperCase();

  const toggleLeft = () => {
    if (leftCollapsed) leftRef.current?.expand();
    else leftRef.current?.collapse();
  };
  const toggleChat = () => {
    if (chatCollapsed) chatRef.current?.expand();
    else chatRef.current?.collapse();
  };
  const toggleAssembly = () => {
    if (assemblyCollapsed) assemblyRef.current?.expand();
    else assemblyRef.current?.collapse();
  };

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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLeft}
            className="h-8 w-8"
            title={leftCollapsed ? "Show parts rail" : "Hide parts rail"}
          >
            {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleChat}
            className="h-8 w-8"
            title={chatCollapsed ? "Show chat" : "Hide chat"}
          >
            {chatCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAssembly}
            className="h-8 w-8"
            title={assemblyCollapsed ? "Show McMaster panel" : "Hide McMaster panel"}
          >
            {assemblyCollapsed ? <PanelBottomOpen className="w-4 h-4" /> : <PanelBottomClose className="w-4 h-4" />}
          </Button>
          <div className="w-px h-6 bg-border mx-2" />
          <Button variant="outline" size="sm" onClick={() => setScopeOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <Sliders className="w-3.5 h-3.5 mr-2" />Scope
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <History className="w-3.5 h-3.5 mr-2" />History
          </Button>
        </div>
      </header>

      <PanelGroup direction="horizontal" className="flex-1" autoSaveId="fabware-workspace-h">
        {/* Left rail: parts + interfaces */}
        <Panel
          ref={leftRef}
          defaultSize={18}
          minSize={12}
          maxSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className="bg-background"
        >
          <aside className="h-full border-r border-border flex flex-col">
            <PartList projectId={projectId} focusedPartId={focusedPartId} onFocusPart={setFocusedPartId} />
            <InterfaceList projectId={projectId} />
          </aside>
        </Panel>
        <PanelResizeHandle className={RESIZE_HANDLE} />

        {/* Middle: chat */}
        <Panel
          ref={chatRef}
          defaultSize={32}
          minSize={20}
          maxSize={50}
          collapsible
          collapsedSize={0}
          onCollapse={() => setChatCollapsed(true)}
          onExpand={() => setChatCollapsed(false)}
        >
          <section className="h-full border-r border-border flex flex-col">
            <ChatPanel projectId={projectId} focusedPartRole={focusedPart?.role ?? null} />
          </section>
        </Panel>
        <PanelResizeHandle className={RESIZE_HANDLE} />

        {/* Right: canvas + assembly parts */}
        <Panel defaultSize={50} minSize={25}>
          <section className="h-full flex flex-col bg-[#0a0f18] relative">
            <RulesStatusStrip projectId={projectId} />
            <PanelGroup direction="vertical" autoSaveId="fabware-workspace-v">
              <Panel defaultSize={70} minSize={30}>
                <div className="h-full flex flex-col">
                  <AssembledView
                    projectId={projectId}
                    focusedPartId={focusedPartId}
                    onFocusPart={setFocusedPartId}
                  />
                </div>
              </Panel>
              <PanelResizeHandle className={RESIZE_HANDLE_HORIZ} />
              <Panel
                ref={assemblyRef}
                defaultSize={30}
                minSize={15}
                maxSize={60}
                collapsible
                collapsedSize={0}
                onCollapse={() => setAssemblyCollapsed(true)}
                onExpand={() => setAssemblyCollapsed(false)}
              >
                <div className="h-full flex flex-col min-h-0 overflow-hidden">
                  <AssemblyPartsPanel projectId={projectId} />
                </div>
              </Panel>
            </PanelGroup>
          </section>
        </Panel>
      </PanelGroup>

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
