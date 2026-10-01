import { memo, useMemo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { modelLabel } from "../../../../convex/lib/models";
import Markdown from "./Markdown";
import type { ReplyOption } from "./options";

type Message = Doc<"messages">;

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 px-1 font-mono text-[10px] uppercase text-muted-foreground">
      {children}
    </span>
  );
}

function AttachedImage({ msg, onLoad }: { msg: Message; onLoad?: () => void }) {
  const src = useMemo(
    () =>
      msg.imageData && msg.imageMediaType
        ? `data:${msg.imageMediaType};base64,${msg.imageData}`
        : null,
    [msg.imageData, msg.imageMediaType],
  );
  if (!src) return null;
  return (
    <img
      src={src}
      alt="Attached reference"
      onLoad={onLoad}
      className="mb-2 max-h-48 max-w-full rounded border border-border"
    />
  );
}

interface UserMessageProps {
  msg: Message;
  onImageLoad?: () => void;
}

export const UserMessage = memo(function UserMessage({ msg, onImageLoad }: UserMessageProps) {
  return (
    <div className="flex flex-col items-end">
      <Label>You</Label>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded border border-primary/20 bg-primary/10 p-3 font-mono text-sm text-primary-foreground">
        <AttachedImage msg={msg} onLoad={onImageLoad} />
        {msg.content}
      </div>
    </div>
  );
});

interface AssistantMessageProps {
  msg: Message;
  /** Quick replies parsed from a numbered list; empty hides them. */
  options: ReplyOption[];
  optionsDisabled: boolean;
  onPickOption: (n: number) => void;
  onImageLoad?: () => void;
}

export const AssistantMessage = memo(function AssistantMessage({
  msg,
  options,
  optionsDisabled,
  onPickOption,
  onImageLoad,
}: AssistantMessageProps) {
  return (
    <div className="flex flex-col items-start">
      <Label>{modelLabel(msg.model)}</Label>
      <div className="max-w-[92%] rounded border border-border bg-card p-3 font-mono text-sm text-foreground">
        <AttachedImage msg={msg} onLoad={onImageLoad} />
        <Markdown text={msg.content} />
      </div>
      {options.length > 0 && (
        <div className="mt-2 flex max-w-[92%] flex-wrap gap-2">
          {options.map((o) => (
            <Button
              key={o.n}
              type="button"
              size="sm"
              variant="outline"
              disabled={optionsDisabled}
              onClick={() => onPickOption(o.n)}
              className="max-w-full gap-2 border-primary/30 font-mono text-xs hover:bg-primary/10"
              title={o.label}
            >
              <span className="font-bold text-primary">{o.n}</span>
              <span className="text-muted-foreground">·</span>
              <span className="max-w-[260px] truncate">{o.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
});

interface ErrorMessageProps {
  msg: Message;
  /** Present only when a retry makes sense: last message, nothing running. */
  onRetry?: () => void;
  retryDisabled?: boolean;
}

export const ErrorMessage = memo(function ErrorMessage({
  msg,
  onRetry,
  retryDisabled = false,
}: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-start">
      <Label>{modelLabel(msg.model)}</Label>
      <div className="max-w-[92%] rounded border border-destructive/50 bg-destructive/10 p-3 font-mono text-sm text-foreground">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="min-w-0 whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retryDisabled}
            onClick={onRetry}
            className="mt-3 gap-2 font-mono text-xs uppercase tracking-widest"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
});
