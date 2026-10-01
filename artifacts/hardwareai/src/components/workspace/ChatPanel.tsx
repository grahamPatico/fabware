import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowDown, ImagePlus, Loader2, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { prepareImage, type PreparedImage } from "@/lib/image";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import ActivityBlock from "./chat/ActivityBlock";
import ChatHeader from "./chat/ChatHeader";
import EmptyState from "./chat/EmptyState";
import { AssistantMessage, ErrorMessage, UserMessage } from "./chat/Messages";
import RunStatus from "./chat/RunStatus";
import { parseOptions, type ReplyOption } from "./chat/options";
import { useChatPrefs } from "./chat/prefs";

type Message = Doc<"messages">;

// A Convex action is killed at 10 minutes, so a run still marked "running"
// after this long has nothing behind it. Mirrors `convex/agentRuns.ts`.
const STALE_RUN_MS = 11 * 60 * 1000;
/** How close to the bottom still counts as "following the conversation". */
const NEAR_BOTTOM_PX = 120;
const SEND_FAILED = "Couldn't send that. Check your connection and try again.";
const IMAGE_ONLY_PROMPT = "Use this reference image to design the part.";
const NO_OPTIONS: ReplyOption[] = [];

type ChatItem =
  | { type: "message"; key: string; msg: Message }
  | { type: "activity"; key: string; rows: Message[] };

/** Collapse each run of consecutive tool rows into a single activity item. */
function groupMessages(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const msg of messages) {
    if (msg.kind === "tool") {
      const last = items[items.length - 1];
      if (last && last.type === "activity") last.rows.push(msg);
      else items.push({ type: "activity", key: `activity-${msg._id}`, rows: [msg] });
    } else {
      items.push({ type: "message", key: msg._id, msg });
    }
  }
  return items;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ConvexError ? String(err.data) : fallback;
}

interface ChatPanelProps {
  projectId: Id<"projects">;
  focusedPartRole?: string | null;
  disabled?: boolean;
}

