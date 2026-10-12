import type { IdeaContent } from "../../../../convex/lib/journey";
import { BulletList, Fact, FactGrid, NumberedList, Prose, Section } from "../parts";

export function IdeaStage({ content }: { content: IdeaContent }) {
  return (
    <div className="space-y-8">
      <p className="break-words text-lg font-bold leading-snug tracking-tight sm:text-xl">{content.oneLiner}</p>

      <FactGrid>
        <Fact label="The problem">{content.problem}</Fact>
        <Fact label="Who it's for">{content.whoItsFor}</Fact>
      </FactGrid>

      <Section title="How it works">
        <NumberedList items={content.howItWorks} />
      </Section>

      <Section title="Key features">
        <BulletList items={content.keyFeatures} />
      </Section>

      <Section title="Electronics">
        <Prose>
          <span className="font-bold">
            {content.needsElectronics ? "This needs electronics." : "No electronics needed."}
          </span>{" "}
          <span className="text-muted-foreground">{content.electronicsReason}</span>
        </Prose>
      </Section>

      <Section title="Open questions">
        <BulletList items={content.openQuestions} />
      </Section>
    </div>
  );
}
