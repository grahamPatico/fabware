import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Check, Link2, Power } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareDialog({ projectId, open, onOpenChange }: Props) {
  const project = useQuery(api.projects.get, open && projectId ? { projectId } : "skip");
  const enableShare = useMutation(api.projects.enableShare);
  const disableShare = useMutation(api.projects.disableShare);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);

  const slug = project?.shareSlug ?? null;
  const shareUrl = slug
    ? `${window.location.origin}/share/${slug}`
    : null;

  const handleEnable = async () => {
    if (working) return;
    setWorking(true);
    try {
      await enableShare({ projectId });
    } finally {
      setWorking(false);
    }
  };

  const handleDisable = async () => {
    if (working) return;
    setWorking(true);
    try {
      await disableShare({ projectId });
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked; user can select + copy manually.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono uppercase tracking-wider">
            <Link2 className="w-4 h-4" />
            Share read-only link
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view the assembly, parts, BOM, and download
            DXFs / PDFs / OBJ. They cannot edit, chat, or change scope.
          </p>
          {!shareUrl ? (
            <Button onClick={handleEnable} disabled={working} className="font-mono uppercase tracking-wider text-xs">
              <Link2 className="w-3.5 h-3.5 mr-2" />
              Generate share link
            </Button>
          ) : (
            <>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 font-mono text-xs"
                />
                <Button onClick={handleCopy} size="sm" variant="outline" className="font-mono uppercase tracking-wider text-[10px]">
                  {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button
                onClick={handleDisable}
                size="sm"
                variant="ghost"
                disabled={working}
                className="font-mono uppercase tracking-wider text-[10px] text-destructive hover:text-destructive"
              >
                <Power className="w-3.5 h-3.5 mr-2" />
                Revoke link
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
