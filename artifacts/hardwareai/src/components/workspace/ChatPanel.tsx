import React, { useEffect, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { Send, Terminal, Loader2, ImagePlus, X, Cpu, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
const LS_MODEL = "fabware.chat.model";
const LS_EFFORT = "fabware.chat.effort";

const PHASES = [
  { icon: "🔍", text: "Researching reference designs in McMaster, IKEA, Grainger, industrial catalogs..." },
  { icon: "📐", text: "Recalling typical dimensions, hinge orientations, vent patterns..." },
  { icon: "🧩", text: "Picking the closest archetype from the library..." },
  { icon: "⚙️", text: "Generating parts and interfaces..." },
  { icon: "🔩", text: "Sizing fasteners and clearance holes..." },
  { icon: "📏", text: "Validating manufacturability against Send Cut Send rules..." },
  { icon: "🔎", text: "Checking for part intersections..." },
  { icon: "🪛", text: "Tightening geometry..." },
];

function SendingIndicator() {
  const [start] = React.useState(() => Date.now());
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1100);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.floor((Date.now() - start) / 1000);
  const phase = PHASES[tick % PHASES.length];
  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] font-mono text-muted-foreground uppercase mb-1 px-1">System</span>
      <div className="bg-card border border-primary/30 rounded p-3 font-mono text-sm flex items-start gap-3 text-foreground/90 max-w-[85%] shadow-lg shadow-primary/5">
        <Loader2 className="w-4 h-4 animate-spin text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-base leading-tight">{phase.icon}</span>
            <span className="text-foreground/90">{phase.text}</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {elapsed}s · phase {(tick % PHASES.length) + 1}/{PHASES.length}
          </div>
        </div>
      </div>
    </div>
  );
}

// Detect numbered options the agent presented (e.g., "1. **Thinner washer** I can do…").
// Returns at least 2 options or none — we don't want to turn arbitrary "step 1, 2, 3"
// instructions into pickable buttons.
function parseOptions(text: string): Array<{ n: number; label: string }> {
  const found: Array<{ n: number; label: string }> = [];
  const re = /^\s*(\d+)\.\s+(?:\*\*([^*]+)\*\*|(\S[^\n]{0,80}))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const label = (m[2] ?? m[3] ?? "").trim();
    if (label && n >= 1 && n <= 9) found.push({ n, label });
  }
  return found.length >= 2 ? found : [];
}

interface ChatPanelProps {
  projectId: Id<"projects">;
  focusedPartRole?: string | null;
  disabled?: boolean;
}

