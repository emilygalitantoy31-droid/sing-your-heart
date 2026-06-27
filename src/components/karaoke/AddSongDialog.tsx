import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseYouTubeId } from "./YouTubePlayer";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseYouTubeId(url);
    if (!id) return toast.error("Paste a valid YouTube link or 11-char ID");
    setBusy(true);
    const meta = await fetchMeta(id);
    const { error } = await supabase.from("queue_items").insert({
      room_id: roomId,
      youtube_id: id,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-semibold"><Plus className="mr-1 size-4" /> Add song</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a YouTube song</DialogTitle>
          <DialogDescription>Paste any YouTube link. Karaoke versions work best.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="yt-url">YouTube URL or video ID</Label>
            <Input id="yt-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
          </div>
          <div className="space-y-2">
            <Label>Who's singing?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={singerMode === "me" ? "default" : "outline"} onClick={() => setSingerMode("me")}>I'll sing</Button>
              <Button type="button" size="sm" variant={singerMode === "open" ? "default" : "outline"} onClick={() => setSingerMode("open")}>Open mic</Button>
            </div>
          </div>
          <Button type="submit" className="w-full font-semibold" disabled={busy}>{busy ? "Adding…" : "Add to queue"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
