import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// A plain href (full page load) rather than a router link: the boundary keeps
// its error state across client-side navigation, a fresh load clears it.
function studioHref(): string {
  const base = import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, "");
  return base ? `/${base}/studio` : "/studio";
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
        <div role="alert" className="w-full max-w-md rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
            <AlertTriangle className="h-3.5 w-3.5" />
            Error
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight">Something broke on this page.</h1>
          <p className="mt-3 break-words font-mono text-xs leading-relaxed text-muted-foreground">
            {error.message || "Unknown error"}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => window.location.reload()}
              className="font-mono text-xs uppercase tracking-wider"
            >
              Reload
            </Button>
            <a
              href={studioHref()}
              className={buttonVariants({
                variant: "outline",
                className: "font-mono text-xs uppercase tracking-wider",
              })}
            >
              Back to studio
            </a>
          </div>
        </div>
      </div>
    );
  }
}
