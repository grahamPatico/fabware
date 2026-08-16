import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { useRef } from "react";
import {
  Settings2,
  ArrowLeft,
  History,
  Sliders,
  Undo2,
  Redo2,
  Share2,
  Eye,
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
import BendSimulatorPanel from "@/components/workspace/BendSimulatorPanel";
import HistoryPanel from "@/components/workspace/HistoryPanel";
import ShareDialog from "@/components/workspace/ShareDialog";
import AssemblyPartsPanel from "@/components/workspace/AssemblyPartsPanel";
import PartList from "@/components/workspace/PartList";
import InterfaceList from "@/components/workspace/InterfaceList";
import ArchetypeInfoChip from "@/components/workspace/ArchetypeInfoChip";
import ScopeEditor from "@/components/workspace/ScopeEditor";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const RESIZE_HANDLE = "w-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";
const RESIZE_HANDLE_HORIZ = "h-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";

interface WorkspaceProps {
  projectId?: Id<"projects"> | null;
  readOnly?: boolean;
  shareLabel?: string | null;
}

export default function Workspace({
  projectId: projectIdProp,
  readOnly = false,
  shareLabel = null,
}: WorkspaceProps = {}) {
  const params = useParams();
  const projectId = projectIdProp ?? ((params.id as Id<"projects"> | undefined) ?? null);
  // Whether this Workspace was navigated to with ?starting=1 — set by the
  // wizard to keep a "generating…" overlay visible until parts arrive.
  const startingFlag = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("starting") === "1";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [focusedPartId, setFocusedPartId] = useState<Id<"parts"> | null>(null);
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(new Set());
  const togglePartHidden = (id: Id<"parts">) => {
    setHiddenPartIds(prev => {
      const next = new Set(prev);
      const key = id as unknown as string;
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const leftRef = useRef<ImperativePanelHandle>(null);
  const chatRef = useRef<ImperativePanelHandle>(null);
  const assemblyRef = useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [assemblyCollapsed, setAssemblyCollapsed] = useState(false);

  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const focusedPart = parts?.find((p: Doc<"parts">) => p._id === focusedPartId) ?? null;

  const snapshotStatus = useQuery(api.assemblySnapshots.status, projectId ? { projectId } : "skip");
  const undoMut = useMutation(api.assemblySnapshots.undo);
  const redoMut = useMutation(api.assemblySnapshots.redo);
  const canUndo = !!snapshotStatus?.canUndo;
  const canRedo = !!snapshotStatus?.canRedo;

  useEffect(() => {
    if (!projectId || readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        target?.isContentEditable === true;
      if (editable) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undoMut({ projectId });
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        if (canRedo) redoMut({ projectId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId, canUndo, canRedo, undoMut, redoMut, readOnly]);

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
          {readOnly ? (
            <span className="text-muted-foreground"><Eye className="w-4 h-4" /></span>
          ) : (
            <Link href="/studio" className="text-muted-foreground hover:text-primary"><ArrowLeft className="w-4 h-4" /></Link>
          )}
          <div className="w-px h-6 bg-border" />
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold">
            {readOnly ? "Shared view" : "Studio"}
          </span>
          <div className="w-px h-6 bg-border" />
          <span className="font-mono text-sm text-muted-foreground">
            {readOnly && shareLabel ? shareLabel : `PRJ-${shortId}`}
          </span>
          <ArchetypeInfoChip projectId={projectId} />
          {readOnly && (
            <span className="font-mono text-[10px] uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-2 py-0.5">
              Read-only
            </span>
          )}
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
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleChat}
              className="h-8 w-8"
              title={chatCollapsed ? "Show chat" : "Hide chat"}
            >
              {chatCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAssembly}
            className="h-8 w-8"
            title={assemblyCollapsed ? "Show McMaster panel" : "Hide McMaster panel"}
          >
            {assemblyCollapsed ? <PanelBottomOpen className="w-4 h-4" /> : <PanelBottomClose className="w-4 h-4" />}
          </Button>
          {!readOnly && (
            <>
              <div className="w-px h-6 bg-border mx-2" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => undoMut({ projectId })}
                disabled={!canUndo}
                className="h-8 w-8"
                title={canUndo ? `Undo (⌘Z) — ${snapshotStatus?.label ?? ""}` : "Nothing to undo"}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => redoMut({ projectId })}
                disabled={!canRedo}
                className="h-8 w-8"
                title={canRedo ? "Redo (⌘⇧Z)" : "Nothing to redo"}
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              {snapshotStatus && snapshotStatus.total > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground px-1">
                  {snapshotStatus.current}/{snapshotStatus.total}
                </span>
              )}
              <div className="w-px h-6 bg-border mx-2" />
              <Button variant="outline" size="sm" onClick={() => setScopeOpen(true)} className="font-mono text-xs uppercase tracking-widest">
                <Sliders className="w-3.5 h-3.5 mr-2" />Scope
              </Button>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="font-mono text-xs uppercase tracking-widest">
                <History className="w-3.5 h-3.5 mr-2" />History
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="font-mono text-xs uppercase tracking-widest">
                <Share2 className="w-3.5 h-3.5 mr-2" />Share
              </Button>
            </>
          )}
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
            <PartList
              projectId={projectId}
              focusedPartId={focusedPartId}
              onFocusPart={setFocusedPartId}
              hiddenPartIds={hiddenPartIds}
              onTogglePart={togglePartHidden}
              readOnly={readOnly}
            />
            <InterfaceList projectId={projectId} />
          </aside>
        </Panel>
        <PanelResizeHandle className={RESIZE_HANDLE} />

        {!readOnly && (
        <>
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
        </>
        )}

        {/* Right: canvas + assembly parts */}
        <Panel defaultSize={readOnly ? 82 : 50} minSize={25}>
          <section className="h-full flex flex-col bg-[#0a0f18] relative">
            <RulesStatusStrip projectId={projectId} />
            <PanelGroup direction="vertical" autoSaveId="fabware-workspace-v">
              <Panel defaultSize={70} minSize={30}>
                <div className="h-full flex flex-col">
                  <div className="flex-1 min-h-0 relative">
                    <AssembledView
                      projectId={projectId}
                      focusedPartId={focusedPartId}
                      onFocusPart={setFocusedPartId}
                      hiddenPartIds={hiddenPartIds}
                    />
                    {startingFlag && parts !== undefined && parts.length === 0 && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f18]/85 backdrop-blur-sm pointer-events-none">
                        <div className="flex flex-col items-center gap-3 font-mono text-muted-foreground">
                          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="uppercase tracking-widest text-xs">Generating your assembly…</span>
                          <span className="text-[10px] text-muted-foreground/70">Agent is choosing an archetype and laying out parts</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <BendSimulatorPanel focusedPartId={focusedPartId} />
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
                  <AssemblyPartsPanel projectId={projectId} readOnly={readOnly} />
                </div>
              </Panel>
            </PanelGroup>
          </section>
        </Panel>
      </PanelGroup>

      {!readOnly && (
        <>
          <HistoryPanel
            projectId={projectId}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            currentRevisionId={null}
            previewRevisionId={null}
            onPreviewRevision={() => {}}
          />
          <ScopeEditor projectId={projectId} open={scopeOpen} onOpenChange={setScopeOpen} />
          <ShareDialog
            projectId={projectId}
            open={shareOpen}
            onOpenChange={setShareOpen}
          />
        </>
      )}
    </div>
  );
}
