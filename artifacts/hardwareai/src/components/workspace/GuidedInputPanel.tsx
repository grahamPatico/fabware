import React, { useState } from "react";
import { useSendMessage, getGetProjectMessagesQueryKey, getGetPartSpecQueryKey, getGetValidationQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PART_TYPES = ["bracket", "plate", "enclosure", "angle", "channel", "tab", "gusset"];
const MATERIALS = [
  "Mild Steel (CRS)",
  "Galvanized Steel",
  "Stainless Steel 304",
  "Stainless Steel 316",
  "Aluminum 5052",
  "Aluminum 6061",
  "Copper",
  "Brass",
];
const THICKNESSES = ["0.048\"", "0.060\"", "0.075\"", "0.090\"", "0.105\"", "0.120\"", "0.135\"", "0.187\""];
const COLORS = ["None", "Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Gray", "Silver"];

export default function GuidedInputPanel({ projectId, disabled = false }: { projectId: number; disabled?: boolean }) {
  const qc = useQueryClient();
  const sendMessage = useSendMessage();
  const [partType, setPartType] = useState("bracket");
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [thickness, setThickness] = useState(THICKNESSES[2]);
  const [width, setWidth] = useState("4");
  const [height, setHeight] = useState("3");
  const [holes, setHoles] = useState("4");
  const [holeDia, setHoleDia] = useState("0.25");
  const [withBend, setWithBend] = useState(false);
  const [color, setColor] = useState("None");

  const handleApply = () => {
    const parts = [
      `${partType}`,
      `${material}`,
      `${thickness} thick`,
      `${width} inches wide by ${height} inches tall`,
    ];
    if (parseInt(holes, 10) > 0) parts.push(`${holes} mounting holes ${holeDia} inch diameter`);
    if (withBend) parts.push("with a 90 degree bend");
    if (color !== "None") parts.push(`powder coat ${color}`);

    const content = parts.join(", ");
    sendMessage.mutate(
      { id: projectId, data: { content } },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getGetProjectMessagesQueryKey(projectId) });
          if (res.partUpdated) {
            qc.invalidateQueries({ queryKey: getGetPartSpecQueryKey(projectId) });
            qc.invalidateQueries({ queryKey: getGetValidationQueryKey(projectId) });
          }
        },
      },
    );
  };

  return (
    <div className="border-t border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground font-mono">
        <Sparkles className="w-3 h-3" /> Guided Spec
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-xs">
        <Field label="Part">
          <select value={partType} onChange={(e) => setPartType(e.target.value)} className="select">
            {PART_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Material">
          <select value={material} onChange={(e) => setMaterial(e.target.value)} className="select">
            {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Thickness">
          <select value={thickness} onChange={(e) => setThickness(e.target.value)} className="select">
            {THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Finish">
          <select value={color} onChange={(e) => setColor(e.target.value)} className="select">
            {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Width (in)">
          <input value={width} onChange={(e) => setWidth(e.target.value)} className="select" inputMode="decimal" />
        </Field>
        <Field label="Height (in)">
          <input value={height} onChange={(e) => setHeight(e.target.value)} className="select" inputMode="decimal" />
        </Field>
        <Field label="Holes">
          <input value={holes} onChange={(e) => setHoles(e.target.value)} className="select" inputMode="numeric" />
        </Field>
        <Field label="Hole Ø (in)">
          <input value={holeDia} onChange={(e) => setHoleDia(e.target.value)} className="select" inputMode="decimal" />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={withBend} onChange={(e) => setWithBend(e.target.checked)} />
          Add 90° bend
        </label>
      </div>
      <Button
        onClick={handleApply}
        disabled={sendMessage.isPending}
        size="sm"
        className="w-full font-mono text-xs uppercase tracking-wider"
      >
        {sendMessage.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
        Build From Spec
      </Button>
      <style>{`
        .select {
          width: 100%;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          padding: 4px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}