export default function ChatPanel({ projectId, focusedPartRole, disabled = false }: ChatPanelProps) {
  const messages = useQuery(api.messages.listForProject, projectId ? { projectId } : "skip");
  const sendMessage = useAction(api.projectChat.send);

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState<string>(() => localStorage.getItem(LS_MODEL) ?? "claude-opus-4-7");
  const [effort, setEffort] = useState<string>(() => localStorage.getItem(LS_EFFORT) ?? "high");

  useEffect(() => localStorage.setItem(LS_MODEL, model), [model]);
  useEffect(() => localStorage.setItem(LS_EFFORT, effort), [effort]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const handlePickImage = () => fileInputRef.current?.click();

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [, base64] = dataUrl.split(",");
      setPendingImage({ data: base64, mediaType: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendContent = async (content: string, image?: { data: string; mediaType: string }) => {
    if (disabled || sending) return;
    const trimmed = content.trim();
    if (!trimmed && !image) return;
    setSending(true);
    try {
      await sendMessage({
        projectId,
        content: trimmed,
        imageData: image?.data,
        imageMediaType: image?.mediaType,
        model,
        effort,
        focusedRole: focusedPartRole ?? undefined,
      });
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !pendingImage) || sending) return;
    const content = input.trim() || (pendingImage ? "Use this reference image to design the part." : "");
    const image = pendingImage;
    setInput("");
    setPendingImage(null);
    await sendContent(content, image ?? undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = messages === undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border bg-card shrink-0 flex items-center gap-2 flex-wrap">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2 mr-auto">
          <Terminal className="w-3 h-3" /> Command Input
          {focusedPartRole && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] uppercase tracking-wider">
              Focused: {focusedPartRole}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-muted-foreground" />
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-7 text-[11px] font-mono w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-[11px] font-mono">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-muted-foreground" />
          <Select value={effort} onValueChange={setEffort}>
            <SelectTrigger className="h-7 text-[11px] font-mono w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORTS.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-[11px] font-mono">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Initializing comms...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 font-mono text-sm px-8 text-center space-y-4">
            <Terminal className="w-8 h-8 opacity-50" />
            <p>Describe the part you need to manufacture.</p>
            <p className="text-xs">e.g., "I need a steel mounting bracket with 4 holes for M4 screws."</p>
            <p className="text-xs opacity-70">You can also attach a reference photo or sketch.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const options = msg.role === "assistant" && isLast ? parseOptions(msg.content) : [];
            return (
              <div
                key={msg._id ?? idx}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] font-mono text-muted-foreground uppercase mb-1 px-1">
                  {msg.role === "user" ? "User" : msg.model ? msg.model.replace("claude-", "") : "System"}
                </span>
                <div
                  className={`max-w-[85%] rounded p-3 font-mono text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary/10 border border-primary/20 text-primary-foreground"
                      : "bg-card border border-border text-foreground"
                  }`}
                >
                  {msg.imageData && msg.imageMediaType && (
                    <img
                      src={`data:${msg.imageMediaType};base64,${msg.imageData}`}
                      alt="reference"
                      className="max-w-full max-h-48 mb-2 rounded border border-border"
                    />
                  )}
                  {msg.content}
                </div>
                {options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 max-w-[85%]">
                    {options.map(o => (
                      <Button
                        key={o.n}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled || sending}
                        onClick={() => sendContent(String(o.n))}
                        className="font-mono text-xs gap-2 border-primary/30 hover:bg-primary/10"
                        title={o.label}
                      >
                        <span className="font-bold text-primary">{o.n}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="truncate max-w-[260px]">{o.label}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {sending && <SendingIndicator />}
      </div>

      <div className="p-4 bg-card border-t border-border shrink-0 space-y-2">
        {disabled && (
          <div className="bg-primary/10 border border-primary/30 rounded p-2 font-mono text-[11px] text-primary uppercase tracking-widest">
            Previewing a past revision · restore it or return to current to continue editing
          </div>
        )}
        {pendingImage && (
          <div className="flex items-center gap-3 bg-background border border-border rounded p-2">
            <img src={pendingImage.preview} alt="staged" className="w-12 h-12 object-cover rounded" />
            <span className="text-xs font-mono text-muted-foreground flex-1">Reference image attached</span>
            <Button size="icon" variant="ghost" type="button" className="h-6 w-6" onClick={() => setPendingImage(null)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
        {imageError && <p className="text-xs font-mono text-destructive">{imageError}</p>}
        <form onSubmit={handleSend} className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Return to current revision to continue..." : "Specify part parameters..."}
            disabled={disabled}
            className="min-h-[80px] resize-none pr-20 pl-10 font-mono text-sm bg-background border-border focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
            autoFocus
          />
          <Button
            size="icon"
            type="button"
            variant="ghost"
            disabled={disabled}
            className="absolute bottom-2 left-2 h-8 w-8"
            onClick={handlePickImage}
            title="Attach reference image"
          >
            <ImagePlus className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            type="submit"
            disabled={disabled || (!input.trim() && !pendingImage) || sending}
            className="absolute bottom-2 right-2 h-8 w-8"
          >
            <Send className="w-4 h-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleImageSelected}
          />
        </form>
      </div>
    </div>
  );
}
