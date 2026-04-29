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
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [tier, setTier] = useState<"jerry-rigged" | "mvp" | "commercial">("mvp");
  const [outdoor, setOutdoor] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [intent, setIntent] = useState("");
  const [referenceScale, setReferenceScale] = useState("");

  const canSubmit = name.trim().length > 0 && intent.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const project = await createProject({ name, description: intent });
      if (!project) throw new Error("Create failed");
      // Navigate first so the user sees the studio loading state immediately
      // — the agent's first turn happens in the background and parts stream
      // in via reactive queries.
      setLocation(`/project/${project._id}?starting=1`);
      onOpenChange(false);

      const model = localStorage.getItem("fabware.chat.model") ?? "claude-opus-4-7";
      const effort = localStorage.getItem("fabware.chat.effort") ?? "high";
      await updateScope({
        projectId: project._id,
        scope: {
          tier,
          environment: { location: outdoor ? "outdoor" : "indoor", waterproof: outdoor && waterproof },
          useCase: intent,
          referenceScale: referenceScale ? { kind: referenceScale } : undefined,
        },
      });
      // Fire the first agent turn — the studio shows loading until parts arrive.
      send({ projectId: project._id, content: intent, model, effort }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary">
            New project
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label>Project name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. TENNIS-LOCKER-01" />
          </div>
          <div>
            <Label>Build tier</Label>
            <RadioGroup value={tier} onValueChange={(v: any) => setTier(v)}>
              <div className="flex items-center gap-2"><RadioGroupItem value="jerry-rigged" id="t1" /><label htmlFor="t1">Jerry-rigged (cheap &amp; fast)</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="mvp" id="t2" /><label htmlFor="t2">MVP (prototype-worthy)</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="commercial" id="t3" /><label htmlFor="t3">Commercial (production)</label></div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} /> Outdoor</label>
            {outdoor && (
              <label className="flex items-center gap-2 pl-3"><input type="checkbox" checked={waterproof} onChange={e => setWaterproof(e.target.checked)} /> Waterproof</label>
            )}
          </div>
          <div>
            <Label>Describe what you want</Label>
            <Textarea
              value={intent}
              onChange={e => setIntent(e.target.value)}
              rows={4}
              placeholder="Locker with hinged top for storing 3 tennis balls — about 12&times;12&times;12 inches, keypad lock, stackable."
            />
          </div>
          <div>
            <Label>Reference scale (optional)</Label>
            <Input
              value={referenceScale}
              onChange={e => setReferenceScale(e.target.value)}
              placeholder="3 tennis balls, ~12x12x12 inches"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
            {busy ? "Generating…" : "Create & generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
