import React, { useState, useRef, useEffect } from "react";
import {
  useGetProjectMessages,
  useSendMessage,
  getGetProjectMessagesQueryKey,
  getGetPartSpecQueryKey,
  getGetValidationQueryKey,
  getListRevisionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Terminal, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

interface ChatPanelProps {
  projectId: number;
  disabled?: boolean;
}

export default function ChatPanel({ projectId, disabled = false }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const { data: messages = [], isLoading } = useGetProjectMessages(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectMessagesQueryKey(projectId) },
  });
  const sendMessage = useSendMessage();

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMessage.isPending]);

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

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (disabled) return;
    if ((!input.trim() && !pendingImage) || sendMessage.isPending) return;

    const content = input.trim() || (pendingImage ? "Use this reference image to design the part." : "");
    const image = pendingImage;
    setInput("");
    setPendingImage(null);

    sendMessage.mutate(
      {
        id: projectId,
        data: {
          content,
          imageData: image?.data ?? null,
          imageMediaType: image?.mediaType ?? null,
        },
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetProjectMessagesQueryKey(projectId) });
          if (res.partUpdated) {
            queryClient.invalidateQueries({ queryKey: getGetPartSpecQueryKey(projectId) });
            queryClient.invalidateQueries({ queryKey: getGetValidationQueryKey(projectId) });
            queryClient.invalidateQueries({ queryKey: getListRevisionsQueryKey(projectId) });
          }
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card shrink-0">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Terminal className="w-3 h-3" /> Command Input
        </h2>
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
          messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] font-mono text-muted-foreground uppercase mb-1 px-1">
                {msg.role === 'user' ? 'User' : 'System'}
              </span>
              <div
                className={`max-w-[85%] rounded p-3 font-mono text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary/10 border border-primary/20 text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
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
            </div>
          ))
        )}

        {sendMessage.isPending && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-mono text-muted-foreground uppercase mb-1 px-1">System</span>
            <div className="bg-card border border-border rounded p-3 font-mono text-sm flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Generating design...
            </div>
          </div>
        )}
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
            <Button
              size="icon"
              variant="ghost"
              type="button"
              className="h-6 w-6"
              onClick={() => setPendingImage(null)}
            >
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
            disabled={disabled || (!input.trim() && !pendingImage) || sendMessage.isPending}
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
