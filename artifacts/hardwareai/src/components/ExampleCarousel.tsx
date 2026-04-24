import React from "react";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAMPLES, type ExampleDesign } from "@/lib/example-designs";

function ProcessBadge({ process }: { process: ExampleDesign["process"] }) {
  const tone =
    process.id === "fdm"
      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
      : "bg-primary/10 text-primary border-primary/30";
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border ${tone}`}
    >
      {process.label}
    </span>
  );
}

function Card({ design }: { design: ExampleDesign }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
      <div className="md:col-span-2 space-y-3">
        <div className="w-full aspect-[10/7] border border-border/60 rounded-md bg-[#0a0f18] overflow-hidden">
          {design.preview}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Part
          </span>
          <ProcessBadge process={design.process} />
        </div>
        <h3 className="font-mono text-sm font-bold">{design.partTitle}</h3>
        <div className="rounded-md border border-border/60 bg-card/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          <span className="text-primary">you ›</span> {design.prompt}
        </div>
      </div>

      <div className="md:col-span-3 space-y-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-2">
            Spec
          </div>
          <ul className="text-sm font-mono space-y-1 text-muted-foreground">
            {design.spec.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-primary">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-2">
            Bill of materials
          </div>
          <ul className="text-sm font-mono space-y-1 text-muted-foreground">
            {design.bom.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-primary">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-2">
            Rule engine
          </div>
          <ul className="text-sm font-mono space-y-1 text-muted-foreground">
            {design.validation.map((s) => (
              <li key={s} className="flex gap-2 items-start">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="pt-2 border-t border-border/50 text-xs font-mono text-muted-foreground">
          <span className="text-primary">Handoff:</span> {design.handoff}
        </div>
      </div>
    </div>
  );
}

export default function ExampleCarousel({
  className = "",
  autoAdvanceMs = 8000,
}: {
  className?: string;
  autoAdvanceMs?: number;
}) {
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused || autoAdvanceMs <= 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), autoAdvanceMs);
    return () => clearInterval(t);
  }, [paused, autoAdvanceMs]);

  const design = EXAMPLES[idx];
  const go = (dir: 1 | -1) =>
    setIdx((i) => (i + dir + EXAMPLES.length) % EXAMPLES.length);

  return (
    <div
      className={`rounded-lg border border-border/60 bg-card/30 p-5 md:p-6 ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {String(idx + 1).padStart(2, "0")} / {String(EXAMPLES.length).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => go(-1)}
            className="h-7 w-7 p-0"
            title="Previous example"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => go(1)}
            className="h-7 w-7 p-0"
            title="Next example"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card design={design} />

      <div className="flex items-center justify-center gap-1.5 mt-6">
        {EXAMPLES.map((e, i) => (
          <button
            key={e.id}
            type="button"
            aria-label={`Show ${e.partTitle}`}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
