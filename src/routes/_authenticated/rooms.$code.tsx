import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/karaoke/AppHeader";
import { YouTubePlayer, type PlayerHandle } from "@/components/karaoke/YouTubePlayer";
import { AddSongDialog } from "@/components/karaoke/AddSongDialog";
import { PitchVisualizer } from "@/components/karaoke/PitchVisualizer";
import { ScoreDialog } from "@/components/karaoke/ScoreDialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, Trash2, Crown, Trophy, Mic2 } from "lucide-react";
import { toast } from "sonner";
import { InviteDialog } from "@/components/karaoke/InviteDialog";
import { InviteCard } from "@/components/karaoke/InviteCard";

export const Route = createFileRoute("/_authenticated/rooms/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — My Karaoke` },
      { name: "description", content: "Join the karaoke room and sing along." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomPage,
});

type Room = {
  id: string; code: string; name: string; host_id: string;
  current_item_id: string | null;
  playback_state: "idle" | "playing" | "paused";
  position_seconds: number;
  playback_updated_at: string;
};
type QueueItem = {
  id: string; room_id: string; youtube_id: string; title: string; thumbnail_url: string | null;
  channel: string | null; added_by: string; singer_id: string | null; position: number;
  status: "queued" | "playing" | "done" | "skipped"; created_at: string;
};
type Profile = { id: string; display_name: string; avatar_url: string | null };
type Score = { id: string; singer_id: string; queue_item_id: string; score: number };

function RoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [scores, setScores] = useState<Score[]>([]);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pendingScoreItem, setPendingScoreItem] = useState<QueueItem | null>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const lastAppliedRef = useRef<string>(""); // signature of last applied sync

  const isHost = !!(room && userId && room.host_id === userId);
  const current = useMemo(() => items.find((i) => i.id === room?.current_item_id) ?? null, [items, room]);
  const isCurrentSinger = !!(current && userId && current.singer_id === userId);
  const canControl = isHost || isCurrentSinger;
  const queued = useMemo(() => items.filter((i) => i.status === "queued").sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [items]);
  const nextPosition = (items.reduce((max, i) => Math.max(max, i.position), 0) + 1) || 1;

  // Load user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Load room + ensure membership
  const loadRoom = useCallback(async () => {
    const { data, error } = await supabase.rpc("join_room_by_code", { _code: code });
    if (error) {
      toast.error(error.message);
      navigate({ to: "/rooms" });
      return;
    }
    setRoom(data as unknown as Room);
  }, [code, navigate]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Load queue + scores + member profiles
  const loadQueue = useCallback(async (roomId: string) => {
    const { data } = await supabase.from("queue_items").select("*").eq("room_id", roomId);
    setItems((data ?? []) as QueueItem[]);
  }, []);
  const loadScores = useCallback(async (roomId: string) => {
    const { data } = await supabase.from("scores").select("id, singer_id, queue_item_id, score").eq("room_id", roomId);
    setScores((data ?? []) as Score[]);
  }, []);
  const loadProfiles = useCallback(async (ids: string[]) => {
    const need = ids.filter((id) => id && !profiles[id]);
    if (!need.length) return;
    const { data } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", need);
    const next = { ...profiles };
    for (const p of data ?? []) next[p.id] = p as Profile;
    setProfiles(next);
  }, [profiles]);

  useEffect(() => {
    if (!room) return;
    loadQueue(room.id);
    loadScores(room.id);
    loadProfiles([room.host_id]);
  }, [room, loadQueue, loadScores, loadProfiles]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const i of items) { ids.add(i.added_by); if (i.singer_id) ids.add(i.singer_id); }
    loadProfiles([...ids]);
  }, [items, loadProfiles]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room) return;
    const ch = supabase
      .channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (payload) => {
        if (payload.eventType === "DELETE") { toast.info("Room closed"); navigate({ to: "/rooms" }); return; }
        setRoom(payload.new as Room);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_items", filter: `room_id=eq.${room.id}` }, () => loadQueue(room.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `room_id=eq.${room.id}` }, () => loadScores(room.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room?.id, loadQueue, loadScores, navigate]);

  // ---- Playback sync ----
  const roomRef = useRef<Room | null>(null);
  const currentRef = useRef<QueueItem | null>(null);
  const lastSeekAtRef = useRef<number>(0);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { currentRef.current = current; }, [current]);

  // Compensates for YouTube's post-seek buffer so followers don't consistently trail.
  const FOLLOWER_LOOKAHEAD = 0.7;
  // Ignore small drift; only correct when clearly out of sync so we don't re-buffer constantly.
  const FOLLOWER_TOLERANCE = 0.9;
  const CONTROLLER_TOLERANCE = 1.5;
  // After a seek, the player buffers ~1-2s. Don't re-seek during that window.
  const SEEK_COOLDOWN_MS = 2500;

  const applySync = useCallback((opts?: { force?: boolean }) => {
    const r = roomRef.current;
    const c = currentRef.current;
    const p = playerRef.current;
    if (!r || !p || !c) return;
    const sinceSeek = Date.now() - lastSeekAtRef.current;
    if (!opts?.force && sinceSeek < SEEK_COOLDOWN_MS) {
      // Just seeked; still buffering. Only ensure play/pause state, don't seek again.
      if (r.playback_state === "playing") p.play();
      else if (r.playback_state === "paused") p.pause();
      return;
    }

    const elapsed = (Date.now() - new Date(r.playback_updated_at).getTime()) / 1000;
    let target = r.playback_state === "playing"
      ? r.position_seconds + Math.max(0, elapsed)
      : r.position_seconds;
    // Lookahead only for followers on a playing stream — controller seeks are exact.
    if (r.playback_state === "playing" && !canControl) target += FOLLOWER_LOOKAHEAD;

    const now = p.currentTime();
    const tolerance = canControl ? CONTROLLER_TOLERANCE : FOLLOWER_TOLERANCE;
    if (opts?.force || Math.abs(now - target) > tolerance) {
      p.seek(target);
      lastSeekAtRef.current = Date.now();
    }
    if (r.playback_state === "playing") p.play();
    else if (r.playback_state === "paused") p.pause();
  }, [canControl]);

  // Apply on room/current change (new video, state change, seek by controller).
  useEffect(() => {
    if (!room || !current) return;
    const sig = `${current.id}:${room.playback_state}:${room.position_seconds}:${room.playback_updated_at}`;
    if (sig === lastAppliedRef.current) return;
    lastAppliedRef.current = sig;
    applySync({ force: true });
  }, [room, current, applySync]);

  // Continuous drift correction for followers.
  useEffect(() => {
    if (!current || canControl) return;
    const id = window.setInterval(() => applySync(), 3000);
    return () => window.clearInterval(id);
  }, [current, canControl, applySync]);

  // Re-sync when the tab regains focus (dropped setIntervals catch up).
  useEffect(() => {
    function onVis() { if (document.visibilityState === "visible") applySync({ force: true }); }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [applySync]);

  // Controller heartbeat: publish real playhead every 4s so late-joiners land accurately.
  useEffect(() => {
    if (!room || !current || !canControl || room.playback_state !== "playing") return;
    const id = window.setInterval(async () => {
      const p = playerRef.current;
      if (!p) return;
      const pos = p.currentTime();
      await supabase.from("rooms").update({
        position_seconds: pos,
        playback_updated_at: new Date().toISOString(),
      }).eq("id", room.id);
    }, 4000);
    return () => window.clearInterval(id);
  }, [room?.id, room?.playback_state, current?.id, canControl]);

  // Handle YouTube player state transitions: when we finish buffering into PLAYING,
  // reset the cooldown so the next drift tick can correct if needed.
  const onPlayerStateChange = useCallback((state: number) => {
    // 1 = PLAYING; clearing the cooldown lets drift correction resume immediately.
    if (state === 1) lastSeekAtRef.current = 0;
  }, []);



  // ---- Controls ----
  async function updatePlayback(patch: Partial<Pick<Room, "playback_state" | "position_seconds">>) {
    if (!room || !canControl) return;
    const pos = patch.position_seconds ?? playerRef.current?.currentTime() ?? 0;
    await supabase.from("rooms").update({
      ...patch,
      position_seconds: pos,
      playback_updated_at: new Date().toISOString(),
    }).eq("id", room.id);
  }

  async function play() { await updatePlayback({ playback_state: "playing" }); }
  async function pause() { await updatePlayback({ playback_state: "paused" }); }

  async function skip() {
    if (!room || !isHost) return;
    // Open score dialog for current, then advance
    if (current) {
      setPendingScoreItem(current);
      setScoreOpen(true);
    } else {
      await supabase.rpc("advance_queue", { _room_id: room.id });
    }
  }

  async function onSongEnded() {
    if (!room || !isHost) return;
    if (current) {
      setPendingScoreItem(current);
      setScoreOpen(true);
    } else {
      await supabase.rpc("advance_queue", { _room_id: room.id });
    }
  }

  async function startNext() {
    if (!room || !isHost) return;
    await supabase.rpc("advance_queue", { _room_id: room.id });
  }

  async function removeItem(id: string) {
    await supabase.from("queue_items").delete().eq("id", id);
  }

  async function claimSinger(id: string) {
    if (!userId) return;
    await supabase.from("queue_items").update({ singer_id: userId }).eq("id", id);
  }


  if (!room || !userId) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="grid place-items-center py-20 text-muted-foreground">Loading room…</div>
      </div>
    );
  }

  // Leaderboard aggregate
  const totals = new Map<string, { total: number; count: number }>();
  for (const s of scores) {
    const t = totals.get(s.singer_id) ?? { total: 0, count: 0 };
    t.total += s.score; t.count += 1;
    totals.set(s.singer_id, t);
  }
  const leaderboard = [...totals.entries()]
    .map(([uid, v]) => ({ uid, total: v.total, count: v.count, avg: v.total / v.count }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              {isHost ? <><Crown className="size-3 text-[var(--neon)]" /> You're the host</> : "Member"}
            </div>
            <h1 className="font-display text-3xl font-black sm:text-4xl">{room.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <InviteDialog code={room.code} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: player + controls + pitch */}
          <div className="space-y-4">
            <YouTubePlayer
              videoId={current?.youtube_id ?? null}
              onReady={(h) => {
                playerRef.current = h;
                // Force-align to room state as soon as the player is usable — critical for late joiners.
                lastAppliedRef.current = "";
                applySync({ force: true });
              }}
              onEnded={onSongEnded}
              onStateChange={onPlayerStateChange}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-3">
              <div className="min-w-0 flex-1">
                {current ? (
                  <>
                    <div className="truncate font-semibold">{current.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mic2 className="size-3" />
                      Singer: {current.singer_id ? profiles[current.singer_id]?.display_name ?? "…" : "open mic"}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No song playing. {isHost && queued.length > 0 && "Press Start to begin."}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!current && isHost && queued.length > 0 && (
                  <Button onClick={startNext} className="font-semibold"><Play className="mr-1 size-4" /> Start</Button>
                )}
                {current && (
                  <>
                    {room.playback_state === "playing" ? (
                      <Button size="sm" variant="outline" onClick={pause} disabled={!canControl}><Pause className="size-4" /></Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={play} disabled={!canControl}><Play className="size-4" /></Button>
                    )}
                    {isHost && (
                      <Button size="sm" onClick={skip} className="font-semibold"><SkipForward className="mr-1 size-4" /> Next</Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <PitchVisualizer />
          </div>

          {/* RIGHT: queue + leaderboard */}
          <aside className="space-y-4">
            <InviteCard code={room.code} />
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Queue</h2>
                <AddSongDialog roomId={room.id} userId={userId} nextPosition={nextPosition} />
              </div>
              {queued.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing queued. Add the first song.</p>
              ) : (
                <ul className="space-y-2">
                  {queued.map((it) => {
                    const singer = it.singer_id ? profiles[it.singer_id]?.display_name : null;
                    const canRemove = isHost || it.added_by === userId;
                    return (
                      <li key={it.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-stage/40 p-2">
                        {it.thumbnail_url && <img src={it.thumbnail_url} alt="" className="size-12 rounded-md object-cover" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{it.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {singer ? `Singer: ${singer}` : (
                              <button className="text-[var(--neon-2)] hover:underline" onClick={() => claimSinger(it.id)}>I'll sing this</button>
                            )}
                          </div>
                        </div>
                        {canRemove && (
                          <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)} aria-label="Remove">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="size-4 text-[var(--neon)]" />
                <h2 className="font-display text-lg font-semibold">Leaderboard</h2>
              </div>
              {leaderboard.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No scores yet.</p>
              ) : (
                <ol className="space-y-2">
                  {leaderboard.map((row, i) => (
                    <li key={row.uid} className="flex items-center justify-between rounded-lg bg-stage/40 p-2">
                      <div className="flex items-center gap-3">
                        <span className="w-5 text-center font-mono text-muted-foreground">{i + 1}</span>
                        <span className="font-medium">{profiles[row.uid]?.display_name ?? "…"}</span>
                        <span className="text-xs text-muted-foreground">{row.count} song{row.count !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="font-display text-xl font-bold text-gradient">{row.total}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      </main>

      {pendingScoreItem && (
        <ScoreDialog
          open={scoreOpen}
          onOpenChange={setScoreOpen}
          roomId={room.id}
          queueItemId={pendingScoreItem.id}
          singerId={pendingScoreItem.singer_id}
          singerName={pendingScoreItem.singer_id ? profiles[pendingScoreItem.singer_id]?.display_name ?? "Singer" : "Open mic"}
          judgedBy={userId}
          onScored={async () => {
            await supabase.rpc("advance_queue", { _room_id: room.id });
            setPendingScoreItem(null);
          }}
        />
      )}
    </div>
  );
}
