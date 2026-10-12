// Small building blocks shared by the plan page and its stage components.

import React from "react";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "./planLogic";

export const LABEL = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn(LABEL, "border-b border-border pb-2", className)}>{children}</h3>;
}

/** A labelled block of stage content. Renders nothing when it has no children. */
export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("break-words text-sm leading-relaxed", className)}>{children}</p>;
}

export function Empty({ children = "Nothing listed." }: { children?: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function BulletList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function NumberedList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <StepNumber n={i + 1} />
          <p className="min-w-0 break-words text-sm leading-relaxed">{item}</p>
        </li>
      ))}
    </ol>
  );
}

export function StepNumber({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-card font-mono text-xs text-primary">
      {n}
    </span>
  );
}

/** One cell of a spec grid: a small label over its value. */
export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded border border-border bg-card p-3", className)}>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1 break-words text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

export function FactGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>{children}</dl>;
}

type NoticeTone = "info" | "warn" | "good";

const NOTICE_TONE: Record<NoticeTone, string> = {
  info: "border-border bg-card text-muted-foreground",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: NoticeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={cn("flex gap-3 rounded-md border p-3 text-sm leading-relaxed", NOTICE_TONE[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** An outline button that opens `href` in a new tab. Renders nothing for a missing or non-http link. */
export function ExternalButton({
  href,
  children,
  className,
  variant = "outline",
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const url = safeHttpUrl(href);
  if (!url) return null;
  return (
    <Button asChild variant={variant} size="sm" className={cn("h-auto max-w-full gap-2 whitespace-normal py-1.5 text-left", className)}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <span className="min-w-0 break-words">{children}</span>
        <ExternalLink />
      </a>
    </Button>
  );
}

/** An inline text link that opens in a new tab. Renders the text alone for a missing or non-http link. */
export function ExternalText({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  const url = safeHttpUrl(href);
  if (!url) return <>{children}</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 break-words text-primary underline-offset-4 hover:underline"
    >
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Two or more joined buttons where exactly one is on. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  className,
}: {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-md border border-border bg-background p-1", className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              if (!on) onChange(option.value);
            }}
            className={cn(
              "min-h-8 flex-1 whitespace-nowrap rounded px-3 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
