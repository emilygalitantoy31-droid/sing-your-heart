import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/karaoke/AppHeader";
import { toast } from "sonner";
import { Plus, LogIn } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({
    meta: [
      { title: "Your rooms — My Karaoke" },
      { name: "description", content: "Create a karaoke room or join one with a code." },
    ],
  }),
  component: RoomsPage,
});

type Room = { id: string; code: string; name: string; created_at: string; host_id: string };

function RoomsPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_room", { _name: name || "Karaoke Night" });
    setBusy(false);
    if (error) return toast.error(error.message);
    const room = data as unknown as Room;
    toast.success(`Room ${room.code} created`);
    navigate({ to: "/rooms/$code", params: { code: room.code } });
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("join_room_by_code", { _code: code.trim().toUpperCase() });
    setBusy(false);
    if (error) return toast.error(error.message);
    const room = data as unknown as Room;
    navigate({ to: "/rooms/$code", params: { code: room.code } });
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl font-black sm:text-5xl">
          Your <span className="text-gradient">rooms</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Spin up a new room or jump in with a code.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <form onSubmit={createRoom} className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="size-4 text-[var(--neon)]" />
              <h2 className="font-display text-lg font-semibold">Create a room</h2>
            </div>
            <Label htmlFor="room-name">Room name</Label>
            <Input id="room-name" placeholder="Friday Night Karaoke" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" className="mt-4 w-full font-semibold" disabled={busy}>Create</Button>
          </form>

          <form onSubmit={joinRoom} className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <LogIn className="size-4 text-[var(--neon-2)]" />
              <h2 className="font-display text-lg font-semibold">Join with a code</h2>
            </div>
            <Label htmlFor="room-code">6-letter code</Label>
            <Input
              id="room-code"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono text-lg tracking-[0.4em] uppercase"
              placeholder="ABCDEF"
            />
            <Button type="submit" variant="outline" className="mt-4 w-full font-semibold" disabled={busy}>Join</Button>
          </form>
        </div>
      </main>
    </div>
  );
}
