import { Wrench, Box, ShoppingCart } from "lucide-react";

type PartKind = "sheet_metal" | "printed" | "purchased";

const KIND_ICON: Record<PartKind, typeof Wrench> = {
  sheet_metal: Wrench,
  printed: Box,
  purchased: ShoppingCart,
};

const KIND_LABEL: Record<PartKind, string> = {
  sheet_metal: "Sheet metal",
  printed: "3D printed",
  purchased: "Purchased",
};

const KIND_COLOR: Record<PartKind, string> = {
  sheet_metal: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  printed: "text-purple-300 border-purple-500/30 bg-purple-500/10",
  purchased: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

export function PartKindBadge({ kind }: { kind?: string | null }) {
  const k: PartKind = kind === "printed" || kind === "purchased" ? kind : "sheet_metal";
  const Icon = KIND_ICON[k];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase tracking-wider ${KIND_COLOR[k]}`}
      title={KIND_LABEL[k]}
    >
      <Icon className="w-2.5 h-2.5" />
      {KIND_LABEL[k]}
    </span>
  );
}
