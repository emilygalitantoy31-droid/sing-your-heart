import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mic2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — My Karaoke" },
      { name: "description", content: "Sign in to start or join a karaoke room." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  function consumeRedirect(): string {
    try {
      const saved = sessionStorage.getItem("postAuthRedirect");
      if (saved && saved.startsWith("/")) {
        sessionStorage.removeItem("postAuthRedirect");
        return saved;
      }
    } catch {}
    return "/rooms";
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(consumeRedirect());
    });
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    window.location.replace(consumeRedirect());
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    let redirectPath = "/rooms";
    try {
      const saved = sessionStorage.getItem("postAuthRedirect");
      if (saved && saved.startsWith("/")) redirectPath = saved;
    } catch {}
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — you can sign in now");
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) return toast.error(result.error.message);
    if (result.redirected) return;
    window.location.replace(consumeRedirect());
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <Mic2 className="size-6 text-[var(--neon)]" />
          <span className="text-lg font-bold">My Karaoke</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="si-pw">Password</Label>
                  <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <Label htmlFor="su-name">Display name</Label>
                  <Input id="su-name" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Stage name" />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={loading}>
                  {loading ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full font-semibold" onClick={handleGoogle}>
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
