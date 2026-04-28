import React, { useState } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { ExternalLink, Plus, Trash2, Package, FileSpreadsheet, Archive, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type HardwareRef = { mcmasterPartNumber: string; quantity: number; role?: string };

function BomDownloadButton({ projectId }: { projectId: Id<"projects"> }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const onDownload = async () => {
    setBusy(true);
    try {
      const result = await convex.query(api.bom.projectCsv, { projectId });
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onDownload}
      disabled={busy}
      className="font-mono uppercase tracking-wider text-[10px] gap-1 h-7"
      title="Download project Bill of Materials as CSV"
    >
      <FileSpreadsheet className="w-3 h-3" />
      BOM
    </Button>
  );
}

function ObjDownloadButton({ projectId }: { projectId: Id<"projects"> }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const onDownload = async () => {
    setBusy(true);
    try {
      const result = await convex.query(api.obj.projectObj, { projectId });
      const blob = new Blob([result.obj], { type: "model/obj" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onDownload}
      disabled={busy}
      className="font-mono uppercase tracking-wider text-[10px] gap-1 h-7"
      title="Download 3D assembly as OBJ — viewable in Preview, MeshLab, Blender, SolidWorks"
    >
      <Box className="w-3 h-3" />
      OBJ
    </Button>
  );
}

function BundleDownloadButton({ projectId }: { projectId: Id<"projects"> }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const onDownload = async () => {
    setBusy(true);
    try {
      const result = await convex.query(api.bundle.projectZip, { projectId });
      if (!result) return;
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      onClick={onDownload}
      disabled={busy}
      className="font-mono uppercase tracking-wider text-[10px] gap-1 h-7"
      title="Download SCS-ready zip bundle (cuts/*.dxf + drawings/*.pdf + bom.csv + README.md)"
    >
      <Archive className="w-3 h-3" />
      SCS bundle
    </Button>
  );
}

function aggregateInterfaceHardware(
  interfaces: Array<{ hardwareRefs?: HardwareRef[] | null }> | undefined,
): Array<{ partNumber: string; quantity: number; roles: Set<string> }> {
  if (!interfaces) return [];
  const map = new Map<string, { partNumber: string; quantity: number; roles: Set<string> }>();
  for (const iface of interfaces) {
    for (const ref of iface.hardwareRefs ?? []) {
      const existing = map.get(ref.mcmasterPartNumber);
      if (existing) {
        existing.quantity += ref.quantity;
        if (ref.role) existing.roles.add(ref.role);
      } else {
        map.set(ref.mcmasterPartNumber, {
          partNumber: ref.mcmasterPartNumber,
          quantity: ref.quantity,
          roles: new Set(ref.role ? [ref.role] : []),
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}

export default function AssemblyPartsPanel({ projectId }: { projectId: Id<"projects"> }) {
  const parts = useQuery(api.assemblyParts.list, projectId ? { projectId } : "skip");
  const allParts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const purchasedParts = (allParts ?? []).filter(p => (p.kind ?? "sheet_metal") === "purchased");
  const interfaceHardware = aggregateInterfaceHardware(interfaces);
  const createPart = useMutation(api.assemblyParts.create);
  const deletePart = useMutation(api.assemblyParts.remove);

  const [partNumber, setPartNumber] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [suggestText, setSuggestText] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  const matches = useQuery(
    api.assemblyParts.mcmasterSuggest,
    suggestText.length >= 2 ? { query: suggestText } : "skip",
  );

  const isLoading = parts === undefined;

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partNumber.trim() || creating) return;
    setCreating(true);
    setAddError(null);
    try {
      await createPart({
        projectId,
        mcmasterPartNumber: partNumber.trim(),
        quantity,
      });
      setPartNumber("");
      setQuantity(1);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // Convex errors are often verbose — extract the relevant line
      const cleaned = msg.split("\n").find((l: string) => l.trim().length > 0) ?? msg;
      setAddError(cleaned.slice(0, 200));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border-t border-border bg-card/50 p-4 flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Package className="w-4 h-4" />
          <span className="font-mono uppercase tracking-wider text-xs font-bold">
            Assembly · McMaster
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BomDownloadButton projectId={projectId} />
          <ObjDownloadButton projectId={projectId} />
          <BundleDownloadButton projectId={projectId} />
          <Badge variant="outline" className="font-mono text-[10px]">
            {(parts ?? []).length + interfaceHardware.length + purchasedParts.length} item{(parts ?? []).length + interfaceHardware.length + purchasedParts.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          value={suggestText}
          onChange={(e) => setSuggestText(e.target.value)}
          placeholder="Search (e.g. '1/4-20 cap screw')"
          className="font-mono text-xs bg-background"
        />
        {matches && matches.matches.length > 0 && (
          <div className="border border-border rounded-md divide-y divide-border/50 max-h-40 overflow-y-auto">
            {matches.matches.map((m) => (
              <button
                key={m.partNumber}
                type="button"
                onClick={() => {
                  setPartNumber(m.partNumber);
                  setSuggestText("");
                }}
                className="w-full text-left p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-primary">{m.partNumber}</span>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    {m.category}
                  </span>
                </div>
                <div className="text-xs text-foreground truncate">{m.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onAdd} className="flex gap-2 items-end">
        <div className="flex-1 flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase text-muted-foreground">
            McMaster part #
          </label>
          <Input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
            placeholder="91251A540"
            className="font-mono text-xs bg-background"
          />
        </div>
        <div className="w-20 flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase text-muted-foreground">Qty</label>
          <Input
            type="number"
            min={1}
            max={10000}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="font-mono text-xs bg-background"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={creating || !partNumber.trim()}
          className="font-mono uppercase tracking-wider text-[10px] gap-1"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </form>
      {addError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-2 font-mono text-[11px] text-destructive">
          {addError}
        </div>
      )}

      <div className="flex flex-col gap-1 min-h-0 overflow-y-auto">
        {isLoading && <div className="text-xs text-muted-foreground font-mono">Loading…</div>}
        {!isLoading && (parts ?? []).length === 0 && interfaceHardware.length === 0 && (
          <div className="text-xs text-muted-foreground font-mono italic py-2">
            No assembly parts yet. Search above, or ask the chat: "add four 1/4-20 cap screws for the mounting holes."
          </div>
        )}
        {interfaceHardware.length > 0 && (
          <div className="mb-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Required hardware (from interfaces)
            </div>
            {interfaceHardware.map((h) => (
              <a
                key={h.partNumber}
                href={`https://www.mcmaster.com/${h.partNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase()}/`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Badge variant="secondary" className="font-mono text-[10px] shrink-0 w-10 justify-center">
                  ×{h.quantity}
                </Badge>
                <span className="font-mono text-xs text-primary flex items-center gap-1 shrink-0">
                  {h.partNumber}
                  <ExternalLink className="w-3 h-3" />
                </span>
                {h.roles.size > 0 && (
                  <span className="font-mono text-[10px] uppercase text-muted-foreground truncate">
                    {Array.from(h.roles).join(", ")}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
        {(parts ?? []).map((p) => (
          <div
            key={p._id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group"
          >
            <Badge variant="secondary" className="font-mono text-[10px] shrink-0 w-10 justify-center">
              ×{p.quantity}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <a
                  href={p.mcmasterProductUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                  title="Open on mcmaster.com"
                >
                  {p.mcmasterPartNumber}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="font-mono text-[10px] uppercase text-muted-foreground shrink-0">
                  {p.category}
                </span>
              </div>
              <div className="text-xs text-foreground truncate">{p.name}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => deletePart({ partId: p._id as Id<"assemblyParts"> })}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      {purchasedParts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Purchased parts (in assembly)
          </div>
          <div className="flex flex-col gap-1">
            {purchasedParts.map(p => (
              <a
                key={p._id}
                href={`https://www.mcmaster.com/${(p.purchasedPartNumber ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}/`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] flex items-center gap-2 hover:text-primary transition-colors"
              >
                <Badge variant="secondary" className="font-mono text-[10px] w-10 justify-center">
                  ×{p.purchasedQuantity ?? 1}
                </Badge>
                <span className="text-primary">{p.purchasedPartNumber}</span>
                <span className="truncate text-muted-foreground">{p.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
