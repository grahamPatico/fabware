import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useConvex } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type Rule = { id: string; label: string; status: "pass" | "warn" | "fail"; message: string };

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Where to buy a purchased part: its step.parts page, else mcmaster.com. */
function purchaseUrl(part: Doc<"parts">): string {
  const raw = (part.purchasedPartNumber ?? "").trim();
  if (part.stepPageUrl) return part.stepPageUrl;
  if (/^step\.parts:/i.test(raw)) return `https://www.step.parts/parts/${raw.slice("step.parts:".length)}`;
  return `https://www.mcmaster.com/${raw.toUpperCase().replace(/[^A-Z0-9]/g, "")}/`;
}

export default function Export() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const convex = useConvex();
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const validation = useQuery(api.validation.getAssemblyValidation, projectId ? { projectId } : "skip");
  const runForPart = useMutation(api.exportDxf.runForPart);
  const runForPrintedPart = useMutation(api.exportDxf.runForPrintedPart);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Run one download, tracking its spinner and surfacing any failure next to it. */
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      await fn();
    } catch {
      setErrors((prev) => ({ ...prev, [key]: "Download failed. Try again." }));
    } finally {
      setBusy(null);
    }
  };

  if (!projectId || project === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground font-mono">
        <p className="text-muted-foreground">Project not found.</p>
        <Link href="/studio">
          <Button variant="outline">Back to studio</Button>
        </Link>
      </div>
    );
  }
  if (project === undefined || parts === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  const made = parts.filter((p: Doc<"parts">) => (p.kind ?? "sheet_metal") !== "purchased");
  const bought = parts.filter((p: Doc<"parts">) => p.kind === "purchased");
  const rules: Rule[] = validation?.rules ?? [];
  const failing = rules.filter((r) => r.status === "fail");
  const warning = rules.filter((r) => r.status === "warn");
  const hasParts = parts.length > 0;

  const downloadPart = (part: Doc<"parts">) =>
    run(part._id, async () => {
      const printed = part.kind === "printed";
      const data: { dxfContent?: string; stlContent?: string; filename?: string } = printed
        ? await runForPrintedPart({ projectId, partId: part._id })
        : await runForPart({ projectId, partId: part._id });
      const ext = printed ? "stl" : "dxf";
      const content = data.stlContent ?? data.dxfContent ?? "";
      saveBlob(new Blob([content], { type: `application/${ext}` }), data.filename ?? `${part.role}.${ext}`);
    });

  const downloadBundle = () =>
    run("bundle", async () => {
      const result = await convex.query(api.bundle.projectZip, { projectId });
      if (!result) throw new Error("empty bundle");
      saveBlob(new Blob([base64ToBytes(result.base64)], { type: "application/zip" }), result.filename);
    });

  const downloadBom = () =>
    run("bom", async () => {
      const result = await convex.query(api.bom.projectCsv, { projectId });
      saveBlob(new Blob([result.csv], { type: "text/csv" }), result.filename);
    });

  const downloadObj = () =>
    run("obj", async () => {
      const result = await convex.query(api.obj.projectObj, { projectId });
      saveBlob(new Blob([result.obj], { type: "model/obj" }), result.filename);
    });

  const steps = [
    "Download the bundle, or the DXF for each part.",
    "Open SendCutSend and upload the DXF files.",
    "Pick the material and thickness listed next to each part.",
    "Add bending or powder coat where the part calls for it.",
    "Order the purchased hardware from the links in the Buy list.",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card px-4 md:px-6 py-4 flex items-center justify-between gap-4">
        <Link
          href={`/project/${projectId}`}
          className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 text-sm font-mono uppercase tracking-wider"
        >
          <ArrowLeft className="w-4 h-4" /> Back to project
        </Link>
        <div className="text-sm text-primary font-mono uppercase tracking-widest font-bold">Export</div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-10 space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {made.length} {made.length === 1 ? "part" : "parts"} to make · {bought.length} to buy
          </p>
        </div>

        {hasParts && validation !== undefined && (
          failing.length > 0 ? (
            <div role="alert" className="border border-destructive/40 bg-destructive/10 rounded-md p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2 min-w-0">
                <p className="font-semibold">
                  {failing.length} {failing.length === 1 ? "check is" : "checks are"} failing. Fix {failing.length === 1 ? "it" : "them"} before ordering.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {failing.slice(0, 4).map((r, i) => (
                    <li key={`${r.id}-${i}`}>
                      <span className="text-foreground">{r.label}:</span> {r.message}
                    </li>
                  ))}
                  {failing.length > 4 && <li>and {failing.length - 4} more</li>}
                </ul>
                <Link href={`/project/${projectId}`} className="text-sm text-primary hover:underline inline-block">
                  Open the project and ask the agent to fix {failing.length === 1 ? "it" : "them"}
                </Link>
              </div>
            </div>
          ) : (
            <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-md p-4 flex gap-3 items-start">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p>
                <span className="font-semibold">All manufacturing checks pass.</span>
                {warning.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}{warning.length} {warning.length === 1 ? "warning" : "warnings"} worth a look in the studio.
                  </span>
                )}
              </p>
            </div>
          )
        )}

        {!hasParts ? (
          <div className="border border-dashed border-border rounded-lg p-10 text-center space-y-4">
            <Package className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">This project has no parts yet. Describe what you want in the chat first.</p>
            <Link href={`/project/${projectId}`}>
              <Button variant="outline">Open the project</Button>
            </Link>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex flex-wrap gap-3">
                <Button onClick={downloadBundle} disabled={busy === "bundle"} className="gap-2">
                  {busy === "bundle" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download everything (.zip)
                </Button>
                <Button variant="outline" onClick={downloadBom} disabled={busy === "bom"} className="gap-2">
                  {busy === "bom" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Bill of materials (.csv)
                </Button>
                <Button variant="outline" onClick={downloadObj} disabled={busy === "obj"} className="gap-2">
                  {busy === "obj" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
                  3D model (.obj)
                </Button>
              </div>
              {(errors.bundle || errors.bom || errors.obj) && (
                <p className="text-sm text-destructive">{errors.bundle || errors.bom || errors.obj}</p>
              )}
            </section>

            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-8">
                {made.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                      Make
                    </h2>
                    {made.map((p: Doc<"parts">) => {
                      const printed = p.kind === "printed";
                      const spec = printed
                        ? [p.printedMaterial ?? "3D print"].join(" · ")
                        : [p.material, p.thickness ? `${p.thickness}"` : null].filter(Boolean).join(" · ");
                      return (
                        <div key={p._id} className="p-3 border border-border rounded bg-card">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold truncate" title={p.label}>{p.label}</div>
                              <div className="text-xs text-muted-foreground font-mono truncate">{spec || "No material set"}</div>
                            </div>
                            <Button
                              onClick={() => downloadPart(p)}
                              disabled={busy === p._id}
                              variant="outline"
                              size="sm"
                              className="gap-2 shrink-0"
                            >
                              {busy === p._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              {printed ? "STL" : "DXF"}
                            </Button>
                          </div>
                          {errors[p._id] && <p className="text-xs text-destructive mt-2">{errors[p._id]}</p>}
                        </div>
                      );
                    })}
                  </section>
                )}

                {bought.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                      Buy
                    </h2>
                    {bought.map((p: Doc<"parts">) => (
                      <div key={p._id} className="p-3 border border-border rounded bg-card flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate" title={p.label}>
                            {p.purchasedQuantity ? `${p.purchasedQuantity} × ` : ""}{p.label}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate">{p.purchasedPartNumber ?? ""}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.stepStepUrl && (
                            <a href={p.stepStepUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" className="gap-2" title="Download the catalog STEP file">
                                <Download className="w-4 h-4" /> STEP
                              </Button>
                            </a>
                          )}
                          <a href={purchaseUrl(p)} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-2">
                              View <ExternalLink className="w-4 h-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </div>

              <section className="space-y-5">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                  How to order
                </h2>
                <ol className="space-y-4">
                  {steps.map((step, idx) => (
                    <li key={idx} className="flex gap-4 items-start">
                      <span className="w-6 h-6 rounded-full bg-card border border-primary text-primary flex items-center justify-center text-xs font-mono shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
                <a href="https://sendcutsend.com/upload" target="_blank" rel="noopener noreferrer" className="block pt-2">
                  <Button
                    variant="outline"
                    className="w-full h-12 gap-3 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    Open SendCutSend upload <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
