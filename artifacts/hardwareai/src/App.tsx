import React, { Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Settings2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import BackendPending from "@/pages/BackendPending";

const Home = React.lazy(() => import("@/pages/Home"));
const Workspace = React.lazy(() => import("@/pages/Workspace"));
const Export = React.lazy(() => import("@/pages/Export"));
const Chat = React.lazy(() => import("@/pages/Chat"));

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

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

function StudioGuard({ children }: { children: React.ReactNode }) {
  if (!convexClient) {
    return (
      <BackendPending
        config={{ databaseConfigured: false, anthropicConfigured: false }}
      />
    );
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
      <Route path="/chat">
        <StudioGuard>
          <LazyStudio>
            <Chat />
          </LazyStudio>
        </StudioGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
  return convexClient ? <ConvexProvider client={convexClient}>{tree}</ConvexProvider> : tree;
}

export default App;
