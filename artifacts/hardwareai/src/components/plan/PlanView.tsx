// The plan page, as a pure function of its props. No Convex hooks in here or
// below: `src/pages/Plan.tsx` owns the data and the mutations, and the dev
// preview renders this from fixtures.

import React from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Download,
  ImageIcon,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  getStage,
  isGeneratedStage,
  type JourneyView,
  type StageId,
  type StageStatus,
  type Track,
} from "../../../convex/lib/journey";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  conceptImageSrc,
  nextApplicableStage,
  NOTES_MAX_CHARS,
  RAIL_MARK_LABEL,
  railMark,
  stageLabel,
  type RailMark,
} from "./planLogic";
import { LABEL, Segmented, type SegmentedOption } from "./parts";
import { IdeaStage } from "./stages/IdeaStage";
import { ValidateStage } from "./stages/ValidateStage";
import { RequirementsStage } from "./stages/RequirementsStage";
import { SourcingStage } from "./stages/SourcingStage";
import { MechanicalStage } from "./stages/MechanicalStage";
import { ElectronicsStage } from "./stages/ElectronicsStage";
import { PcbStage } from "./stages/PcbStage";
import { BuildStage } from "./stages/BuildStage";

export interface PlanProject {
  _id: string;
  name: string;
  description?: string | null;
}

export interface PlanActions {
  /** Create the plan for a project that has none. */
  begin: (track: Track) => void;
  /** Write or rewrite a stage. `notes` steer a rewrite. */
  generate: (stage: StageId, notes?: string) => void;
  setTrack: (track: Track) => void;
  setNeedsElectronics: (value: boolean) => void;
  setDone: (stage: StageId, done: boolean) => void;
  /** Mark `stage` done, move to the next one and start it when it has not been written. */
  continueFrom: (stage: StageId) => void;
  newPicture: () => void;
  /** Send the mechanical brief to the design agent and open the studio. */
  startDesign: () => void;
  downloadPcbStarter: () => void;
}

export interface PlanBusy {
  begin: boolean;
  /** The stage whose generate call is in flight. */
  generate: StageId | null;
  settings: boolean;
  /** The stage whose done toggle or continue is in flight. */
  done: StageId | null;
  concept: boolean;
  startDesign: boolean;
  pcbStarter: boolean;
}

export const IDLE_BUSY: PlanBusy = {
  begin: false,
  generate: null,
  settings: false,
  done: null,
  concept: false,
  startDesign: false,
  pcbStarter: false,
};

export const TRACK_OPTIONS: ReadonlyArray<SegmentedOption<Track>> = [
  { value: "hobby", label: "Just for me" },
  { value: "product", label: "A product to sell" },
];

export const TRACK_HELP: Record<Track, string> = {
  hobby: "Skips market research.",
  product: "Adds a market check before you spend money.",
};

export interface PlanViewProps {
  project: PlanProject;
  view: JourneyView;
  /** Null only when the project has no stages to show. */
  selectedStage: StageId | null;
  onSelectStage: (stage: StageId) => void;
  actions: PlanActions;
  busy: PlanBusy;
  /** The design agent's first message. Undefined while it loads. */
  mechanicalBrief: string | undefined;
  /** Set when the last KiCad starter download failed. */
  pcbStarterError?: string | null;
}

const HEADER_ACTION = "h-8 w-8 px-0 sm:w-auto sm:px-3 font-mono text-xs uppercase tracking-widest";

