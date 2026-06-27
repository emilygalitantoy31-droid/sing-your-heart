import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/karaoke/AppHeader";
import { toast } from "sonner";
import { Plus, LogIn, Music } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({
    meta: [
      { title: "Your rooms — My Karaoke" },
      { name: "description", content: "Create a karaoke room or join one with a code." },
    ],
  }),
  component: RoomsPage,
});

type Room = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  host_id: string;
};

function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadRooms() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data: memberRows } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("user_id", user.user.id);
    const ids = (memberRows ?? []).map((r) => r.room_id);
    if (!ids.length) { setRooms([]); return; }
    const { data: roomData } = await supabase
      .from("rooms")
      .select("id, code, name, created_at, host_id")
      .in("id", ids)
      .order("created_at", { ascending: false });
    setRooms(roomData ?? []);
  }

  useEffect(() => { loadRooms(); }, []);

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
        <p className="mt-2 text-muted-foreground">Create a new one or jump back in.</p>

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

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold">Recent rooms</h2>
          {rooms.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Music className="mx-auto mb-2 size-6 opacity-50" />
              No rooms yet. Create one above.
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {rooms.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => navigate({ to: "/rooms/$code", params: { code: r.code } })}
                    className="group flex w-full items-center justify-between rounded-xl border border-border bg-card/40 p-4 text-left transition hover:border-[var(--neon)] hover:bg-card/70"
                  >
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <span className="font-mono text-lg tracking-[0.3em] text-[var(--neon)]">{r.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
