import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Tier = "jerry-rigged" | "mvp" | "commercial";

export default function ScopeEditor({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const project = useQuery(api.projects.get, projectId && open ? { projectId } : "skip");
  const updateScope = useMutation(api.projects.updateScope);

  const [tier, setTier] = useState<Tier>("mvp");
  const [outdoor, setOutdoor] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [uv, setUv] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [useCase, setUseCase] = useState("");
  const [referenceKind, setReferenceKind] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project?.scope) return;
    setTier(project.scope.tier);
    setOutdoor(project.scope.environment.location === "outdoor");
    setWaterproof(project.scope.environment.waterproof ?? false);
    setUv(project.scope.environment.uv ?? false);
    setFreeze(project.scope.environment.freeze ?? false);
    setUseCase(project.scope.useCase);
    setReferenceKind(project.scope.referenceScale?.kind ?? "");
  }, [project]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateScope({
        projectId,
        scope: {
          tier,
          environment: {
            location: outdoor ? "outdoor" : "indoor",
            ...(outdoor ? { waterproof, uv, freeze } : {}),
          },
          useCase,
          referenceScale: referenceKind ? { kind: referenceKind } : undefined,
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] bg-card border-l border-border">
        <SheetHeader>
          <SheetTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Project Scope
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground/70">
            Updates cascade to material/fastener/finish suggestions.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-4 font-mono text-xs">
          <div>
            <Label>Build tier</Label>
            <RadioGroup value={tier} onValueChange={(v: Tier) => setTier(v)}>
              <div className="flex items-center gap-2"><RadioGroupItem value="jerry-rigged" id="st1" /><label htmlFor="st1">Jerry-rigged</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="mvp" id="st2" /><label htmlFor="st2">MVP</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="commercial" id="st3" /><label htmlFor="st3">Commercial</label></div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} id="sc-out" />
            <label htmlFor="sc-out">Outdoor</label>
          </div>
          {outdoor && (
            <div className="pl-4 space-y-2">
              <div className="flex items-center gap-2"><input type="checkbox" checked={waterproof} onChange={e => setWaterproof(e.target.checked)} id="sc-wp" /><label htmlFor="sc-wp">Waterproof</label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={uv} onChange={e => setUv(e.target.checked)} id="sc-uv" /><label htmlFor="sc-uv">UV-exposed</label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={freeze} onChange={e => setFreeze(e.target.checked)} id="sc-fr" /><label htmlFor="sc-fr">Freeze cycles</label></div>
            </div>
          )}
          <div>
            <Label>Use case</Label>
            <Input value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="What's this for?" />
          </div>
          <div>
            <Label>Reference scale (optional)</Label>
            <Input value={referenceKind} onChange={e => setReferenceKind(e.target.value)} placeholder="3 tennis balls" />
          </div>
          <Button onClick={handleSave} disabled={saving || !useCase.trim()} className="w-full">
            {saving ? "Saving..." : "Save scope"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