function PlanHeader({ project }: { project: PlanProject | null }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/studio"
          title="Back to studio"
          aria-label="Fabware studio"
          className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Settings2 className="h-5 w-5" />
          </span>
          <span className="hidden text-lg font-bold uppercase tracking-tight md:inline">Fabware</span>
        </Link>
        <div className="hidden h-6 w-px shrink-0 bg-border sm:block" />
        <span className="hidden shrink-0 font-mono text-xs font-bold uppercase tracking-widest text-primary sm:inline">
          Plan
        </span>
        <div className="hidden h-6 w-px shrink-0 bg-border sm:block" />
        {project ? (
          <span className="min-w-0 truncate font-mono text-sm" title={project.name}>
            {project.name}
          </span>
        ) : (
          <Skeleton className="h-4 w-40" />
        )}
      </div>
      {project && (
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="outline" size="sm" className={HEADER_ACTION}>
            <Link href={`/project/${project._id}`} title="Open studio" aria-label="Open studio">
              <Box className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open studio</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className={HEADER_ACTION}>
            <Link href={`/project/${project._id}/export`} title="Export" aria-label="Export">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
}

/** The whole page while the project or its plan is still loading. */
export function PlanSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" aria-busy="true" aria-label="Loading the plan">
      <PlanHeader project={null} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 md:p-10">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="mt-6 h-9 w-64 max-w-full" />
          </div>
        </div>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-hidden lg:flex-col">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 lg:w-full" />
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function PlanNotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
      <h1 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Project not found</h1>
      <p className="max-w-xs font-mono text-xs text-muted-foreground/70">
        It may have been deleted, or the link is wrong.
      </p>
      <Button asChild variant="outline" size="sm" className="font-mono text-xs uppercase tracking-widest">
        <Link href="/studio">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to studio
        </Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top band
// ---------------------------------------------------------------------------

function ConceptPicture({
  concept,
  busy,
  onNewPicture,
}: {
  concept: JourneyView["concept"];
  busy: boolean;
  onNewPicture: () => void;
}) {
  const generating = concept.status === "generating";
  const image = concept.status === "ready" || concept.status === "generating" ? concept.image : null;
  const remaining = Math.max(0, concept.remaining);

  let body: React.ReactNode;
  if (generating) {
    body = <Skeleton className="h-full w-full rounded-none" aria-label="Drawing the picture" />;
  } else if (concept.status === "error") {
    body = (
      <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="break-words text-xs leading-relaxed text-destructive">
          {concept.error || "The picture didn't generate."}
        </p>
      </div>
    );
  } else if (image) {
    body = (
      <img
        src={conceptImageSrc(image)}
        alt="AI concept picture of the idea"
        className={cn("h-full w-full", image.kind === "svg" ? "object-contain" : "object-cover")}
      />
    );
  } else {
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/60">
        <ImageIcon className="h-8 w-8" />
        <p className="font-mono text-[10px] uppercase tracking-widest">No picture yet</p>
      </div>
    );
  }

  return (
    <figure className="min-w-0">
      <div
        className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-card"
        aria-busy={generating}
      >
        {body}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-40 text-xs leading-relaxed text-muted-foreground">
          AI concept picture. A rough idea, not a design.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewPicture}
          disabled={busy || generating || remaining === 0}
          className="shrink-0 gap-2 font-mono text-[11px] font-normal"
        >
          {busy || generating ? <Spinner /> : <RefreshCw />}
          New picture
          <span className="text-muted-foreground">{remaining} left</span>
        </Button>
      </figcaption>
    </figure>
  );
}

