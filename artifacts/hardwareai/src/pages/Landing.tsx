import React from "react";
import { Link } from "wouter";
import {
  Settings2,
  Hammer,
  Box,
  Wrench,
  ArrowRight,
  Github,
  Layers,
  FileCode,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ExampleCarousel from "@/components/ExampleCarousel";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";


function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const { toast } = useToast();
  const join = useMutation(api.waitlist.join);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const entry = { email, source, at: new Date().toISOString() };
    try {
      await join({ email, source, userAgent: navigator.userAgent });
    } catch {
      const queue = JSON.parse(localStorage.getItem("fabware_waitlist") ?? "[]");
      queue.push(entry);
      localStorage.setItem("fabware_waitlist", JSON.stringify(queue));
    }
    setSubmitting(false);
    setSubmitted(true);
    toast({ title: "You're on the list", description: "We'll email when the beta opens." });
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-primary font-mono text-sm">
        <CheckCircle2 className="w-4 h-4" />
        <span>You're on the list — we'll reach out.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md gap-2">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@shop.com"
        className="font-mono text-sm bg-background border-border focus-visible:ring-primary"
      />
      <Button
        type="submit"
        disabled={submitting}
        className="font-mono uppercase tracking-wider text-xs gap-1 shrink-0"
      >
        {submitting ? "Submitting…" : "Request access"}
        {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
      </Button>
    </form>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
        <span className="font-mono text-primary text-sm font-bold">{n}</span>
      </div>
      <div>
        <h3 className="font-mono uppercase tracking-wider text-sm font-bold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card/30 hover:border-primary/50 transition-colors">
      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-3">
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="font-mono uppercase tracking-wider text-xs font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-md flex items-center justify-center">
              <Settings2 className="w-5 h-5" />
            </div>
            <span className="font-mono text-lg font-bold tracking-tight uppercase">Fabware</span>
            <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
              Private beta
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/grahamPatico/fabware"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted"
              title="Source"
            >
              <Github className="w-4 h-4" />
            </a>
            <Link href="/studio">
              <Button variant="outline" size="sm" className="font-mono uppercase tracking-wider text-xs">
                Open studio →
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 items-start">
          <div className="md:col-span-3 space-y-6">
            <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/30 bg-primary/5 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              AI · CAD · CAM · Catalog
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Describe the part.{" "}
              <span className="text-primary">Get the DXF, the BOM, and the order link.</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              Fabware is an AI harness for hardware. Tell it what you want in plain English — it
              designs the part, validates it against real manufacturing rules, emits a
              production-ready DXF for SendCutSend, and fills out the rest of your bill of
              materials from McMaster-Carr.
            </p>
            <div className="pt-2">
              <WaitlistForm />
            </div>
            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> DXF export
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Rule validation
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> McMaster BOM
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Revision history
              </span>
            </div>
          </div>

          {/* Right-side terminal-style demo */}
          <div className="md:col-span-2">
            <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden shadow-xl">
              <div className="border-b border-border/60 bg-card/80 px-3 py-2 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  fabware · studio
                </span>
              </div>
              <div className="p-4 font-mono text-xs leading-relaxed space-y-2">
                <div className="flex gap-2">
                  <span className="text-primary">you ›</span>
                  <span className="text-foreground">
                    3×5″ steel L-bracket, four 1/4-20 mounting holes, black powder coat
                  </span>
                </div>
                <div className="pl-6 text-muted-foreground space-y-1">
                  <div>→ snapped thickness to 14 ga (0.075″)</div>
                  <div>→ 4 × Ø0.266″ corner holes (letter F clearance for 1/4-20)</div>
                  <div>→ 90° horizontal bend, R0.062″ inside</div>
                  <div>→ powder coat: Black</div>
                  <div className="text-primary">✓ passes SendCutSend rules</div>
                </div>
                <div className="flex gap-2 pt-1">
                  <span className="text-primary">you ›</span>
                  <span className="text-foreground">add four cap screws for the mounting holes</span>
                </div>
                <div className="pl-6 text-muted-foreground space-y-1">
                  <div>→ 4 × 91251A540 — 1/4-20 × 1″ SHCS</div>
                  <div>→ 4 × 90480A029 — 1/4-20 hex nut</div>
                  <div>→ 8 × 92141A029 — 1/4″ flat washer</div>
                  <div className="text-primary">✓ thread matches hole clearance</div>
                </div>
                <div className="pt-3 flex gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30">
                    dxf ready
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30">
                    bom 12 items
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example gallery */}
      <section className="border-t border-border/60 bg-background">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="max-w-xl mb-8">
            <h2 className="font-mono uppercase tracking-widest text-xs text-primary mb-3">
              Example gallery
            </h2>
            <p className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
              Six parts, six prompts — each with real manufacturability checks and real
              catalog part numbers.
            </p>
          </div>
          <ExampleCarousel />
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/60 bg-card/20">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="max-w-xl mb-12">
            <h2 className="font-mono uppercase tracking-widest text-xs text-primary mb-3">
              How it works
            </h2>
            <p className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
              From an idea in your head to a part on your bench in one afternoon.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 max-w-4xl">
            <Step
              n="01"
              title="Describe the part"
              body="Plain English, any units, even reference photos. Fabware extracts dimensions, features, finishes, and fasteners."
            />
            <Step
              n="02"
              title="Fabware designs it"
              body="The AI composes a parametric model, snaps values to real stocked material, and checks every geometry rule SendCutSend publishes."
            />
            <Step
              n="03"
              title="Review + iterate"
              body="Chat on the left, live canvas on the right. Every revision is tracked — undo any step, branch any version."
            />
            <Step
              n="04"
              title="Export + order"
              body="DXF for SendCutSend (with upload instructions) and a McMaster-Carr BOM with deep-links. Place both orders in five minutes."
            />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="max-w-xl mb-10">
          <h2 className="font-mono uppercase tracking-widest text-xs text-primary mb-3">
            Under the hood
          </h2>
          <p className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
            A hardware harness, not a CAD replacement.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Feature
            icon={FileCode}
            title="Parametric DSL"
            body="Every part is a small, versioned JSON document. Fork it, diff it, share it. CAD-as-code, finally."
          />
          <Feature
            icon={CheckCircle2}
            title="Manufacturability rules"
            body="Material stock, thicknesses, min hole size, bend radius vs thickness, clearance-hole matching — enforced, not hinted."
          />
          <Feature
            icon={Box}
            title="McMaster-Carr assembly"
            body="Ask for '4 mounting screws' and Fabware picks the right part number, sized to match the holes it just designed."
          />
          <Feature
            icon={Layers}
            title="Revision history"
            body="Every chat turn is a commit. Time-travel to any prior design, branch off, or undo the last change."
          />
          <Feature
            icon={Zap}
            title="Partner handoff"
            body="Download a DXF with the correct material + finishing notes and upload straight to SendCutSend. Lead time: days, not weeks."
          />
          <Feature
            icon={Wrench}
            title="Process packs (in progress)"
            body="FDM 3D-printing rules are live. Laser / waterjet / CNC / bending packs ship next."
          />
        </div>
      </section>

      {/* Partners */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-mono uppercase tracking-widest text-xs text-primary mb-8 text-center">
            Built on real supply chains
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <a
              href="https://sendcutsend.com"
              target="_blank"
              rel="noreferrer"
              className="group border border-border/60 rounded-lg p-6 bg-card/30 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <Hammer className="w-5 h-5 text-primary" />
                <span className="font-mono font-bold uppercase tracking-wider text-sm">
                  SendCutSend
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Laser, waterjet, CNC, bending, powder coat. Fabware's DXFs drop in clean and the
                material catalog lives in our rules engine.
              </p>
            </a>
            <a
              href="https://www.mcmaster.com"
              target="_blank"
              rel="noreferrer"
              className="group border border-border/60 rounded-lg p-6 bg-card/30 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <Wrench className="w-5 h-5 text-primary" />
                <span className="font-mono font-bold uppercase tracking-wider text-sm">
                  McMaster-Carr
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Off-the-shelf fasteners, bearings, extrusion, fittings. Fabware picks the part
                number; you get a direct link to buy.
              </p>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
          Stop drawing what you can describe.
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Fabware is in private beta. Tell us what you'd design first — we'll email you when your
          seat opens.
        </p>
        <div className="flex justify-center">
          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-3">
            <Settings2 className="w-4 h-4" />
            <span className="uppercase tracking-widest">Fabware · 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/grahamPatico/fabware"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://sendcutsend.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              SendCutSend
            </a>
            <a
              href="https://www.mcmaster.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              McMaster
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
