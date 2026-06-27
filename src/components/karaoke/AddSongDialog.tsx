import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseYouTubeId } from "./YouTubePlayer";
import { searchYouTube, type YouTubeSearchResult } from "@/lib/youtube.functions";
import { toast } from "sonner";

type Meta = { title: string; thumbnail: string; channel?: string };

async function fetchMeta(videoId: string): Promise<Meta> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (!res.ok) throw new Error("lookup failed");
    const j: any = await res.json();
    return {
      title: j.title ?? "Untitled",
      thumbnail: j.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channel: j.author_name,
    };
  } catch {
    return { title: "YouTube video", thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
  }
}

export function AddSongDialog({ roomId, userId, nextPosition }: { roomId: string; userId: string; nextPosition: number }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [singerMode, setSingerMode] = useState<"me" | "open">("me");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const runSearch = useServerFn(searchYouTube);

  async function addToQueue(meta: { videoId: string; title: string; thumbnail: string; channel?: string | null }) {
    setBusy(true);
    const { error } = await supabase.from("queue_items").insert({
      room_id: roomId,
      youtube_id: meta.videoId,
      title: meta.title,
      thumbnail_url: meta.thumbnail,
      channel: meta.channel ?? null,
      added_by: userId,
      singer_id: singerMode === "me" ? userId : null,
      position: nextPosition,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Added to queue");
    setUrl("");
    setOpen(false);
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const id = parseYouTubeId(url);
    if (!id) return toast.error("Paste a valid YouTube link or 11-char ID");
    const meta = await fetchMeta(id);
    await addToQueue({ videoId: id, title: meta.title, thumbnail: meta.thumbnail, channel: meta.channel });
  }

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await runSearch({ data: { q: query.trim() } });
      setResults(r);
      if (r.length === 0) toast.message("No results");
    } catch (err: any) {
      toast.error(err?.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-semibold"><Plus className="mr-1 size-4" /> Add song</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a song</DialogTitle>
          <DialogDescription>Search YouTube or paste a link. Karaoke versions work best.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Who's singing?</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={singerMode === "me" ? "default" : "outline"} onClick={() => setSingerMode("me")}>I'll sing</Button>
            <Button type="button" size="sm" variant={singerMode === "open" ? "default" : "outline"} onClick={() => setSingerMode("open")}>Open mic</Button>
          </div>
        </div>

        <Tabs defaultValue="search" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="url">Paste URL</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-3">
            <form onSubmit={submitSearch} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Song title, artist…"
                autoFocus
              />
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </Button>
            </form>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {results.map((r) => (
                <button
                  key={r.videoId}
                  type="button"
                  disabled={busy}
                  onClick={() => addToQueue({ videoId: r.videoId, title: r.title, thumbnail: r.thumbnail, channel: r.channel })}
                  className="w-full flex gap-3 items-center p-2 rounded-md hover:bg-muted text-left transition disabled:opacity-50"
                >
                  <img src={r.thumbnail} alt="" className="w-24 h-16 object-cover rounded" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium line-clamp-2">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.channel}</div>
                  </div>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="url">
            <form onSubmit={submitUrl} className="space-y-3">
              <div>
                <Label htmlFor="yt-url">YouTube URL or video ID</Label>
                <Input id="yt-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <Button type="submit" className="w-full font-semibold" disabled={busy}>{busy ? "Adding…" : "Add to queue"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