function TopBand({ project, view, actions, busy }: Pick<PlanViewProps, "project" | "view" | "actions" | "busy">) {
  const id = React.useId();
  const journey = view.journey;
  if (!journey) return null;
  const oneLiner = view.stages.idea?.content?.oneLiner || project.description || project.name;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" aria-label="The idea">
      <ConceptPicture concept={view.concept} busy={busy.concept} onNewPicture={actions.newPicture} />
      <div className="min-w-0">
        <p className={cn(LABEL, "text-primary")}>The idea</p>
        <h1 className="mt-2 break-words text-xl font-bold leading-snug tracking-tight sm:text-2xl">{oneLiner}</h1>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <p className={LABEL}>Who is it for?</p>
            <Segmented
              label="Who is it for?"
              className="mt-2"
              value={journey.track}
              options={TRACK_OPTIONS}
              onChange={actions.setTrack}
              disabled={busy.settings}
            />
            <p className="mt-2 text-xs text-muted-foreground">{TRACK_HELP[journey.track]}</p>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-electronics`} className={LABEL}>
              Needs electronics
            </Label>
            <div className="mt-2 flex min-h-10 items-center gap-3">
              <Switch
                id={`${id}-electronics`}
                checked={journey.needsElectronics}
                onCheckedChange={actions.setNeedsElectronics}
                disabled={busy.settings}
              />
              <span className="text-sm">{journey.needsElectronics ? "Yes" : "No"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {journey.needsElectronics
                ? "The plan includes the electronics and board steps."
                : "The plan skips the electronics and board steps."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage rail
// ---------------------------------------------------------------------------

function RailIcon({ mark }: { mark: RailMark }) {
  switch (mark) {
    case "working":
      return <Spinner aria-label={undefined} role={undefined} className="size-4 text-primary" />;
    case "review":
      return <CircleDot className="h-4 w-4 text-primary" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  }
}

function StageRail({
  view,
  selectedStage,
  onSelectStage,
}: Pick<PlanViewProps, "view" | "selectedStage" | "onSelectStage">) {
  // On a phone the rail is a sideways strip: keep the selected step in view
  // without moving the page itself.
  const stripRef = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!strip || !current || strip.scrollWidth <= strip.clientWidth) return;
    const left = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left) });
  }, [selectedStage]);

  return (
    <nav aria-label="Plan steps" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <ol ref={stripRef} className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {view.applicable.map((stage, index) => {
          const mark = railMark(view.stages[stage]?.status);
          const selected = stage === selectedStage;
          return (
            <li key={stage} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSelectStage(stage)}
                aria-current={selected ? "step" : undefined}
                className={cn(
                  // `relative` keeps the screen-reader status text inside the scrolling strip.
                  "relative flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground lg:border-transparent lg:bg-transparent",
                )}
              >
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-nowrap text-sm lg:flex-1">{stageLabel(stage)}</span>
                <RailIcon mark={mark} />
                <span className="sr-only">{RAIL_MARK_LABEL[mark]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Stage panel
// ---------------------------------------------------------------------------

function DoneToggle({ done, busy, onChange }: { done: boolean; busy: boolean; onChange: (done: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={done}
      disabled={busy}
      onClick={() => onChange(!done)}
      className={cn("gap-2", done && "border-emerald-500/40 text-emerald-300")}
    >
      {done ? <CheckCircle2 /> : <Circle />}
      {done ? "Done" : "Mark done"}
    </Button>
  );
}

interface StageActionsProps {
  stage: StageId;
  status: StageStatus;
  hasContent: boolean;
  error: string | null;
  lastNotes: string | null;
  next: StageId | null;
  projectId: string;
  actions: PlanActions;
  busy: PlanBusy;
}

/** The action bar under a stage the guide writes. */
function GeneratedStageActions({
  stage,
  status,
  hasContent,
  error,
  lastNotes,
  next,
  projectId,
  actions,
  busy,
}: StageActionsProps) {
  const id = React.useId();
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const generating = busy.generate === stage;
  const doneBusy = busy.done === stage;

  if (status === "generating") {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner aria-label={undefined} role={undefined} className="text-primary" />
        Working on it. This takes about a minute.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <p role="alert" className="flex items-start gap-2 break-words text-sm leading-relaxed text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{error || "This step didn't finish."}</span>
        </p>
        <Button
          type="button"
          onClick={() => actions.generate(stage, lastNotes ?? undefined)}
          disabled={generating}
          className="gap-2"
        >
          {generating ? <Spinner /> : <RefreshCw />}
          Try again
        </Button>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <Button type="button" onClick={() => actions.generate(stage)} disabled={generating} className="gap-2">
        {generating && <Spinner />}
        Write this step
        {!generating && <ArrowRight />}
      </Button>
    );
  }

  const trimmed = notes.trim();
  return (
    <div className="space-y-4">
      <Collapsible open={changeOpen} onOpenChange={setChangeOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("transition-transform", changeOpen ? "rotate-0" : "-rotate-90")} />
            Change something
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-3 sm:p-4">
            <Label htmlFor={`${id}-notes`} className="sr-only">
              What to change
            </Label>
            <Textarea
              id={`${id}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_CHARS))}
              maxLength={NOTES_MAX_CHARS}
              rows={3}
              disabled={generating}
              placeholder="Tell the guide what to change, for example: make it battery powered"
              className="resize-y border-border bg-background font-mono text-base leading-relaxed focus-visible:ring-primary md:text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={generating}
                onClick={() => actions.generate(stage, trimmed || undefined)}
                className="gap-2"
              >
                {generating ? <Spinner /> : <RefreshCw />}
                Rewrite this step
              </Button>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {notes.length.toLocaleString("en-US")} / {NOTES_MAX_CHARS.toLocaleString("en-US")}
              </span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DoneToggle
          done={status === "done"}
          busy={doneBusy}
          onChange={(done) => actions.setDone(stage, done)}
        />
        {next ? (
          <Button
            type="button"
            onClick={() => actions.continueFrom(stage)}
            disabled={doneBusy}
            className="h-auto gap-2 whitespace-normal"
          >
            {doneBusy && <Spinner />}
            Continue to {stageLabel(next)}
            <ArrowRight />
          </Button>
        ) : (
          <Button asChild className="gap-2">
            <Link href={`/project/${projectId}/export`}>
              Go to export
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** The action bar under the mechanical stage, which is done in the studio. */
function MechanicalStageActions({
  view,
  projectId,
  brief,
  actions,
  busy,
}: {
  view: JourneyView;
  projectId: string;
  brief: string | undefined;
  actions: PlanActions;
  busy: PlanBusy;
}) {
  if (view.mechanical.partCount === 0) {
    const ready = brief !== undefined && brief.trim() !== "";
    return (
      <Button
        type="button"
        onClick={actions.startDesign}
        disabled={!ready || busy.startDesign}
        className="gap-2"
      >
        {busy.startDesign && <Spinner />}
        Start the design
        {!busy.startDesign && <ArrowRight />}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <DoneToggle
        done={view.stages.mechanical?.status === "done"}
        busy={busy.done === "mechanical"}
        onChange={(done) => actions.setDone("mechanical", done)}
      />
      <Button asChild className="gap-2">
        <Link href={`/project/${projectId}`}>
          <Box />
          Open studio
        </Link>
      </Button>
    </div>
  );
}

function stageContent(props: PlanViewProps, stage: StageId): React.ReactNode {
  const { view, project } = props;
  switch (stage) {
    case "idea": {
      const content = view.stages.idea?.content;
      return content ? <IdeaStage content={content} /> : null;
    }
    case "validate": {
      const entry = view.stages.validate;
      return entry?.content ? <ValidateStage content={entry.content} generatedAt={entry.generatedAt} /> : null;
    }
    case "requirements": {
      const content = view.stages.requirements?.content;
      return content ? <RequirementsStage content={content} /> : null;
    }
    case "sourcing": {
      const content = view.stages.sourcing?.content;
      return content ? <SourcingStage content={content} /> : null;
    }
    case "mechanical":
      return <MechanicalStage mechanical={view.mechanical} brief={props.mechanicalBrief} />;
    case "electronics": {
      const content = view.stages.electronics?.content;
      return content ? <ElectronicsStage content={content} /> : null;
    }
    case "pcb": {
      const content = view.stages.pcb?.content;
      return content ? (
        <PcbStage
          content={content}
          projectId={project._id}
          onDownloadStarter={props.actions.downloadPcbStarter}
          downloading={props.busy.pcbStarter}
          downloadError={props.pcbStarterError ?? null}
        />
      ) : null;
    }
    case "build": {
      const content = view.stages.build?.content;
      return content ? <BuildStage content={content} /> : null;
    }
  }
}

function StagePanel(props: PlanViewProps & { stage: StageId }) {
  const { view, stage, project, actions, busy } = props;
  const def = getStage(stage);
  const entry = view.stages[stage];
  const status: StageStatus = entry?.status ?? "todo";
  const content = stageContent(props, stage);
  const index = view.applicable.indexOf(stage);
  const headingId = `plan-stage-${stage}`;

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-xl border border-border bg-card/40 p-4 shadow sm:p-6"
    >
      <p className={cn(LABEL, "text-primary")}>
        Step {index + 1} of {view.applicable.length}
      </p>
      <h2 id={headingId} className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
        {def.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{def.blurb}</p>

      {content && (
        <div className={cn("mt-6", status === "generating" && "pointer-events-none opacity-50")}>{content}</div>
      )}

      <div className="mt-6 border-t border-border pt-5">
        {isGeneratedStage(stage) ? (
          <GeneratedStageActions
            // Reset the notes box when the stage changes.
            key={stage}
            stage={stage}
            status={status}
            hasContent={content !== null}
            error={entry?.error ?? null}
            lastNotes={entry?.notes ?? null}
            next={nextApplicableStage(view.applicable, stage)}
            projectId={project._id}
            actions={actions}
            busy={busy}
          />
        ) : (
          <MechanicalStageActions
            view={view}
            projectId={project._id}
            brief={props.mechanicalBrief}
            actions={actions}
            busy={busy}
          />
        )}
      </div>
    </section>
  );
}

/** Shown for a project that has no plan yet. */
function StartPlanCard({ busy, onBegin }: { busy: boolean; onBegin: (track: Track) => void }) {
  const [track, setTrack] = React.useState<Track>("hobby");
  return (
    <section
      aria-labelledby="plan-start"
      className="mx-auto w-full max-w-xl rounded-xl border border-border bg-card p-4 shadow sm:p-6"
    >
      <p className={cn(LABEL, "text-primary")}>Plan</p>
      <h1 id="plan-start" className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
        Plan this project
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The guide walks you from the idea to parts in hand, one step at a time.
      </p>
      <p className={cn(LABEL, "mt-5")}>Who is it for?</p>
      <Segmented
        label="Who is it for?"
        className="mt-2"
        value={track}
        options={TRACK_OPTIONS}
        onChange={(next) => setTrack(next)}
        disabled={busy}
      />
      <p className="mt-2 text-xs text-muted-foreground">{TRACK_HELP[track]}</p>
      <Button type="button" onClick={() => onBegin(track)} disabled={busy} className="mt-5 w-full gap-2 sm:w-auto">
        {busy && <Spinner />}
        Start the plan
        {!busy && <ArrowRight />}
      </Button>
    </section>
  );
}

export function PlanView(props: PlanViewProps) {
  const { project, view, selectedStage, onSelectStage, actions, busy } = props;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PlanHeader project={project} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 md:p-10">
        {view.journey === null ? (
          <StartPlanCard busy={busy.begin} onBegin={actions.begin} />
        ) : (
          <>
            <TopBand project={project} view={view} actions={actions} busy={busy} />
            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
              <StageRail view={view} selectedStage={selectedStage} onSelectStage={onSelectStage} />
              {selectedStage && <StagePanel {...props} stage={selectedStage} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default PlanView;
