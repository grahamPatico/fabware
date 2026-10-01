import React from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Link } from "wouter";
import { Link2, Plus, Search, Settings2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  NewProjectComposer,
  type NewProjectComposerHandle,
} from "@/components/NewProjectComposer";
import { toast } from "@/hooks/use-toast";
import { consumeOwnerParam, deviceLink, getOwnerKey } from "@/lib/owner";
import { api } from "../../convex/_generated/api";

type ProjectRow = FunctionReturnType<typeof api.projects.list>[number];

// Matches the backend's stale-run cutoff: a run still marked "running" after
// this long has no live action behind it.
const RUN_FRESH_MS = 11 * 60 * 1000;
const SEARCH_THRESHOLD = 6;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a locale date. */
function formatUpdated(timestamp: number, now: number = Date.now()): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function partCountLabel(count: number): string {
  if (count <= 0) return "Empty";
  return count === 1 ? "1 part" : `${count} parts`;
}

function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
      return "bg-blue-600 text-blue-100";
    case "ready_to_order":
      return "bg-green-600 text-green-100";
    case "ordered":
      return "bg-primary text-primary-foreground";
    default:
      return "bg-slate-600 text-slate-100";
  }
}

function isDesigning(project: ProjectRow, now: number): boolean {
  const run = project.agentRun;
  return run?.status === "running" && now - run.startedAt < RUN_FRESH_MS;
}

export default function Home() {
  // The owner param has to be consumed before the key is first read, or a
  // shared link would list this browser's own projects instead.
  const [ownerKey] = React.useState(() => {
    consumeOwnerParam();
    return getOwnerKey();
  });

  const projects = useQuery(api.projects.list, { ownerKey });
  const removeProject = useMutation(api.projects.remove);

  const composerRef = React.useRef<NewProjectComposerHandle>(null);
  const [search, setSearch] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Keeps relative times and the "Designing" badge honest while the page sits open.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const showSearch = projects !== undefined && projects.length > SEARCH_THRESHOLD;
  const needle = showSearch ? search.trim().toLowerCase() : "";
  const visible = React.useMemo(() => {
    if (!projects) return [];
    if (!needle) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.description ?? "").toLowerCase().includes(needle),
    );
  }, [projects, needle]);

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await removeProject({ projectId: pendingDelete._id });
    } catch (err) {
      console.error("Project delete failed", err);
      toast({
        variant: "destructive",
        title: "Couldn't delete the project",
        description:
          err instanceof ConvexError
            ? String(err.data)
            : "Check your connection and try again.",
      });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const copyDeviceLink = async () => {
    const link = deviceLink();
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link copied. Open it on your other device to see these projects.",
      });
    } catch (err) {
      console.error("Clipboard write failed", err);
      toast({
        title: "Couldn't copy the link. Copy it from here:",
        description: <span className="select-all break-all font-mono text-xs">{link}</span>,
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center">
            <Settings2 className="w-5 h-5" />
          </span>
          <span className="text-xl font-bold tracking-tight uppercase">Fabware</span>
        </Link>
        <Button
          onClick={() => composerRef.current?.focus()}
          className="gap-2 font-mono uppercase tracking-wider text-xs shrink-0"
        >
          <Plus className="w-4 h-4" /> New project
        </Button>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-10">
        <NewProjectComposer ref={composerRef} className="mx-auto w-full max-w-3xl" />

        <section className="mt-10 md:mt-14" aria-labelledby="your-projects">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="your-projects"
              className="font-mono text-sm uppercase tracking-widest text-muted-foreground"
            >
              Your projects
            </h2>
            {showSearch && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects"
                  aria-label="Search projects"
                  className="bg-card pl-8 font-mono text-sm"
                />
              </div>
            )}
          </div>

          {projects === undefined ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
              aria-busy="true"
              aria-label="Loading projects"
            >
              {[0, 1, 2].map((i) => (
                <Card key={i} className="h-40 bg-card border-border p-6 flex flex-col">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-4/5" />
                  <Skeleton className="mt-auto h-3 w-1/3" />
                </Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">
              Nothing here yet. Your projects are saved to this browser.
            </p>
          ) : (
            <>
              {visible.length === 0 ? (
                <p className="font-mono text-sm text-muted-foreground">No matches</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {visible.map((project) => {
                    const designing = isDesigning(project, now);
                    return (
                      <div key={project._id} className="group relative min-w-0">
                        <Link
                          href={`/project/${project._id}`}
                          className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <Card className="h-full flex flex-col bg-card border-border transition-colors group-hover:border-primary">
                            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <CardTitle className="min-w-0 flex-1 truncate font-mono text-lg leading-tight">
                                  {project.name}
                                </CardTitle>
                                {designing ? (
                                  <Badge className="shrink-0 gap-1.5 border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-wider text-primary shadow-none">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    Designing
                                  </Badge>
                                ) : project.status !== "draft" ? (
                                  <Badge
                                    className={`${statusColor(project.status)} shrink-0 border-none font-mono text-[10px] uppercase`}
                                  >
                                    {project.status.replace(/_/g, " ")}
                                  </Badge>
                                ) : null}
                              </div>
                            </CardHeader>
                            <CardContent className="flex-1 px-4 sm:px-6 pb-4">
                              {project.description ? (
                                <p className="line-clamp-2 break-words font-mono text-sm text-muted-foreground">
                                  {project.description}
                                </p>
                              ) : (
                                <p className="font-mono text-sm italic text-muted-foreground/50">
                                  No description
                                </p>
                              )}
                            </CardContent>
                            <CardFooter className="justify-between gap-3 border-t border-border/50 pl-4 sm:pl-6 pr-14 pt-3 pb-3 font-mono text-xs text-muted-foreground">
                              <span>{partCountLabel(project.partCount)}</span>
                              <span className="truncate">{formatUpdated(project.updatedAt, now)}</span>
                            </CardFooter>
                          </Card>
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete(project)}
                          aria-label={`Delete ${project.name}`}
                          title="Delete project"
                          className="absolute bottom-1 right-2 z-10 h-8 w-8 text-muted-foreground opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground">
                <span>Projects are saved to this browser.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyDeviceLink}
                  className="gap-1.5 font-mono text-[11px] font-normal"
                >
                  <Link2 />
                  Copy link for another device
                </Button>
              </div>
            </>
          )}
        </section>
      </main>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the design, its parts, and its chat history. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                // Keep the dialog open until the mutation settles.
                e.preventDefault();
                void confirmDelete();
              }}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleting && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
