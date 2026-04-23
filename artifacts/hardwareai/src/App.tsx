import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Workspace from "@/pages/Workspace";
import Export from "@/pages/Export";
import Landing from "@/pages/Landing";

const queryClient = new QueryClient();
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

// In demo mode we deploy a static landing site only — there's no backend, so
// redirect any deep link into the studio back to the root landing page.
function DemoRedirect() {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/studio" component={DEMO_MODE ? DemoRedirect : Home} />
      <Route path="/project/:id" component={DEMO_MODE ? DemoRedirect : Workspace} />
      <Route path="/project/:id/export" component={DEMO_MODE ? DemoRedirect : Export} />
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
