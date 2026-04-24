import React from "react";
import { Link } from "wouter";
import { Settings2, Database, KeyRound, ArrowLeft, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServerConfig {
  databaseConfigured: boolean;
  anthropicConfigured: boolean;
  version?: string;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
      ) : (
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
      <span className={`font-mono text-sm ${ok ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

export default function BackendPending({ config }: { config: ServerConfig | null }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center">
              <Settings2 className="w-5 h-5" />
            </div>
            <span className="font-mono text-lg font-bold tracking-tight uppercase">Fabware</span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">
            Backend · Pending
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/30 bg-primary/5 px-3 py-1 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          Bootstrapping
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          The studio is almost live.
        </h1>
        <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
          Fabware's frontend is deployed. A Postgres database and an Anthropic API key
          still need to be wired up before the chat-and-canvas workspace can accept
          real requests.
        </p>

        {/* Status */}
        <div className="border border-border/60 rounded-lg p-6 bg-card/30 space-y-3 mb-10">
          <h2 className="font-mono uppercase tracking-wider text-xs text-primary mb-3">
            Provisioning status
          </h2>
          <Check ok label="Frontend + landing page (deployed)" />
          <Check ok label="API routes + rule engine (deployed)" />
          <Check ok={!!config?.databaseConfigured} label="Postgres database (DATABASE_URL)" />
          <Check ok={!!config?.anthropicConfigured} label="Anthropic API key" />
        </div>

        {/* Steps */}
        <div className="space-y-6 mb-12">
          <div className="border border-border/60 rounded-lg p-6 bg-card/30">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <h3 className="font-mono uppercase tracking-wider text-sm font-bold">
                  1. Provision Postgres
                </h3>
                <p className="text-sm text-muted-foreground">
                  Any Postgres works — Neon has a free tier that's instant to create.
                </p>
                <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside font-mono">
                  <li>
                    Go to{" "}
                    <a
                      href="https://vercel.com/grahampaticos-projects/fabware/integrations/marketplace/neon"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Vercel → fabware → Storage
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    , install Neon, attach to this project.
                  </li>
                  <li>
                    <code className="text-primary">DATABASE_URL</code> is auto-added to project env.
                  </li>
                  <li>
                    Locally:{" "}
                    <code className="text-primary">vercel env pull</code>, then{" "}
                    <code className="text-primary">
                      cd lib/db && pnpm push
                    </code>{" "}
                    to create the tables.
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <div className="border border-border/60 rounded-lg p-6 bg-card/30">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <h3 className="font-mono uppercase tracking-wider text-sm font-bold">
                  2. Add Anthropic API key
                </h3>
                <p className="text-sm text-muted-foreground">
                  The AI designer runs on Claude Sonnet 4.6. Grab a key at{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    console.anthropic.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  .
                </p>
                <div className="text-sm text-muted-foreground font-mono bg-background/50 border border-border rounded-md p-3">
                  vercel env add ANTHROPIC_API_KEY production
                </div>
              </div>
            </div>
          </div>

          <div className="border border-border/60 rounded-lg p-6 bg-card/30">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
                <span className="font-mono text-primary text-sm font-bold">3</span>
              </div>
              <div className="flex-1 space-y-3">
                <h3 className="font-mono uppercase tracking-wider text-sm font-bold">
                  Redeploy
                </h3>
                <div className="text-sm text-muted-foreground font-mono bg-background/50 border border-border rounded-md p-3">
                  vercel deploy --prod
                </div>
                <p className="text-sm text-muted-foreground">
                  When the status checkmarks above all turn green, refresh this page and
                  the studio will load.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" className="font-mono uppercase tracking-wider text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to landing
            </Button>
          </Link>
          <a
            href="https://github.com/grahamPatico/fabware"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="ghost" className="font-mono uppercase tracking-wider text-xs">
              View source
              <ExternalLink className="w-3.5 h-3.5 ml-2" />
            </Button>
          </a>
        </div>
      </main>
    </div>
  );
}
