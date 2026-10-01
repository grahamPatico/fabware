import React from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useLocation } from "wouter";
import { ArrowRight, ChevronDown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { readChatPrefs } from "@/lib/chatPrefs";
import { getOwnerKey } from "@/lib/owner";
import { cn } from "@/lib/utils";

type Tier = "jerry-rigged" | "mvp" | "commercial";

const TIERS: ReadonlyArray<{ value: Tier; label: string }> = [
  { value: "jerry-rigged", label: "Quick and cheap" },
  { value: "mvp", label: "Prototype" },
  { value: "commercial", label: "Production" },
];

const EXAMPLES = [
  "6 x 4 in aluminum mounting plate with four M4 corner holes",
  "12 x 8 x 6 in steel enclosure with a hinged lid",
  "3 x 5 in L-bracket, 14 ga steel, four 1/4-20 holes",
  "24 in wall shelf with two support brackets",
];

const MIN_PROMPT_CHARS = 3;
const NAME_MAX_CHARS = 48;
const CREATE_FAILED = "Couldn't create the project. Check your connection and try again.";

/**
 * A project name from the prompt: its first line or sentence, cut to 48
 * characters at a word boundary, first letter capitalised.
 */
function deriveProjectName(prompt: string): string {
  const firstLine = prompt.trim().split(/\r?\n/)[0]?.trim() ?? "";
  // A sentence ends at . ! ? followed by whitespace or the end, so decimals
  // ("0.125 in") and thread callouts ("1/4-20") stay intact.
  const sentence = /^(.*?)[.!?](?:\s|$)/.exec(firstLine)?.[1] ?? firstLine;
  let name = sentence.replace(/\s+/g, " ").trim();
  if (name.length > NAME_MAX_CHARS) {
    const head = name.slice(0, NAME_MAX_CHARS + 1);
    const lastSpace = head.lastIndexOf(" ");
    name = lastSpace > 0 ? head.slice(0, lastSpace) : name.slice(0, NAME_MAX_CHARS);
  }
  name = name.replace(/[\s,;:\-]+$/, "");
  if (!name) return "Untitled project";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export interface NewProjectComposerHandle {
  /** Scroll the composer into view and put the cursor in the prompt. */
  focus: () => void;
}

interface NewProjectComposerProps {
  initialPrompt?: string;
  className?: string;
}

export const NewProjectComposer = React.forwardRef<
  NewProjectComposerHandle,
  NewProjectComposerProps
>(function NewProjectComposer({ initialPrompt, className }, ref) {
  const [, navigate] = useLocation();
  const createProject = useMutation(api.projects.create);
  const updateScope = useMutation(api.projects.updateScope);
  const start = useMutation(api.agentRuns.start);

  const [prompt, setPrompt] = React.useState(initialPrompt ?? "");
  const [name, setName] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("mvp");
  const [outdoor, setOutdoor] = React.useState(false);
  const [waterproof, setWaterproof] = React.useState(false);
  const [referenceScale, setReferenceScale] = React.useState("");
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // State updates land a render late; the ref is what stops a double submit.
  const submitting = React.useRef(false);
  const rootRef = React.useRef<HTMLFormElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const id = React.useId();

  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        textareaRef.current?.focus({ preventScroll: true });
      },
    }),
    [],
  );

  const promptReady = prompt.replace(/\s/g, "").length >= MIN_PROMPT_CHARS;
  const canSubmit = promptReady && !busy;

  const submit = async () => {
    if (!promptReady || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);

    const content = prompt.trim();
    const projectName = name.trim() || deriveProjectName(content);

    let projectId: Id<"projects">;
    try {
      const project = await createProject({
        name: projectName,
        description: content,
        ownerKey: getOwnerKey(),
      });
      if (!project) throw new Error("projects.create returned no project");
      projectId = project._id;
    } catch (err) {
      console.error("Project create failed", err);
      setError(err instanceof ConvexError ? String(err.data) : CREATE_FAILED);
      submitting.current = false;
      setBusy(false);
      return;
    }

    // The project exists from here on, so the user always lands in it. If the
    // scope or the first turn fails they can resend from the chat.
    try {
      const scale = referenceScale.trim();
      await updateScope({
        projectId,
        scope: {
          tier,
          environment: {
            location: outdoor ? "outdoor" : "indoor",
            waterproof: outdoor && waterproof,
          },
          useCase: content,
          referenceScale: scale ? { kind: scale } : undefined,
        },
      });
      const { model, effort } = readChatPrefs();
      await start({ projectId, content, model, effort });
    } catch (err) {
      console.error("First agent turn failed to start", err);
      toast({
        variant: "destructive",
        title: "Your first message didn't send",
        description:
          err instanceof ConvexError
            ? `${String(err.data)} Send it again from the chat.`
            : "The project was created. Send your message again from the chat.",
      });
    }

    navigate(`/project/${projectId}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const fillExample = (example: string) => {
    setPrompt(example);
    setError(null);
    textareaRef.current?.focus();
  };

  return (
    <form
      ref={rootRef}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      className={cn(
        "scroll-mt-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow",
        className,
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-primary">New project</p>
      <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
        <label htmlFor={`${id}-prompt`}>What do you want to build?</label>
      </h2>

      <Textarea
        id={`${id}-prompt`}
        ref={textareaRef}
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          if (error) setError(null);
        }}
        autoFocus
        rows={4}
        disabled={busy}
        placeholder="A wall-mounted steel bracket for a 2 in pipe, powder coated black"
        className="mt-4 min-h-[120px] resize-y bg-background border-border font-mono text-base md:text-sm leading-relaxed focus-visible:ring-primary"
      />

      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Or start from an example
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fillExample(example)}
              className="h-auto max-w-full whitespace-normal py-1.5 text-left font-mono text-[11px] font-normal leading-snug text-muted-foreground hover:text-foreground"
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen} className="mt-5">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("transition-transform", optionsOpen ? "rotate-0" : "-rotate-90")}
            />
            Options
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 grid gap-5 rounded-md border border-border/60 bg-background/40 p-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label
                htmlFor={`${id}-name`}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Project name (optional)
              </Label>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                maxLength={80}
                placeholder="Named from your prompt"
                className="bg-background font-mono text-sm"
              />
            </div>

            <div className="grid content-start gap-2">
              <Label
                htmlFor={`${id}-scale`}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Reference scale (optional)
              </Label>
              <Input
                id={`${id}-scale`}
                value={referenceScale}
                onChange={(e) => setReferenceScale(e.target.value)}
                disabled={busy}
                placeholder="Fits 3 tennis balls"
                className="bg-background font-mono text-sm"
              />
            </div>

            <div className="grid content-start gap-2">
              <span
                id={`${id}-tier`}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Build tier
              </span>
              <RadioGroup
                aria-labelledby={`${id}-tier`}
                value={tier}
                onValueChange={(value) => setTier(value as Tier)}
                disabled={busy}
              >
                {TIERS.map((t) => (
                  <div key={t.value} className="flex items-center gap-2">
                    <RadioGroupItem value={t.value} id={`${id}-tier-${t.value}`} />
                    <Label htmlFor={`${id}-tier-${t.value}`} className="font-normal">
                      {t.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="grid content-start gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Environment
              </span>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-outdoor`}
                  checked={outdoor}
                  onCheckedChange={(checked) => setOutdoor(checked === true)}
                  disabled={busy}
                />
                <Label htmlFor={`${id}-outdoor`} className="font-normal">
                  Outdoor
                </Label>
              </div>
              {outdoor && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-waterproof`}
                    checked={waterproof}
                    onCheckedChange={(checked) => setWaterproof(checked === true)}
                    disabled={busy}
                  />
                  <Label htmlFor={`${id}-waterproof`} className="font-normal">
                    Waterproof
                  </Label>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy}
          className="w-full gap-2 font-mono text-xs uppercase tracking-wider sm:w-auto"
        >
          {busy ? (
            <>
              <Spinner />
              Starting
            </>
          ) : (
            <>
              Start designing
              <ArrowRight />
            </>
          )}
        </Button>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
          Cmd/Ctrl + Enter
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 font-mono text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </form>
  );
});
