import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic2 } from "lucide-react";

export const Route = createFileRoute("/join/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Join room ${params.code} — My Karaoke` },
      { name: "description", content: "Hop into the karaoke room." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const cleanCode = code.trim().toUpperCase();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/rooms/$code", params: { code: cleanCode }, replace: true });
      } else {
        try { sessionStorage.setItem("postAuthRedirect", `/rooms/${cleanCode}`); } catch {}
        navigate({ to: "/auth", replace: true });
      }
    });
  }, [code, navigate]);

  return (
    <div className="grid min-h-screen place-items-center text-muted-foreground">
      <div className="flex items-center gap-2">
        <Mic2 className="size-5 animate-pulse text-[var(--neon)]" />
        <span>Joining room {code.toUpperCase()}…</span>
      </div>
    </div>
  );
}
