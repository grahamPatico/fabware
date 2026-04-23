import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AssemblyPart {
  id: number;
  projectId: number;
  mcmasterPartNumber: string;
  name: string;
  category: string;
  quantity: number;
  notes: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface SuggestMatch {
  partNumber: string;
  name: string;
  category: string;
  description: string;
  url: string;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export default function AssemblyPartsPanel({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const queryKey = ["assembly-parts", projectId];

  const { data: parts = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => apiJson<AssemblyPart[]>(`/api/projects/${projectId}/assembly-parts`),
    enabled: !!projectId,
  });

  const [partNumber, setPartNumber] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [suggestText, setSuggestText] = React.useState("");
  const [matches, setMatches] = React.useState<SuggestMatch[]>([]);

  const createPart = useMutation({
    mutationFn: (body: { mcmasterPartNumber: string; quantity: number }) =>
      apiJson<AssemblyPart>(`/api/projects/${projectId}/assembly-parts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setPartNumber("");
      setQuantity(1);
    },
  });

  const deletePart = useMutation({
    mutationFn: (id: number) =>
      apiJson<{ ok: boolean }>(`/api/projects/${projectId}/assembly-parts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  React.useEffect(() => {
    if (suggestText.length < 2) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await apiJson<{ matches: SuggestMatch[] }>(
          `/api/assembly-parts/mcmaster-suggest?q=${encodeURIComponent(suggestText)}`,
        );
        setMatches(res.matches);
      } catch {
        setMatches([]);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [suggestText]);

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partNumber.trim()) return;
    createPart.mutate({ mcmasterPartNumber: partNumber.trim(), quantity });
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
        <Badge variant="outline" className="font-mono text-[10px]">
          {parts.length} item{parts.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {/* Search / suggest */}
      <div className="flex flex-col gap-2">
        <Input
          value={suggestText}
          onChange={(e) => setSuggestText(e.target.value)}
          placeholder="Search (e.g. '1/4-20 cap screw')"
          className="font-mono text-xs bg-background"
        />
        {matches.length > 0 && (
          <div className="border border-border rounded-md divide-y divide-border/50 max-h-40 overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m.partNumber}
                type="button"
                onClick={() => {
                  setPartNumber(m.partNumber);
                  setSuggestText("");
                  setMatches([]);
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

      {/* Add form */}
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
          disabled={createPart.isPending || !partNumber.trim()}
          className="font-mono uppercase tracking-wider text-[10px] gap-1"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </form>

      {/* List */}
      <div className="flex flex-col gap-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="text-xs text-muted-foreground font-mono">Loading…</div>
        )}
        {!isLoading && parts.length === 0 && (
          <div className="text-xs text-muted-foreground font-mono italic py-2">
            No assembly parts yet. Search above, or ask the chat: "add four 1/4-20 cap screws for
            the mounting holes."
          </div>
        )}
        {parts.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group"
          >
            <Badge variant="secondary" className="font-mono text-[10px] shrink-0 w-10 justify-center">
              ×{p.quantity}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <a
                  href={p.url}
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
              onClick={() => deletePart.mutate(p.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
