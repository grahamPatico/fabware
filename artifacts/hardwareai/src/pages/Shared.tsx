import { useParams, Link } from "wouter";
import { useQuery } from "convex/react";
import { Settings2, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import Workspace from "@/pages/Workspace";

export default function Shared() {
  const params = useParams();
  const slug = (params.slug as string | undefined) ?? "";
  const project = useQuery(api.projects.getBySlug, slug ? { slug } : "skip");

  if (project === undefined) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm uppercase tracking-widest">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading shared assembly…
        </div>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
        <h1 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
          Share link invalid or revoked
        </h1>
        <Link href="/" className="text-primary hover:underline font-mono text-xs uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Back to fabware
        </Link>
      </div>
    );
  }

  return (
    <Workspace
      projectId={project._id as Id<"projects">}
      readOnly
      shareLabel={project.name}
    />
  );
}
