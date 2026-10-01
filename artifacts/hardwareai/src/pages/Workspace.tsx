import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import {
  Settings2,
  AlertCircle,
  ArrowLeft,
  Box,
  Download,
  History,
  Layers,
  MessageSquare,
  Package,
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
  type LucideIcon,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const RESIZE_HANDLE = "w-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";
const RESIZE_HANDLE_HORIZ = "h-1 bg-border data-[resize-handle-state=hover]:bg-primary/40 data-[resize-handle-state=drag]:bg-primary transition-colors";
// Header actions: a square icon button below `lg`, icon + label from `lg` up.
const HEADER_ACTION = "h-8 w-8 px-0 lg:w-auto lg:px-3 font-mono text-xs uppercase tracking-widest";
const MOBILE_BREAKPOINT_PX = 768;

type MobileTab = "chat" | "3d" | "parts" | "bom";
const MOBILE_TABS: ReadonlyArray<{ id: MobileTab; label: string; icon: LucideIcon }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "3d", label: "3D", icon: Box },
  { id: "parts", label: "Parts", icon: Layers },
  { id: "bom", label: "BOM", icon: Package },
];

interface ProjectNameProps {
  name: string;
  onRename: (next: string) => void;
}

/** The project name in the header. Click to rename in place. */
function ProjectName({ name, onRename }: ProjectNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelledRef = useRef(false);

  const finish = () => {
    setEditing(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = draft.trim();
    // An empty name is ignored rather than saved.
    if (!next || next === name) return;
    onRename(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-64 min-w-0 max-w-full rounded border border-primary/40 bg-background px-2 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title={`${name} (click to rename)`}
      className="-mx-1.5 min-w-0 truncate rounded px-1.5 py-0.5 text-left font-mono text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {name}
    </button>
  );
}

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

  // `useIsMobile` reports false until its effect has run. Measure once up
  // front so a phone never mounts the desktop panels (and a WebGL canvas)
  // for a frame before switching layouts.
  const isMobileNow = useIsMobile();
  const [initialMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX,
  );
  const [mobileSettled, setMobileSettled] = useState(false);
  useEffect(() => setMobileSettled(true), []);
  const isMobile = mobileSettled ? isMobileNow : initialMobile;
  const [mobileTabState, setMobileTab] = useState<MobileTab>(readOnly ? "3d" : "chat");
  const mobileTabs = readOnly ? MOBILE_TABS.filter((t) => t.id !== "chat") : MOBILE_TABS;
  const mobileTab: MobileTab = readOnly && mobileTabState === "chat" ? "3d" : mobileTabState;

  const leftRef = useRef<ImperativePanelHandle>(null);
  const chatRef = useRef<ImperativePanelHandle>(null);
  const assemblyRef = useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [assemblyCollapsed, setAssemblyCollapsed] = useState(false);

  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const updateProject = useMutation(api.projects.update).withOptimisticUpdate((store, args) => {
    if (args.name === undefined) return;
    const current = store.getQuery(api.projects.get, { projectId: args.projectId });
    if (current) store.setQuery(api.projects.get, { projectId: args.projectId }, { ...current, name: args.name });
  });

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

  // Browser tab title follows the project name; put the old one back on leave.
  const titleName = readOnly ? (shareLabel || project?.name || null) : (project?.name ?? null);
  useEffect(() => {
    if (!titleName) return;
    const previous = document.title;
    document.title = `${titleName} · Fabware`;
    return () => {
      document.title = previous;
    };
  }, [titleName]);

  if (!projectId) return <div>Invalid project ID</div>;

  // Shared (read-only) views resolve the project by slug in the parent, which
  // owns the "link invalid" state.
  if (!readOnly && project === null) {
    return (
      <div className="h-dvh w-full flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
          Project not found
        </h1>
        <p className="max-w-xs font-mono text-xs text-muted-foreground/70">
          It may have been deleted, or the link is wrong.
        </p>
        <Button asChild variant="outline" size="sm" className="font-mono text-xs uppercase tracking-widest">
          <Link href="/studio">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to studio
          </Link>
        </Button>
      </div>
    );
  }

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

  const handleRename = (name: string) => {
    // On failure the optimistic name rolls back to the saved one by itself.
    updateProject({ projectId, name }).catch(() => {
      toast({ variant: "destructive", title: "Couldn't rename the project", description: "Check your connection and try again." });
    });
  };

  const run = project?.agentRun;
  // A run that never reported back is stale after 11 minutes (the action
  // behind it is killed at 10); don't hold the overlay up for it.
  const showGenerating =
    run?.status === "running" &&
    Date.now() - run.startedAt < 11 * 60 * 1000 &&
    parts !== undefined &&
    parts.length === 0;

  // The pieces below are shared by the desktop panels and the mobile tabs.
  const assembledView = (
    <div className="flex-1 min-h-0 relative">
      <AssembledView
        projectId={projectId}
        focusedPartId={focusedPartId}
        onFocusPart={setFocusedPartId}
        hiddenPartIds={hiddenPartIds}
      />
      {showGenerating && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f18]/85 backdrop-blur-sm pointer-events-none"
        >
          <div className="flex flex-col items-center gap-3 px-6 text-center font-mono text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="uppercase tracking-widest text-xs">
              {run?.step ?? "Generating your assembly"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
  const partList = (
    <PartList
      projectId={projectId}
      focusedPartId={focusedPartId}
      onFocusPart={setFocusedPartId}
      hiddenPartIds={hiddenPartIds}
      onTogglePart={togglePartHidden}
      readOnly={readOnly}
    />
  );
  const chatPanel = <ChatPanel projectId={projectId} focusedPartRole={focusedPart?.role ?? null} />;

  return (
    <div className="h-dvh w-full flex flex-col bg-background overflow-hidden">
      <header className="h-14 border-b border-border bg-card px-3 md:px-4 flex items-center justify-between gap-2 md:gap-3 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3 xl:gap-4">
          {readOnly ? (
            <span className="shrink-0 text-muted-foreground"><Eye className="w-4 h-4" /></span>
          ) : (
            <Link
              href="/studio"
              className="shrink-0 text-muted-foreground hover:text-primary"
              title="Back to studio"
              aria-label="Back to studio"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div className="hidden md:block w-px h-6 bg-border shrink-0" />
          <Settings2 className="hidden md:block w-4 h-4 text-primary shrink-0" />
          <span
            className={`${readOnly ? "hidden md:inline" : "hidden xl:inline"} shrink-0 whitespace-nowrap font-mono text-xs uppercase tracking-wider text-primary font-bold`}
          >
            {readOnly ? "Shared view" : "Studio"}
          </span>
          <div className="hidden md:block w-px h-6 bg-border shrink-0" />
          {readOnly ? (
            <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
              {shareLabel ? shareLabel : `PRJ-${shortId}`}
            </span>
          ) : project ? (
            <div className="flex min-w-0 items-center gap-2">
              <ProjectName name={project.name} onRename={handleRename} />
              <span className="hidden md:inline shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                PRJ-{shortId}
              </span>
            </div>
          ) : (
            <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">PRJ-{shortId}</span>
          )}
          <div className="shrink-0 empty:hidden">
            <ArchetypeInfoChip projectId={projectId} />
          </div>
          {readOnly && (
            <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-2 py-0.5">
              Read-only
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isMobile && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLeft}
                className="h-8 w-8"
                title={leftCollapsed ? "Show parts rail" : "Hide parts rail"}
                aria-label={leftCollapsed ? "Show parts rail" : "Hide parts rail"}
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
                  aria-label={chatCollapsed ? "Show chat" : "Hide chat"}
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
                aria-label={assemblyCollapsed ? "Show McMaster panel" : "Hide McMaster panel"}
              >
                {assemblyCollapsed ? <PanelBottomOpen className="w-4 h-4" /> : <PanelBottomClose className="w-4 h-4" />}
              </Button>
            </>
          )}
          {!readOnly && (
            <>
              {!isMobile && <div className="w-px h-6 bg-border mx-2" />}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => undoMut({ projectId })}
                disabled={!canUndo}
                className="h-8 w-8"
                title={canUndo ? `Undo (⌘Z)${snapshotStatus?.label ? `: ${snapshotStatus.label}` : ""}` : "Nothing to undo"}
                aria-label="Undo"
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
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              {!isMobile && snapshotStatus && snapshotStatus.total > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground px-1">
                  {snapshotStatus.current}/{snapshotStatus.total}
                </span>
              )}
              <div className="hidden md:block w-px h-6 bg-border mx-2" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScopeOpen(true)}
                className={HEADER_ACTION}
                title="Scope"
                aria-label="Scope"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Scope</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                className={HEADER_ACTION}
                title="History"
                aria-label="History"
              >
                <History className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">History</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                className={HEADER_ACTION}
                title="Share"
                aria-label="Share"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Share</span>
              </Button>
              <Button asChild variant="outline" size="sm" className={HEADER_ACTION}>
                <Link href={`/project/${projectId}/export`} title="Export" aria-label="Export">
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Export</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {isMobile ? (
        <>
          <main className="flex-1 min-h-0">
            {/* Chat stays mounted while hidden so a half-written message survives a tab switch. */}
            {!readOnly && (
              <section
                role="tabpanel"
                aria-label="Chat"
                className={mobileTab === "chat" ? "h-full flex flex-col" : "hidden"}
              >
                {chatPanel}
              </section>
            )}
            {/* The 3D canvas is unmounted when hidden: no reason to keep a WebGL context alive. */}
            {mobileTab === "3d" && (
              <section role="tabpanel" aria-label="3D" className="h-full flex flex-col bg-[#0a0f18]">
                <RulesStatusStrip projectId={projectId} canFix={!readOnly} />
                {assembledView}
                <BendSimulatorPanel focusedPartId={focusedPartId} />
              </section>
            )}
            {mobileTab === "parts" && (
              <section role="tabpanel" aria-label="Parts" className="h-full overflow-y-auto">
                {partList}
                <InterfaceList projectId={projectId} />
              </section>
            )}
            {mobileTab === "bom" && (
              <section role="tabpanel" aria-label="BOM" className="h-full flex flex-col min-h-0 overflow-hidden">
                <AssemblyPartsPanel projectId={projectId} readOnly={readOnly} />
              </section>
            )}
          </main>
          <nav
            role="tablist"
            aria-label="Workspace sections"
            className="shrink-0 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
            style={{ gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))` }}
          >
            {mobileTabs.map(({ id, label, icon: Icon }) => {
              const active = mobileTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileTab(id)}
                  className={`flex h-14 flex-col items-center justify-center gap-1 border-t-2 font-mono text-[10px] uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:bg-muted/40 ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </nav>
        </>
      ) : (
      <PanelGroup direction="horizontal" className="flex-1" autoSaveId="fabware-workspace-h">
        {/* Left rail: parts + interfaces */}
        <Panel
          ref={leftRef}
          defaultSize={20}
          minSize={14}
          maxSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className="bg-background"
        >
          <aside className="h-full border-r border-border flex flex-col">
            {partList}
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
            {chatPanel}
          </section>
        </Panel>
        <PanelResizeHandle className={RESIZE_HANDLE} />
        </>
        )}

        {/* Right: canvas + assembly parts */}
        <Panel defaultSize={readOnly ? 80 : 48} minSize={25}>
          <section className="h-full flex flex-col bg-[#0a0f18] relative">
            <RulesStatusStrip projectId={projectId} canFix={!readOnly} />
            <PanelGroup direction="vertical" autoSaveId="fabware-workspace-v">
              <Panel defaultSize={70} minSize={30}>
                <div className="h-full flex flex-col">
                  {assembledView}
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
      )}

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
