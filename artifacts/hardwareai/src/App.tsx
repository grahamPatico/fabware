import React, { Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import BackendPending from "@/pages/BackendPending";

// The studio is lazy-loaded so landing-page visitors don't download the
// three.js / workspace chunks. Home → Workspace → Export all end up in
// their own split bundles.
const Home = React.lazy(() => import("@/pages/Home"));
const Workspace = React.lazy(() => import("@/pages/Workspace"));
const Export = React.lazy(() => import("@/pages/Export"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

interface ServerConfig {
  databaseConfigured: boolean;
  anthropicConfigured: boolean;
  version?: string;
}

async function fetchConfig(): Promise<ServerConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) {
    return { databaseConfigured: false, anthropicConfigured: false };
  }
  return (await res.json()) as ServerConfig;
}

function StudioSplash() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm uppercase tracking-widest">
        <Settings2 className="w-5 h-5 animate-spin [animation-duration:3s]" />
        Initializing studio…
      </div>
    </div>
  );
}

const studioFallback = <StudioSplash />;

function LazyStudio({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={studioFallback}>{children}</Suspense>;
}

// Gate studio routes on backend readiness. If /api/config reports that the
// database or Anthropic key aren't wired up, render the BackendPending page
// instead of letting the studio crash on its first API call.
function StudioGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["server-config"],
    queryFn: fetchConfig,
  });

  if (isLoading) return <StudioSplash />;
  if (!data?.databaseConfigured || !data?.anthropicConfigured) {
    return <BackendPending config={data ?? null} />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/studio">
        <StudioGuard>
          <LazyStudio>
            <Home />
          </LazyStudio>
        </StudioGuard>
      </Route>
      <Route path="/project/:id">
        <StudioGuard>
          <LazyStudio>
            <Workspace />
          </LazyStudio>
        </StudioGuard>
      </Route>
      <Route path="/project/:id/export">
        <StudioGuard>
          <LazyStudio>
            <Export />
          </LazyStudio>
        </StudioGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
