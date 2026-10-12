import { CircuitBoard } from "lucide-react";
import type { ElectronicsContent } from "../../../../convex/lib/journey";
import { formatNumber, supplierName, UNKNOWN } from "../planLogic";
import { BulletList, Empty, ExternalButton, LABEL, Prose, Section } from "../parts";

export function ElectronicsStage({ content }: { content: ElectronicsContent }) {
  const { power } = content;
  return (
    <div className="space-y-8">
      <Prose>{content.summary}</Prose>

      <div className="flex gap-3 rounded-md border border-primary/40 bg-primary/10 p-4">
        <CircuitBoard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-bold">Prove it on a dev board first</p>
          <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{content.prototypeFirst}</p>
        </div>
      </div>

      <Section title="Blocks">
        {content.blocks.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {content.blocks.map((block, i) => (
              <div key={i} className="min-w-0 rounded border border-border bg-card p-4">
                <p className="break-words font-bold">{block.name}</p>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{block.role}</p>
                {block.candidates.length > 0 && (
                  <>
                    <p className={`${LABEL} mt-4`}>Candidate parts</p>
                    <ul className="mt-2 space-y-3">
                      {block.candidates.map((candidate, j) => (
                        <li key={j} className="min-w-0 border-l-2 border-border pl-3">
                          <p className="break-words font-mono text-sm">{candidate.part}</p>
                          <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                            {candidate.why}
                          </p>
                          <ExternalButton href={candidate.url} variant="ghost" className="-ml-3 mt-1 text-primary">
                            Search at {supplierName(candidate.supplierId)}
                          </ExternalButton>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Power">
        <Prose>
          <span className="text-muted-foreground">Source: </span>
          {power.source || UNKNOWN}
        </Prose>
        {power.rails.length > 0 && (
          <div className="overflow-hidden rounded border border-border">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-card">
                <tr className={LABEL}>
                  <th scope="col" className="w-1/2 px-3 py-2 font-normal">Rail</th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">Volts</th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">Max mA</th>
                </tr>
              </thead>
              <tbody>
                {power.rails.map((rail, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="break-words px-3 py-2">{rail.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(rail.volts)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {rail.maxMa === null ? UNKNOWN : formatNumber(rail.maxMa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {power.runtimeNote && <Prose className="text-muted-foreground">{power.runtimeNote}</Prose>}
      </Section>

      <Section title="Interfaces">
        <BulletList items={content.interfaces} />
      </Section>

      <Section title="Firmware notes">
        <BulletList items={content.firmware} />
      </Section>

      <Section title="Risks">
        <BulletList items={content.risks} />
      </Section>
    </div>
  );
}
