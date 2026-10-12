import type { BuildContent } from "../../../../convex/lib/journey";
import { formatUsd, supplierName } from "../planLogic";
import { BulletList, Empty, ExternalText, LABEL, Section, StepNumber } from "../parts";

export function BuildStage({ content }: { content: BuildContent }) {
  return (
    <div className="space-y-8">
      <Section title="Order list">
        {content.orderGroups.length === 0 ? (
          <Empty>Nothing to order yet. Finish the sourcing step first.</Empty>
        ) : (
          <div className="space-y-4">
            {content.orderGroups.map((group, gi) => (
              <div key={`${group.supplierId}-${gi}`} className="min-w-0 rounded border border-border bg-card">
                <p className="border-b border-border px-3 py-2 font-bold sm:px-4">{supplierName(group.supplierId)}</p>
                <ul>
                  {group.lines.map((line, li) => (
                    <li
                      key={li}
                      className="flex items-start justify-between gap-3 border-b border-border/60 px-3 py-2 text-sm sm:px-4"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">{line.qty} × </span>
                        <ExternalText href={line.url}>{line.need}</ExternalText>
                      </div>
                      <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatUsd(line.estUnitCostUsd)}
                        {line.estUnitCostUsd !== null ? " each" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs sm:px-4">
                  <span className="uppercase tracking-widest text-muted-foreground">Subtotal</span>
                  <span>{formatUsd(group.subtotalUsd)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded border border-primary/40 bg-primary/10 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <p className={LABEL}>Estimated total</p>
            <p className="mt-1 text-xs text-muted-foreground">Estimate from the lines with a known price</p>
          </div>
          <p className="text-xl font-bold tracking-tight">{formatUsd(content.estTotalUsd)}</p>
        </div>
      </Section>

      <Section title="Assembly">
        {content.steps.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-3">
            {content.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded border border-border bg-card p-3 sm:p-4">
                <StepNumber n={i + 1} />
                <div className="min-w-0">
                  <p className="break-words font-bold">{step.title}</p>
                  <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Tests">
        <BulletList items={content.tests} />
      </Section>

      <Section title="Next iteration">
        <BulletList items={content.nextIteration} />
      </Section>
    </div>
  );
}
