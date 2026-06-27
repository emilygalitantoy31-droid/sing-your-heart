import { Link, useNavigate } from "@tanstack/react-router";
import { Mic2, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
      setName(p?.display_name ?? data.user.email?.split("@")[0] ?? "");
    });
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="flex items-center justify-between border-b border-border/60 bg-stage/60 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/rooms" className="flex items-center gap-2">
        <Mic2 className="size-5 text-[var(--neon)]" />
        <span className="font-display text-lg font-bold">My Karaoke</span>
      </Link>
      <div className="flex items-center gap-3">
        {name && <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>}
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="mr-1.5 size-4" /> Sign out
        </Button>
      </div>
    </header>
  );
}
