import { MessageSquare } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECTABLE_MODELS, getModel, type Effort } from "../../../../convex/lib/models";
import { effortLabel } from "./prefs";

interface ChatHeaderProps {
  focusedPartRole?: string | null;
  model: string;
  effort: Effort;
  onModelChange: (id: string) => void;
  onEffortChange: (effort: string) => void;
}

export default function ChatHeader({
  focusedPartRole,
  model,
  effort,
  onModelChange,
  onEffortChange,
}: ChatHeaderProps) {
  const efforts = getModel(model)?.efforts ?? [];

  return (
    // Container query: in a narrow panel the two selects drop to their own
    // full-width row instead of wrapping one at a time.
    <div className="@container shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <h2 className="mr-auto flex min-w-0 max-w-full items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <MessageSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap">Design chat</span>
          {focusedPartRole && (
            <span
              className="min-w-0 truncate rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] tracking-wider text-primary"
              title={`Focused part: ${focusedPartRole}`}
            >
              Focused: {focusedPartRole}
            </span>
          )}
        </h2>
        <div className="flex w-full min-w-0 items-center gap-2 @[34rem]:w-auto">
          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger
              aria-label="Model"
              className="h-7 min-w-0 flex-1 gap-2 px-2 font-mono text-[11px] @[34rem]:w-[188px] @[34rem]:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTABLE_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-[11px]">
                  <span>{m.label}</span>
                  <span className="ml-2 text-muted-foreground">{m.hint}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {efforts.length > 0 && (
            <Select value={effort} onValueChange={onEffortChange}>
              <SelectTrigger
                aria-label="Effort"
                className="h-7 w-[104px] shrink-0 gap-2 px-2 font-mono text-[11px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {efforts.map((e) => (
                  <SelectItem key={e} value={e} className="font-mono text-[11px]">
                    {effortLabel(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
