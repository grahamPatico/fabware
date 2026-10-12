import type { RequirementsContent } from "../../../../convex/lib/journey";
import { formatEnvelope, formatUsd, tierLabel, UNKNOWN } from "../planLogic";
import { BulletList, Fact, FactGrid, Prose, Section } from "../parts";

export function RequirementsStage({ content }: { content: RequirementsContent }) {
  const env = content.environment;
  const place = env.location === "outdoor" ? "Outdoor" : "Indoor";
  return (
    <div className="space-y-8">
      <Prose>{content.summary}</Prose>

      <Section title="Targets">
        <FactGrid className="lg:grid-cols-3">
          <Fact label="Size (W × D × H)">
            {formatEnvelope(content.envelope)}
            {content.envelope.note && (
              <span className="mt-1 block text-xs text-muted-foreground">{content.envelope.note}</span>
            )}
          </Fact>
          <Fact label="Environment">
            {place}
            {env.waterproof ? ", waterproof" : ""}
            {env.notes && <span className="mt-1 block text-xs text-muted-foreground">{env.notes}</span>}
          </Fact>
          <Fact label="Power">{content.power || UNKNOWN}</Fact>
          <Fact label="Quantity">{content.quantity === null ? UNKNOWN : content.quantity.toLocaleString("en-US")}</Fact>
          <Fact label="Budget">{formatUsd(content.budgetUsd)}</Fact>
          <Fact label="Build tier">{tierLabel(content.tier)}</Fact>
        </FactGrid>
      </Section>

      <Section title="What it must do">
        <BulletList items={content.functional} />
      </Section>

      <Section title="Constraints">
        <BulletList items={content.constraints} />
      </Section>

      <Section title="Done when">
        <BulletList items={content.successCriteria} />
      </Section>
    </div>
  );
}
