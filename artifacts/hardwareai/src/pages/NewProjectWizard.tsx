import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { useLocation } from "wouter";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function NewProjectWizard({ open, onOpenChange }: Props) {
  const [, setLocation] = useLocation();
  const createProject = useMutation(api.projects.create);
  const updateScope = useMutation(api.projects.updateScope);
  const send = useAction(api.projectChat.send);
  const [page, setPage] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  // Page 1 state
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"jerry-rigged" | "mvp" | "commercial">("mvp");
  const [outdoor, setOutdoor] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [useCase, setUseCase] = useState("");
  const [referenceScale, setReferenceScale] = useState("");

  // Page 2 state
  const [intent, setIntent] = useState("");

  const handleNext = () => { if (name.trim() && useCase.trim()) setPage(2); };

  const handleSubmit = async () => {
    if (!intent.trim() || busy) return;
    setBusy(true);
    try {
      const project = await createProject({ name, description: useCase });
      if (!project) throw new Error("Create failed");
      const model = localStorage.getItem("fabware.chat.model") ?? "claude-opus-4-7";
      const effort = localStorage.getItem("fabware.chat.effort") ?? "high";
      await updateScope({
        projectId: project._id,
        scope: {
          tier,
          environment: { location: outdoor ? "outdoor" : "indoor", waterproof: outdoor && waterproof },
          useCase,
          referenceScale: referenceScale ? { kind: referenceScale } : undefined,
        },
      });
      // Kick off the agent so it calls select_archetype
      await send({ projectId: project._id, content: intent, model, effort });
      onOpenChange(false);
      setLocation(`/project/${project._id}`);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary">
            {page === 1 ? "Scope" : "What do you want to build?"}
          </DialogTitle>
        </DialogHeader>
        {page === 1 ? (
          <div className="grid gap-4 py-4">
            <div><Label>Project name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. TENNIS-LOCKER-01" /></div>
            <div>
              <Label>Build tier</Label>
              <RadioGroup value={tier} onValueChange={(v: any) => setTier(v)}>
                <div className="flex items-center gap-2"><RadioGroupItem value="jerry-rigged" id="t1" /><label htmlFor="t1">Jerry-rigged (cheap &amp; fast)</label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="mvp" id="t2" /><label htmlFor="t2">MVP (prototype-worthy)</label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="commercial" id="t3" /><label htmlFor="t3">Commercial (production)</label></div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} /> <Label>Outdoor</Label></div>
            {outdoor && (
              <div className="pl-4 flex items-center gap-2"><input type="checkbox" checked={waterproof} onChange={e => setWaterproof(e.target.checked)} /> <Label>Waterproof</Label></div>
            )}
            <div><Label>What&apos;s it for?</Label><Input value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="Outdoor tennis-ball rental lockers" /></div>
            <div><Label>What&apos;s inside / reference scale? (optional)</Label><Input value={referenceScale} onChange={e => setReferenceScale(e.target.value)} placeholder="3 tennis balls, ~12x12x12 inches" /></div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <Label>Describe what you want</Label>
            <Textarea value={intent} onChange={e => setIntent(e.target.value)} rows={6} placeholder="Locker with hinged top, keypad lock, stackable..." />
          </div>
        )}
        <DialogFooter>
          {page === 1 ? (
            <Button onClick={handleNext} disabled={!name.trim() || !useCase.trim()} className="w-full">Next</Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setPage(1)} className="flex-1">Back</Button>
              <Button onClick={handleSubmit} disabled={!intent.trim() || busy} className="flex-1">
                {busy ? "Generating..." : "Create & generate"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
