import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { CheckCircle2, ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function Export() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const runForPart = useMutation(api.exportDxf.runForPart);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const downloadPart = async (partId: Id<"parts">) => {
    if (!projectId) return;
    setDownloadingId(partId);
    setErrors(prev => ({ ...prev, [partId]: "" }));
    try {
      const data = await runForPart({ projectId, partId });
      const blob = new Blob([data.dxfContent], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrors(prev => ({ ...prev, [partId]: "Download failed." }));
    } finally {
      setDownloadingId(null);
    }
  };

  const instructions = [
    "Download the DXF file for each part using the buttons below.",
    "Verify dimensions and features in a CAD viewer if necessary.",
    "Navigate to Send Cut Send's upload portal.",
    "Upload each DXF file.",
    "Select your material and thickness as specified.",
    "Add any bending or powder coating services if required.",
    "Proceed to checkout.",
  ];

  if (project === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }
  if (!project) return <div className="p-8 font-mono text-destructive">Project not found</div>;
  const shortId = projectId ? projectId.slice(-4).toUpperCase() : "????";

  const hasParts = parts && parts.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/project/${projectId}`}
            className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 text-sm uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </Link>
        </div>
        <div className="text-sm text-primary uppercase tracking-widest font-bold">
          Deployment Sequence
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-8 md:p-12">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold uppercase tracking-widest mb-2">
            Design Ready for Fabrication
          </h1>
          <p className="text-muted-foreground">
            PRJ-{shortId} : {project.name}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h2 className="text-xl uppercase tracking-widest border-b border-border pb-2">
              Artifacts
            </h2>

            {hasParts ? (
              <div className="space-y-3">
                {parts.map(p => (
                  <div key={p._id} className="flex items-center justify-between p-3 border border-border rounded bg-card">
                    <div>
                      <div className="font-bold">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.role} · {p.material ?? "—"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        onClick={() => downloadPart(p._id)}
                        disabled={downloadingId === p._id}
                        className="gap-2"
                        size="sm"
                      >
                        {downloadingId === p._id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        DXF
                      </Button>
                      {errors[p._id] && (
                        <p className="text-xs text-destructive">{errors[p._id]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-24 bg-background border-2 border-primary/30 rounded flex items-center justify-center shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[gradient_3s_linear_infinite]" />
                  <span className="text-primary font-bold text-xl">DXF</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  No parts found for this project. Generate parts in the studio first.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <h2 className="text-xl uppercase tracking-widest border-b border-border pb-2">
              Fabrication Protocol
            </h2>
            <div className="space-y-8">
              <div className="space-y-4">
                {instructions.map((step, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="w-6 h-6 rounded-full bg-card border border-primary text-primary flex items-center justify-center text-xs shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
              <div className="pt-6 border-t border-border">
                <a
                  href="https://sendcutsend.com/upload"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button
                    variant="outline"
                    className="w-full h-14 text-lg gap-3 uppercase tracking-wider border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    Initiate Upload <ExternalLink className="w-5 h-5" />
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
