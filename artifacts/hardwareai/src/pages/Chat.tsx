import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Send, Plus, Trash2, Cpu, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 (smartest)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fastest)" },
];

const EFFORTS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "X-High (Opus 4.7)" },
  { id: "max", label: "Max (Opus only)" },
];

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_EFFORT = "high";

function configMissing(): string | null {
  if (!import.meta.env.VITE_CONVEX_URL) {
    return "VITE_CONVEX_URL is not set. Run `npx convex dev` in artifacts/hardwareai/ to generate it, then restart the dev server.";
  }
  return null;
}

export default function ChatPage() {
  const missing = configMissing();
  if (missing) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background px-8">
        <div className="max-w-xl font-mono text-sm text-muted-foreground space-y-3">
          <p className="uppercase tracking-widest text-xs text-primary">Convex not configured</p>
          <p>{missing}</p>
        </div>
      </div>
    );
  }
  return <ChatInner />;
}

function ChatInner() {
  const threads = useQuery(api.threads.list);
  const createThread = useMutation(api.threads.create);
  const removeThread = useMutation(api.threads.remove);
  const updateSettings = useMutation(api.threads.updateSettings);
  const send = useAction(api.chat.send);

  const [activeId, setActiveId] = useState<Id<"threads"> | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<string>(DEFAULT_EFFORT);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messages = useQuery(
    api.messages.listForThread,
    activeId ? { threadId: activeId } : "skip",
  );

  const activeThread = useMemo(
    () => threads?.find((t) => t._id === activeId) ?? null,
    [threads, activeId],
  );

  useEffect(() => {
    if (activeThread) {
      setModel(activeThread.model);
      setEffort(activeThread.effort);
    }
  }, [activeThread]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const handleNewThread = async () => {
    const id = await createThread({
      title: "New conversation",
      model,
      effort,
    });
    setActiveId(id);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    setError(null);

    let threadId = activeId;
    if (!threadId) {
      threadId = await createThread({
        title: input.trim().slice(0, 60),
        model,
        effort,
      });
      setActiveId(threadId);
    } else if (activeThread && (activeThread.model !== model || activeThread.effort !== effort)) {
      await updateSettings({ threadId, model, effort });
    }

    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      await send({ threadId, content, model, effort });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen w-full flex bg-background text-foreground">
      <aside className="w-64 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <Button onClick={handleNewThread} size="sm" className="w-full gap-2">
            <Plus className="w-3.5 h-3.5" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!threads && (
            <div className="p-4 text-xs font-mono text-muted-foreground">Loading…</div>
          )}
          {threads && threads.length === 0 && (
            <div className="p-4 text-xs font-mono text-muted-foreground">No conversations yet</div>
          )}
          {threads?.map((t) => (
            <button
              key={t._id}
              onClick={() => setActiveId(t._id)}
              className={`w-full text-left p-3 border-b border-border/50 hover:bg-card transition-colors group ${
                t._id === activeId ? "bg-card" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono truncate">{t.title}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                    {t.model.replace("claude-", "")} · {t.effort}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this conversation?")) {
                      removeThread({ threadId: t._id });
                      if (t._id === activeId) setActiveId(null);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border p-3 flex items-center gap-3">
          <h1 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Fabware Chat
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8 text-xs font-mono w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger className="h-8 text-xs font-mono w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFORTS.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs font-mono">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5" ref={scrollRef}>
          {!activeId && (
            <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              Start a new chat or pick one from the sidebar.
            </div>
          )}
          {activeId && messages === undefined && (
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {activeId &&
            messages?.map((m) => (
              <div
                key={m._id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] font-mono text-muted-foreground uppercase mb-1 px-1">
                  {m.role === "user" ? "You" : m.model ? m.model.replace("claude-", "") : "Assistant"}
                </span>
                <div
                  className={`max-w-[80%] rounded p-3 font-mono text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-card border border-border"
                  }`}
                >
                  {m.content}
                </div>
                {m.usage && (
                  <span className="text-[10px] font-mono text-muted-foreground/60 mt-1 px-1">
                    in {m.usage.inputTokens} · out {m.usage.outputTokens}
                    {m.usage.cacheReadTokens ? ` · cache ${m.usage.cacheReadTokens}` : ""}
                  </span>
                )}
              </div>
            ))}
          {sending && (
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded p-3 font-mono text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-border relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Fabware…"
            className="min-h-[80px] resize-none pr-14 font-mono text-sm bg-background border-border focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
          />
          <Button
            size="icon"
            type="submit"
            disabled={!input.trim() || sending}
            className="absolute bottom-6 right-6 h-8 w-8"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </main>
    </div>
  );
}
