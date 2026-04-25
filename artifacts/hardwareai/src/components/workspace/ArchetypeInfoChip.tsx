import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const ARCHETYPE_LABELS: Record<string, string> = {
  hinged_enclosure: "Hinged Enclosure",
  sliding_enclosure: "Sliding Enclosure",
  bracket_plus_panel: "Bracket + Panel",
  divided_tray: "Divided Tray",
  shelf_with_brackets: "Shelf with Brackets",
  box_with_lid: "Box with Lid",
};

export default function ArchetypeInfoChip({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const breakOut = useMutation(api.projects.breakOut);
  const [confirming, setConfirming] = useState(false);

  if (!project?.archetypeId) return null;

  const label = ARCHETYPE_LABELS[project.archetypeId] ?? project.archetypeId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Template info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 font-mono text-xs">
        <div className="space-y-3">
          <p>This project was generated from the <strong>{label}</strong> template.</p>
          <Button size="sm" variant="outline" className="w-full" disabled>
            Tweak standard options <span className="ml-1 text-muted-foreground">(soon)</span>
          </Button>
          {confirming ? (
            <div className="space-y-2">
              <p className="text-muted-foreground">You'll lose the ability to regenerate from intent. Continue?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={async () => { await breakOut({ projectId }); setConfirming(false); }}>Confirm</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => setConfirming(true)}>
              Design fully custom instead
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
