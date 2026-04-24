import React from "react";
import { useQuery } from "convex/react";
import { Link } from "wouter";
import { Plus, Hammer, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "../../convex/_generated/api";
import { NewProjectWizard } from "./NewProjectWizard";

export default function Home() {
  const projects = useQuery(api.projects.list);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const isLoading = projects === undefined;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-slate-600 text-slate-100";
      case "in_progress":
        return "bg-blue-600 text-blue-100";
      case "ready_to_order":
        return "bg-green-600 text-green-100";
      case "ordered":
        return "bg-primary text-primary-foreground";
      default:
        return "bg-slate-600 text-slate-100";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center">
            <Settings2 className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">Fabware</h1>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2 font-mono uppercase tracking-wider text-xs">
          <Plus className="w-4 h-4" /> New Project
        </Button>
        <NewProjectWizard open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      </header>

      <main className="flex-1 p-6 md:p-12 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-mono uppercase tracking-widest text-muted-foreground">
            Recent Parts
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-40 animate-pulse bg-muted border-border" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/50">
            <Hammer className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-mono text-muted-foreground uppercase">
              No parts designed yet
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm mx-auto">
              Initialize a new project to start designing hardware using plain text.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project._id} href={`/project/${project._id}`}>
                <Card className="group cursor-pointer hover:border-primary transition-colors bg-card border-border h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="font-mono text-lg truncate pr-4">
                        {project.name}
                      </CardTitle>
                      <Badge
                        className={`${getStatusColor(project.status)} hover:${getStatusColor(project.status)} font-mono text-[10px] uppercase border-none`}
                      >
                        {project.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="text-sm text-muted-foreground font-mono">
                      {project.description ? (
                        <p className="line-clamp-2">{project.description}</p>
                      ) : (
                        <p className="opacity-50 italic">No description provided</p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-3 border-t border-border/50 text-xs text-muted-foreground font-mono justify-between">
                    <span>ID: {project._id.slice(-4)}</span>
                    <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