export default function ChatPanel({ projectId, focusedPartRole, disabled = false }: ChatPanelProps) {
  const messages = useQuery(api.messages.listForProject, { projectId });
  const project = useQuery(api.projects.get, { projectId });
  const startRun = useMutation(api.agentRuns.start);
  const cancelRun = useMutation(api.agentRuns.cancel);
  const { model, effort, setModel, setEffort } = useChatPrefs();

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PreparedImage | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stopPendingRunId, setStopPendingRunId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  // ── Run state: owned by the server, read reactively ─────────────────────
  const run = project?.agentRun;
  const isRunning = run?.status === "running" && Date.now() - run.startedAt < STALE_RUN_MS;
  const stopping =
    isRunning && (run?.cancelRequested === true || stopPendingRunId === run?.runId);

  // `isRunning` depends on the clock. Re-render once at the moment a run that
  // never reported back goes stale, so the composer unlocks on its own.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const runStatus = run?.status;
  const runStartedAt = run?.startedAt;
  useEffect(() => {
    if (runStatus !== "running" || runStartedAt === undefined) return;
    const remaining = runStartedAt + STALE_RUN_MS - Date.now();
    if (remaining <= 0) return;
    const id = window.setTimeout(rerender, remaining + 50);
    return () => window.clearTimeout(id);
  }, [runStatus, runStartedAt]);

  // ── Scrolling ───────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const seenCountRef = useRef(0);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) setShowJump(false);
  };

  const messageCount = messages?.length ?? 0;
  const lastMessage = messageCount > 0 ? messages![messageCount - 1] : undefined;
  const lastMessageId = lastMessage?._id;
  const messagesLoaded = messages !== undefined;

  useLayoutEffect(() => {
    if (!messagesLoaded) return;
    const grew = messageCount > seenCountRef.current;
    seenCountRef.current = messageCount;
    if (nearBottomRef.current) scrollToBottom();
    else if (grew) setShowJump(true);
  }, [messagesLoaded, messageCount, lastMessageId, isRunning, scrollToBottom]);

  // The viewport itself changes size too: the panel is dragged, the composer
  // grows, or the mobile Chat tab comes back from hidden. Stay pinned then.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) scrollToBottom();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  // Images change the list height after layout; keep the bottom pinned.
  const handleImageLoad = useCallback(() => {
    if (nearBottomRef.current) scrollToBottom();
  }, [scrollToBottom]);

  const jumpToLatest = () => {
    nearBottomRef.current = true;
    setShowJump(false);
    scrollToBottom(true);
  };

  // ── Sending ─────────────────────────────────────────────────────────────
  const sendingRef = useRef(false);

  const send = async (
    content: string,
    image?: { data: string; mediaType: string },
  ): Promise<boolean> => {
    if (disabled || isRunning || sendingRef.current) return false;
    const trimmed = content.trim();
    if (!trimmed && !image) return false;
    sendingRef.current = true;
    setSending(true);
    // The user's own message should always come into view.
    nearBottomRef.current = true;
    try {
      await startRun({
        projectId,
        content: trimmed,
        imageData: image?.data,
        imageMediaType: image?.mediaType,
        model,
        effort,
        focusedRole: focusedPartRole ?? undefined,
      });
      setSendError(null);
      return true;
    } catch (err) {
      setSendError(errorText(err, SEND_FAILED));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // Message rows are memoised; hand them callbacks whose identity never
  // changes but which always run the latest `send`.
  const sendRef = useRef(send);
  sendRef.current = send;
  const lastUserMessage = useMemo(() => {
    if (!messages) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i];
    }
    return undefined;
  }, [messages]);
  const lastUserRef = useRef(lastUserMessage);
  lastUserRef.current = lastUserMessage;

  const handlePickOption = useCallback((n: number) => {
    void sendRef.current(String(n));
  }, []);
  const handlePickStarter = useCallback((prompt: string) => {
    void sendRef.current(prompt);
  }, []);
  const handleRetry = useCallback(() => {
    const prev = lastUserRef.current;
    if (!prev) return;
    const image =
      prev.imageData && prev.imageMediaType
        ? { data: prev.imageData, mediaType: prev.imageMediaType }
        : undefined;
    void sendRef.current(prev.content, image);
  }, []);

  const canSubmit = !disabled && !isRunning && !sending && (input.trim() !== "" || pendingImage !== null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    const typed = input;
    const image = pendingImage;
    const content = typed.trim() || (image ? IMAGE_ONLY_PROMPT : "");
    setInput("");
    setPendingImage(null);
    const ok = await send(content, image ?? undefined);
    if (!ok) {
      // Put the draft back so nothing the user wrote is lost.
      setInput((current) => (current ? current : typed));
      setPendingImage((current) => current ?? image);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // Enter never inserts a newline (Shift+Enter does). While the agent is
    // working it does nothing, so the draft stays put for the next turn.
    e.preventDefault();
    if (!isRunning) void handleSubmit();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (sendError) setSendError(null);
  };

  const handleStop = async () => {
    if (!run || !isRunning || stopping) return;
    setStopPendingRunId(run.runId);
    try {
      await cancelRun({ projectId });
    } catch (err) {
      setStopPendingRunId(null);
      setSendError(errorText(err, "Couldn't stop that. Check your connection and try again."));
    }
  };

  // ── Images ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stageImage = async (file: File) => {
    setImageError(null);
    setImageBusy(true);
    try {
      setPendingImage(await prepareImage(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Couldn't read that image.");
    } finally {
      setImageBusy(false);
    }
  };

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void stageImage(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const data = e.clipboardData;
    // Some apps put both text and a rendered picture of it on the clipboard;
    // there the text is what the user meant to paste.
    if (!data || data.getData("text/plain")) return;
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      void stageImage(file);
      return;
    }
  };

  // ── Rendering ───────────────────────────────────────────────────────────
  const items = useMemo(() => (messages ? groupMessages(messages) : []), [messages]);

  const lastIsAssistantText =
    lastMessage !== undefined &&
    lastMessage.role === "assistant" &&
    (lastMessage.kind === undefined || lastMessage.kind === "text");
  const lastAssistantText = lastIsAssistantText ? lastMessage.content : null;
  const lastOptions = useMemo(
    () => (lastAssistantText !== null ? parseOptions(lastAssistantText) : NO_OPTIONS),
    [lastAssistantText],
  );
  const actionsBlocked = disabled || sending || isRunning;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        focusedPartRole={focusedPartRole}
        model={model}
        effort={effort}
        onModelChange={setModel}
        onEffortChange={setEffort}
      />

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto p-4">
          {!messagesLoaded ? (
            <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading chat
            </div>
          ) : messageCount === 0 && !isRunning ? (
            <EmptyState disabled={disabled || sending} onPick={handlePickStarter} />
          ) : (
            <div className="space-y-5">
              {items.map((item) => {
                if (item.type === "activity") {
                  return <ActivityBlock key={item.key} rows={item.rows} />;
                }
                const { msg } = item;
                const isLast = msg._id === lastMessageId;
                if (msg.role === "user") {
                  return <UserMessage key={item.key} msg={msg} onImageLoad={handleImageLoad} />;
                }
                if (msg.kind === "error") {
                  const canRetry = isLast && !isRunning && lastUserMessage !== undefined;
                  return (
                    <ErrorMessage
                      key={item.key}
                      msg={msg}
                      onRetry={canRetry ? handleRetry : undefined}
                      retryDisabled={disabled || sending}
                    />
                  );
                }
                return (
                  <AssistantMessage
                    key={item.key}
                    msg={msg}
                    options={isLast && !isRunning ? lastOptions : NO_OPTIONS}
                    optionsDisabled={actionsBlocked}
                    onPickOption={handlePickOption}
                    onImageLoad={handleImageLoad}
                  />
                );
              })}
              {isRunning && run && (
                <RunStatus startedAt={run.startedAt} step={run.step} toolCalls={run.toolCalls} />
              )}
            </div>
          )}
        </div>
        {showJump && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 gap-1.5 rounded-full px-3 font-mono text-[10px] uppercase tracking-widest shadow-lg"
          >
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            Jump to latest
          </Button>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-card p-3">
        {disabled && (
          <div className="rounded border border-primary/30 bg-primary/10 p-2 font-mono text-[11px] uppercase tracking-widest text-primary">
            Previewing a past revision · restore it or return to current to continue editing
          </div>
        )}
        {(pendingImage || imageBusy) && (
          <div className="flex items-center gap-3 rounded border border-border bg-background p-2">
            {pendingImage ? (
              <img src={pendingImage.preview} alt="Attached reference" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded border border-border">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {imageBusy ? "Preparing image" : "Reference image attached"}
            </span>
            {pendingImage && (
              <Button
                size="icon"
                variant="ghost"
                type="button"
                className="h-6 w-6"
                onClick={() => setPendingImage(null)}
                aria-label="Remove attached image"
                title="Remove attached image"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        {imageError && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {imageError}
          </p>
        )}
        {sendError && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {sendError}
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          className="rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-primary"
        >
          <Textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={disabled ? "Return to current revision to continue..." : "Describe a part or a change"}
            aria-label="Message"
            disabled={disabled}
            className="max-h-48 min-h-[72px] resize-none border-0 bg-transparent px-3 pb-1 pt-2.5 font-mono text-base shadow-none focus-visible:ring-0 disabled:opacity-50 md:text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <Button
              size="icon"
              type="button"
              variant="ghost"
              disabled={disabled || imageBusy}
              className="h-8 w-8"
              onClick={() => fileInputRef.current?.click()}
              title="Attach reference image"
              aria-label="Attach reference image"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <div className="ml-auto">
              {isRunning ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={stopping}
                  onClick={handleStop}
                  className="h-8 gap-2 px-2.5 font-mono text-[10px] uppercase tracking-widest [&_svg]:size-3"
                  title={stopping ? "Stopping" : "Stop the agent"}
                  aria-label={stopping ? "Stopping" : "Stop the agent"}
                >
                  <Square className="h-3 w-3 fill-current" />
                  {stopping ? "Stopping" : "Stop"}
                </Button>
              ) : (
                <Button
                  size="icon"
                  type="submit"
                  disabled={!canSubmit}
                  className="h-8 w-8"
                  title="Send"
                  aria-label="Send message"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleImageSelected}
          />
        </form>
      </div>
    </div>
  );
}
