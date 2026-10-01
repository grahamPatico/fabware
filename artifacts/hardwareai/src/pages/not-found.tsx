import { Link } from "wouter";
import { Settings2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center">
            <Settings2 className="w-5 h-5" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
            404
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          That link doesn't go anywhere.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/studio"
            className={buttonVariants({
              className: "font-mono text-xs uppercase tracking-wider",
            })}
          >
            Open studio
          </Link>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              className: "font-mono text-xs uppercase tracking-wider",
            })}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
