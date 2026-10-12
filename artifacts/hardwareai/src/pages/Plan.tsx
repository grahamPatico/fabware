import React from "react";
import { useLocation, useParams } from "wouter";
import { useConvex, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { PlanNotFound, PlanSkeleton, PlanView, type PlanActions, type PlanBusy } from "@/components/plan/PlanView";
import {
  hashForStage,
  nextApplicableStage,
  resolveSelectedStage,
  shouldGenerateOnContinue,
  stageFromHash,
} from "@/components/plan/planLogic";
import { toast } from "@/hooks/use-toast";
import { readChatPrefs } from "@/lib/chatPrefs";
import { journeyApi } from "@/lib/journeyApi";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { StageId, Track } from "../../convex/lib/journey";

const TRY_AGAIN = "Check your connection and try again.";

function errorText(err: unknown): string {
  return err instanceof ConvexError ? String(err.data) : TRY_AGAIN;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The stage named in the URL hash, kept in step with back/forward and hand edits. */
function useHashStage(): [StageId | null, (stage: StageId) => void] {
  const [stage, setStage] = React.useState<StageId | null>(() => stageFromHash(window.location.hash));
  React.useEffect(() => {
    const onHashChange = () => setStage(stageFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const select = React.useCallback((next: StageId) => {
    setStage(next);
    const { pathname, search } = window.location;
    // replaceState, not location.hash: picking a stage shouldn't add history entries.
    window.history.replaceState(window.history.state, "", `${pathname}${search}${hashForStage(next)}`);
  }, []);
  return [stage, select];
}

export default function Plan() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const [, navigate] = useLocation();
  const convex = useConvex();

  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const view = useQuery(journeyApi.get, projectId && project ? { projectId } : "skip");

  const begin = useMutation(journeyApi.begin);
  const generate = useMutation(journeyApi.generate);
  const setSettings = useMutation(journeyApi.setSettings);
  const setDone = useMutation(journeyApi.setDone);
  const generateConcept = useMutation(journeyApi.generateConcept);
  const startRun = useMutation(api.agentRuns.start);

  const [hashStage, selectStage] = useHashStage();
  const selectedStage = view ? resolveSelectedStage(view, hashStage) : null;

  // Pin the opening stage in the URL so marking it done doesn't move the page
  // on to the next one by itself.
  React.useEffect(() => {
    if (view?.journey && selectedStage && hashStage !== selectedStage) selectStage(selectedStage);
  }, [view?.journey, selectedStage, hashStage, selectStage]);

  const needsBrief =
    view?.journey != null && selectedStage === "mechanical" && view.mechanical.partCount === 0;
  const mechanicalBrief = useQuery(journeyApi.mechanicalBrief, projectId && needsBrief ? { projectId } : "skip");

  const [beginBusy, setBeginBusy] = React.useState(false);
  const [generateBusy, setGenerateBusy] = React.useState<StageId | null>(null);
  const [settingsBusy, setSettingsBusy] = React.useState(false);
  const [doneBusy, setDoneBusy] = React.useState<StageId | null>(null);
  const [conceptBusy, setConceptBusy] = React.useState(false);
  const [startDesignBusy, setStartDesignBusy] = React.useState(false);
  const [pcbStarterBusy, setPcbStarterBusy] = React.useState(false);
  const [pcbStarterError, setPcbStarterError] = React.useState<string | null>(null);

  // Browser tab title follows the project name; put the old one back on leave.
  const titleName = project?.name ?? null;
  React.useEffect(() => {
    if (!titleName) return;
    const previous = document.title;
    document.title = `${titleName} plan · Fabware`;
    return () => {
      document.title = previous;
    };
  }, [titleName]);

  if (!projectId || project === null) return <PlanNotFound />;
  if (project === undefined || view === undefined) return <PlanSkeleton />;

  const fail = (title: string, err: unknown) => {
    console.error(title, err);
    toast({ variant: "destructive", title, description: errorText(err) });
  };

  /** Ask the guide to write a stage. Resolves false when the call was refused. */
  const runGenerate = async (stage: StageId, notes?: string): Promise<boolean> => {
    setGenerateBusy(stage);
    try {
      const { model, effort } = readChatPrefs();
      await generate({ projectId, stage, notes, model, effort });
      return true;
    } catch (err) {
      fail("Couldn't start this step", err);
      return false;
    } finally {
      setGenerateBusy(null);
    }
  };

  const actions: PlanActions = {
    begin: async (track: Track) => {
      setBeginBusy(true);
      try {
        const { model, effort } = readChatPrefs();
        await begin({ projectId, track, model, effort });
      } catch (err) {
        fail("Couldn't start the plan", err);
      } finally {
        setBeginBusy(false);
      }
    },

    generate: (stage, notes) => {
      void runGenerate(stage, notes);
    },

    setTrack: async (track) => {
      setSettingsBusy(true);
      try {
        await setSettings({ projectId, track });
      } catch (err) {
        fail("Couldn't save that change", err);
      } finally {
        setSettingsBusy(false);
      }
    },

    setNeedsElectronics: async (needsElectronics) => {
      setSettingsBusy(true);
      try {
        await setSettings({ projectId, needsElectronics });
      } catch (err) {
        fail("Couldn't save that change", err);
      } finally {
        setSettingsBusy(false);
      }
    },

    setDone: async (stage, done) => {
      setDoneBusy(stage);
      try {
        await setDone({ projectId, stage, done });
      } catch (err) {
        fail("Couldn't save that change", err);
      } finally {
        setDoneBusy(null);
      }
    },

    continueFrom: async (stage) => {
      const next = nextApplicableStage(view.applicable, stage);
      if (!next) return;
      setDoneBusy(stage);
      try {
        await setDone({ projectId, stage, done: true });
      } catch (err) {
        fail("Couldn't save that change", err);
        return;
      } finally {
        setDoneBusy(null);
      }
      selectStage(next);
      window.scrollTo({ top: 0 });
      if (shouldGenerateOnContinue(view, next)) await runGenerate(next);
    },

    newPicture: async () => {
      setConceptBusy(true);
      try {
        await generateConcept({ projectId });
      } catch (err) {
        fail("Couldn't make a new picture", err);
      } finally {
        setConceptBusy(false);
      }
    },

    startDesign: async () => {
      const brief = (mechanicalBrief ?? "").trim();
      if (!brief) return;
      setStartDesignBusy(true);
      try {
        const { model, effort } = readChatPrefs();
        await startRun({ projectId, content: brief, model, effort });
      } catch (err) {
        fail("Couldn't start the design", err);
        setStartDesignBusy(false);
        return;
      }
      navigate(`/project/${projectId}`);
    },

    downloadPcbStarter: async () => {
      setPcbStarterBusy(true);
      setPcbStarterError(null);
      try {
        const file = await convex.query(journeyApi.pcbStarter, { projectId });
        if (!file) throw new Error("no starter board");
        const filename = /\.kicad_pcb$/i.test(file.filename) ? file.filename : `${file.filename}.kicad_pcb`;
        saveBlob(new Blob([file.content], { type: "application/octet-stream" }), filename);
      } catch (err) {
        console.error("KiCad starter download failed", err);
        setPcbStarterError(
          err instanceof ConvexError ? String(err.data) : "Download failed. Try again.",
        );
      } finally {
        setPcbStarterBusy(false);
      }
    },
  };

  const busy: PlanBusy = {
    begin: beginBusy,
    generate: generateBusy,
    settings: settingsBusy,
    done: doneBusy,
    concept: conceptBusy,
    startDesign: startDesignBusy,
    pcbStarter: pcbStarterBusy,
  };

  return (
    <PlanView
      project={project}
      view={view}
      selectedStage={selectedStage}
      onSelectStage={selectStage}
      actions={actions}
      busy={busy}
      mechanicalBrief={needsBrief ? mechanicalBrief : undefined}
      pcbStarterError={pcbStarterError}
    />
  );
}
