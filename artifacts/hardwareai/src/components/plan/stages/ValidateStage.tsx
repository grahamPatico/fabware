import type { ValidateAlternative, ValidateContent } from "../../../../convex/lib/journey";
import { formatDate, formatUsd, UNKNOWN } from "../planLogic";
import { BulletList, Empty, ExternalText, Fact, FactGrid, LABEL, Notice, Prose, Section, Tag } from "../parts";

const KIND_LABEL: Record<ValidateAlternative["kind"], string> = {
  direct: "Direct",
  indirect: "Indirect",
  diy: "DIY",
};

export function ValidateStage({
  content,
  generatedAt,
}: {
  content: ValidateContent;
  generatedAt: number | null;
}) {
  return (
    <div className="space-y-8">
      {content.researched ? (
        <Notice tone="info">Based on a web search on {formatDate(generatedAt)}.</Notice>
      ) : (
        <Notice tone="warn">
          Written from the model's memory, not checked against the web. Treat names and prices as leads to verify.
        </Notice>
      )}

      <FactGrid>
        <Fact label="Customer">{content.customer}</Fact>
        <Fact label="Problem">{content.problemStatement}</Fact>
      </FactGrid>

      <Section title="What people use today">
        {content.alternatives.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-3">
            {content.alternatives.map((alt, i) => (
              <li key={i} className="rounded border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words font-bold">{alt.name}</span>
                  <Tag>{KIND_LABEL[alt.kind]}</Tag>
                </div>
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{alt.note}</p>
                {alt.url && (
                  <p className="mt-2 text-xs">
                    <ExternalText href={alt.url}>Open the page</ExternalText>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What makes this different">
        <BulletList items={content.differentiators} />
      </Section>

      <Section title="Pricing">
        <FactGrid>
          <Fact label="Target price">{formatUsd(content.pricing.targetPriceUsd)}</Fact>
          <Fact label="Target cost to make">{formatUsd(content.pricing.targetCostUsd)}</Fact>
        </FactGrid>
        <Prose className="text-muted-foreground">{content.pricing.reasoning}</Prose>
      </Section>

      <Section title="Cheap tests to run first">
        {content.experiments.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {content.experiments.map((exp, i) => (
              <div key={i} className="flex min-w-0 flex-col rounded border border-border bg-card p-4">
                <p className="break-words font-bold">{exp.name}</p>
                <p className={`${LABEL} mt-3`}>How</p>
                <p className="mt-1 break-words text-sm leading-relaxed">{exp.how}</p>
                <p className={`${LABEL} mt-3`}>Success looks like</p>
                <p className="mt-1 break-words text-sm leading-relaxed">{exp.successSignal}</p>
                <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-4 font-mono text-xs text-muted-foreground">
                  <span>Cost: {formatUsd(exp.costUsd)}</span>
                  <span>Time: {exp.days === null ? UNKNOWN : `${exp.days} ${exp.days === 1 ? "day" : "days"}`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Risks">
        <BulletList items={content.risks} />
      </Section>

      <Section title="Go ahead if">
        <BulletList items={content.goSignals} />
      </Section>

      <Section title="Sources">
        {content.sources.length === 0 ? (
          <Empty>No pages were read for this.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {content.sources.map((source, i) => (
              <li key={i} className="min-w-0">
                <ExternalText href={source.url}>{source.title || source.url}</ExternalText>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
