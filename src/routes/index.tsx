import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Mic2, Users, ListMusic, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Karaoke — sing together, in real time" },
      { name: "description", content: "Create a karaoke room, share a 6-letter code, queue YouTube songs, and sing with synced playback across every device." },
      { property: "og:title", content: "My Karaoke" },
      { property: "og:description", content: "Real-time collaborative karaoke with shared queues and live scoring." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/rooms", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <Mic2 className="size-6 text-[var(--neon)]" />
          <span className="text-lg font-bold tracking-tight">My Karaoke</span>
        </div>
        <Link to="/auth">
          <Button variant="ghost" className="font-semibold">Sign in</Button>
        </Link>
      </header>

      <main className="px-6 pb-20 pt-12 sm:px-10 sm:pt-20">
        <section className="mx-auto max-w-4xl text-center">
          <p className="mb-4 inline-block rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Collaborative · Real-time · YouTube-powered
          </p>
          <h1 className="font-display text-5xl font-black leading-[1.05] sm:text-7xl">
            Your room.<br />
            <span className="text-gradient">Their voices.</span><br />
            One stage.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Spin up a karaoke room in seconds. Share a 6-letter code. Everyone queues
            YouTube tracks. Playback stays in sync on every screen — the host runs
            the show, scoring each take as you go.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="glow-ring font-semibold">
                Start a room
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="font-semibold">
                Join with a code
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-24 grid max-w-5xl gap-4 sm:grid-cols-3">
          <Feature icon={<Users className="size-5" />} title="Room codes" desc="Share a 6-letter code. Anyone signed in can join from any device." />
          <Feature icon={<ListMusic className="size-5" />} title="Shared queue" desc="Everyone adds songs. Playback advances automatically." />
          <Feature icon={<Activity className="size-5" />} title="Live pitch" desc="Mic-driven pitch line for the singer. Local-only, never uploaded." />
        </section>
      </main>

      <footer className="border-t border-border/60 px-6 py-6 text-center text-xs text-muted-foreground sm:px-10">
        Built on Lovable Cloud · Be kind to your neighbors
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 backdrop-blur">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-primary/15 text-[var(--neon)]">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
