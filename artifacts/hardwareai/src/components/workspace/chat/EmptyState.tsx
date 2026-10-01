import { ArrowUpRight } from "lucide-react";

export const STARTER_PROMPTS = [
  "A 6 x 4 in aluminum mounting plate with four M4 corner holes",
  "A 12 x 8 x 6 in steel enclosure with a hinged lid",
  "A 3 x 5 in L-bracket in 14 ga steel with four 1/4-20 holes",
  "A 24 in wall shelf with two support brackets",
] as const;

interface EmptyStateProps {
  disabled?: boolean;
  onPick: (prompt: string) => void;
}

export default function EmptyState({ disabled = false, onPick }: EmptyStateProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-4 text-center font-mono">
      <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
        What should we build?
      </h3>
      <p className="mt-2 max-w-sm text-xs text-muted-foreground">
        Describe a part or pick a starting point. You can attach a photo or sketch too.
      </p>
      <ul className="mt-5 grid w-full max-w-md gap-2 text-left">
        {STARTER_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="group flex w-full items-start gap-2 rounded border border-border bg-card px-3 py-2.5 text-left text-xs text-foreground/90 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">{prompt}</span>
              <ArrowUpRight
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
