import React from "react";
import { Download } from "lucide-react";
import type { PcbBoard, PcbContent, PcbRules } from "../../../../convex/lib/journey";
import { getSupplier } from "../../../../convex/lib/suppliers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  checklistItemKey,
  checklistProgress,
  checklistStorageKey,
  formatNumber,
  parseChecklistState,
  pcbChecklistGroups,
  pcbDrawing,
  serializeChecklistState,
  supplierName,
} from "../planLogic";
import { ExternalButton, Fact, FactGrid, LABEL, NumberedList, Prose, Section } from "../parts";

/** The outline and mounting holes, drawn to scale from the numbers. */
function BoardDrawing({ board }: { board: PcbBoard }) {
  const drawing = pcbDrawing(board);
  if (!drawing) return null;
  const { board: outline, holes, stroke } = drawing;
  return (
    <figure className="min-w-0">
      <div className="rounded border border-border bg-[#0a0f18] p-3">
        <svg
          viewBox={drawing.viewBox}
          role="img"
          aria-label={`Board outline, ${formatNumber(board.widthMm)} by ${formatNumber(board.heightMm)} mm, with ${holes.length} mounting ${holes.length === 1 ? "hole" : "holes"}`}
          className="mx-auto block max-h-64 w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect
            x={outline.x}
            y={outline.y}
            width={outline.width}
            height={outline.height}
            rx={outline.radius}
            ry={outline.radius}
            fill="hsl(140 45% 22% / 0.55)"
            stroke="hsl(140 60% 55%)"
            strokeWidth={stroke}
          />
          {holes.map((hole, i) => (
            <circle
              key={i}
              cx={hole.cx}
              cy={hole.cy}
              r={hole.r}
              fill="#0a0f18"
              stroke="hsl(25 95% 53%)"
              strokeWidth={stroke}
            />
          ))}
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Outline and mounting holes, to scale.
      </figcaption>
    </figure>
  );
}

function ruleRows(rules: PcbRules): Array<[string, string]> {
  return [
    ["Minimum trace width", `${formatNumber(rules.minTraceMm)} mm`],
    ["Minimum spacing", `${formatNumber(rules.minSpaceMm)} mm`],
    ["Minimum via drill", `${formatNumber(rules.minViaDrillMm)} mm`],
    ["Minimum via pad", `${formatNumber(rules.minViaPadMm)} mm`],
    ["Minimum hole to board edge", `${formatNumber(rules.minHoleToEdgeMm)} mm`],
    ["Copper weight", `${formatNumber(rules.copperOz)} oz`],
  ];
}

/** Checked checklist lines for one project, kept in this browser. */
function useChecklist(projectId: string): [Set<string>, (key: string, checked: boolean) => void] {
  const storageKey = checklistStorageKey(projectId);
  const read = React.useCallback((): Set<string> => {
    try {
      return parseChecklistState(localStorage.getItem(storageKey));
    } catch {
      return new Set();
    }
  }, [storageKey]);

  const [checked, setChecked] = React.useState<Set<string>>(read);
  React.useEffect(() => setChecked(read()), [read]);

  const toggle = (key: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      try {
        localStorage.setItem(storageKey, serializeChecklistState(next));
      } catch {
        // Storage is blocked or full. The ticks still work for this visit.
      }
      return next;
    });
  };
  return [checked, toggle];
}

interface PcbStageProps {
  content: PcbContent;
  projectId: string;
  onDownloadStarter: () => void;
  downloading: boolean;
  /** Set when the last download failed. */
  downloadError: string | null;
}

export function PcbStage({ content, projectId, onDownloadStarter, downloading, downloadError }: PcbStageProps) {
  const { board } = content;
  const id = React.useId();
  const groups = pcbChecklistGroups(content);
  const [checked, toggle] = useChecklist(projectId);
  const progress = checklistProgress(groups, checked);
  const fab = getSupplier(content.fab.supplierId);

  return (
    <div className="space-y-8">
      <Section title="Board">
        <div className="grid gap-4 md:grid-cols-2">
          <FactGrid className="content-start">
            <Fact label="Size (W × H)">
              {formatNumber(board.widthMm)} × {formatNumber(board.heightMm)} mm
            </Fact>
            <Fact label="Corner radius">{formatNumber(board.cornerRadiusMm)} mm</Fact>
            <Fact label="Thickness">{formatNumber(board.thicknessMm)} mm</Fact>
            <Fact label="Layers">{board.layers}</Fact>
            <Fact label="Mounting holes">{board.mountingHoles.length}</Fact>
            <Fact label="Outline from" className="sm:col-span-2">
              {board.outlineBasis}
            </Fact>
          </FactGrid>
          <BoardDrawing board={board} />
        </div>
        <div className="space-y-2">
          <Button type="button" onClick={onDownloadStarter} disabled={downloading} className="h-auto max-w-full gap-2 whitespace-normal">
            {downloading ? <Spinner /> : <Download />}
            Download KiCad starter board
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Opens in KiCad with the outline and mounting holes placed. You draw the schematic and route it.
          </p>
          {downloadError && (
            <p role="alert" className="text-xs text-destructive">
              {downloadError}
            </p>
          )}
        </div>
      </Section>

      <Section title="Board house">
        <div className="rounded border border-border bg-card p-4">
          <p className="font-bold">{supplierName(content.fab.supplierId)}</p>
          <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{content.fab.why}</p>
          <ExternalButton href={fab?.homepage} className="mt-3">
            Open {supplierName(content.fab.supplierId)}
          </ExternalButton>
        </div>
      </Section>

      <Section title="Design rules">
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-left text-sm">
            <tbody>
              {ruleRows(content.rules).map(([label, value], i) => (
                <tr key={label} className={i > 0 ? "border-t border-border" : undefined}>
                  <th scope="row" className="px-3 py-2 font-normal text-muted-foreground">
                    {label}
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose className="text-xs text-muted-foreground">{content.rules.note}</Prose>
      </Section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
          <h3 className={LABEL}>Checklist</h3>
          <span className="shrink-0 font-mono text-xs text-muted-foreground" aria-live="polite">
            {progress.checked} of {progress.total} checked
          </span>
        </div>
        <div className="space-y-6">
          {groups.map((group, gi) => (
            <div key={group.group}>
              <p className="font-bold">{group.group}</p>
              <ul className="mt-2 space-y-3">
                {group.items.map((item, ii) => {
                  const key = checklistItemKey(group.group, item.text);
                  const inputId = `${id}-check-${gi}-${ii}`;
                  return (
                    <li key={key} className="flex items-start gap-3">
                      <Checkbox
                        id={inputId}
                        checked={checked.has(key)}
                        onCheckedChange={(value) => toggle(key, value === true)}
                        className="mt-1"
                      />
                      <label htmlFor={inputId} className="min-w-0 cursor-pointer">
                        <span className="block break-words text-sm leading-relaxed">{item.text}</span>
                        <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted-foreground">
                          {item.why}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <Section title="Next steps">
        <NumberedList items={content.nextSteps} />
      </Section>
    </div>
  );
}
