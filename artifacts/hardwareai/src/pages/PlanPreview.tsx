// Dev-only preview of the plan page from fixtures. Registered in App.tsx only
// when `import.meta.env.DEV` is true, so it never reaches a production build.
// It needs no backend: every action logs to the console.
//
//   /dev/plan-preview?f=full|mid|new|none[&c=none|generating|ready|error]#stage

import React from "react";
import { PlanNotFound, PlanSkeleton, PlanView, IDLE_BUSY, type PlanActions } from "@/components/plan/PlanView";
import { hashForStage, resolveSelectedStage, stageFromHash } from "@/components/plan/planLogic";
import { FIXTURES, MECHANICAL_BRIEF, type FixtureId } from "@/components/plan/__fixtures__/journeyView";
import type { JourneyView, StageId } from "../../convex/lib/journey";

type PreviewId = FixtureId | "loading" | "missing";
const PREVIEW_IDS: readonly PreviewId[] = ["full", "mid", "new", "none", "loading", "missing"];
const CONCEPT_STATES = ["none", "generating", "ready", "error"] as const;

function log(name: string) {
  return (...args: unknown[]) => console.log(`[plan-preview] ${name}`, ...args);
}

const ACTIONS: PlanActions = {
  begin: log("begin"),
  generate: log("generate"),
  setTrack: log("setTrack"),
  setNeedsElectronics: log("setNeedsElectronics"),
  setDone: log("setDone"),
  continueFrom: log("continueFrom"),
  newPicture: log("newPicture"),
  startDesign: log("startDesign"),
  downloadPcbStarter: log("downloadPcbStarter"),
};

function withConcept(view: JourneyView, state: string | null): JourneyView {
  if (!state || !(CONCEPT_STATES as readonly string[]).includes(state)) return view;
  const status = state as (typeof CONCEPT_STATES)[number];
  return {
    ...view,
    concept: {
      ...view.concept,
      status,
      error: status === "error" ? "The picture service is busy. Try again in a minute." : null,
    },
  };
}

export default function PlanPreview() {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("f") ?? "full";
  const id: PreviewId = (PREVIEW_IDS as readonly string[]).includes(wanted) ? (wanted as PreviewId) : "full";

  const [hashStage, setHashStage] = React.useState<StageId | null>(() => stageFromHash(window.location.hash));
  React.useEffect(() => {
    const onHashChange = () => setHashStage(stageFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const picker = (
    <div className="fixed bottom-2 right-2 z-50 flex flex-wrap gap-1 rounded-md border border-border bg-card/95 p-1 font-mono text-[10px] uppercase tracking-widest shadow-lg print:hidden">
      {PREVIEW_IDS.map((option) => (
        <a
          key={option}
          href={`?f=${option}`}
          className={`rounded px-2 py-1 ${option === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {option}
        </a>
      ))}
    </div>
  );

  if (id === "loading") {
    return (
      <>
        <PlanSkeleton />
        {picker}
      </>
    );
  }
  if (id === "missing") {
    return (
      <>
        <PlanNotFound />
        {picker}
      </>
    );
  }

  const fixture = FIXTURES[id];
  const view = withConcept(fixture.view, params.get("c"));
  return (
    <>
      <PlanView
        project={fixture.project}
        view={view}
        selectedStage={resolveSelectedStage(view, hashStage)}
        onSelectStage={(stage) => {
          setHashStage(stage);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hashForStage(stage)}`);
        }}
        actions={ACTIONS}
        busy={IDLE_BUSY}
        mechanicalBrief={MECHANICAL_BRIEF}
      />
      {params.get("picker") !== "0" && picker}
    </>
  );
}
