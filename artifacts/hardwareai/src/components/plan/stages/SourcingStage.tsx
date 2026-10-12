import React from "react";
import { BadgeCheck, Box, ChevronDown, Search } from "lucide-react";
import type { SourcingContent, SourcingItem } from "../../../../convex/lib/journey";
import { getSupplier } from "../../../../convex/lib/suppliers";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  formatCatalogDate,
  formatUsd,
  groupSourcingLines,
  safeHttpUrl,
  sourcingLineUrl,
  sourcingUnitCost,
  supplierName,
  suppliersInLines,
} from "../planLogic";
import { BulletList, Empty, ExternalButton, ExternalText, LABEL, Section } from "../parts";

const GlbBoxViewer = React.lazy(() => import("../GlbBoxViewer"));

function SourcingLine({ item }: { item: SourcingItem }) {
  const [showBox, setShowBox] = React.useState(false);
  const supplier = supplierName(item.supplierId);
  const url = sourcingLineUrl(item);
  const live = item.verified ? item.live : null;
  const glbUrl = safeHttpUrl(live?.modelGlbUrl);

  return (
    <li className="min-w-0 rounded border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="break-words font-bold leading-snug">{item.need}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {supplier}
            {item.partNumber && !live ? ` · ${item.partNumber}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-x-4 font-mono text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
          <span>Qty {item.qty}</span>
          <span>
            {formatUsd(sourcingUnitCost(item))}
            {sourcingUnitCost(item) !== null ? " each" : " cost"}
          </span>
        </div>
      </div>

      <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.why}</p>

      {live ? (
        <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
            <span>From the live catalog</span>
            <span className="text-emerald-300/70">{formatCatalogDate(live.asOf)}</span>
          </p>
          <p className="mt-2 break-words text-sm">
            <span className="font-bold">{live.productName}</span>{" "}
            <span className="font-mono text-xs text-muted-foreground">{live.partNumber}</span>
          </p>
          {live.fitSummary && <p className="mt-1 break-words text-sm leading-relaxed">{live.fitSummary}</p>}
          {live.purchaseNote && (
            <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">{live.purchaseNote}</p>
          )}
        </div>
      ) : getSupplier(item.supplierId)?.cadPolicy === "user_geometry" ? null : (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Suggested search. Check the part before buying.</span>
        </p>
      )}

      {(url || glbUrl) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ExternalButton href={url}>Open at {supplier}</ExternalButton>
          {glbUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showBox}
              onClick={() => setShowBox((open) => !open)}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Box />
              {showBox ? "Hide 3D box" : "View 3D box"}
            </Button>
          )}
        </div>
      )}

      {glbUrl && showBox && (
        <figure className="mt-3">
          <div className="h-56 w-full overflow-hidden rounded border border-border bg-[#0a0f18] sm:h-64">
            <React.Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <Spinner className="text-muted-foreground" />
                </div>
              }
            >
              <GlbBoxViewer url={glbUrl} />
            </React.Suspense>
          </div>
          <figcaption className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Simplified box from published dimensions. Get the official CAD from {supplier}.
          </figcaption>
        </figure>
      )}
    </li>
  );
}

export function SourcingStage({ content }: { content: SourcingContent }) {
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const groups = groupSourcingLines(content.items);
  const suppliers = suppliersInLines(content.items);

  return (
    <div className="space-y-8">
      {groups.length === 0 ? (
        <Empty>No lines yet.</Empty>
      ) : (
        groups.map((group) => (
          <Section key={group.approach} title={group.heading}>
            <ul className="space-y-3">
              {group.items.map((item, i) => (
                <SourcingLine key={`${group.approach}-${i}`} item={item} />
              ))}
            </ul>
          </Section>
        ))
      )}

      {content.notes.length > 0 && (
        <Section title="Notes">
          <BulletList items={content.notes} />
        </Section>
      )}

      {suppliers.length > 0 && (
        <Collapsible open={policyOpen} onOpenChange={setPolicyOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 h-auto gap-1.5 whitespace-normal py-1.5 text-left font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("transition-transform", policyOpen ? "rotate-0" : "-rotate-90")} />
              How Fabware uses supplier data
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-3 space-y-4 rounded-md border border-border/60 bg-background/40 p-4">
              {suppliers.map((supplier) => (
                <li key={supplier.id} className="min-w-0">
                  <p className={LABEL}>{supplier.name}</p>
                  <p className="mt-1 break-words text-sm leading-relaxed">{supplier.cadNote}</p>
                  {supplier.termsUrl && (
                    <p className="mt-1 text-xs">
                      <ExternalText href={supplier.termsUrl}>Read the terms</ExternalText>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
