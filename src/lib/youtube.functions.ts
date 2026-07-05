import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
};

export const searchYouTube = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q: string }) => {
    if (!data || typeof data.q !== "string") throw new Error("Invalid query");
    const q = data.q.trim().slice(0, 200);
    if (!q) throw new Error("Empty query");
    return { q };
  })
  .handler(async ({ data }): Promise<YouTubeSearchResult[]> => {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error("YOUTUBE_API_KEY not configured");

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", "12");
    url.searchParams.set("q", `${data.q} karaoke`);
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("YouTube search failed", res.status, body);
      throw new Error("YouTube search failed");
    }
    const json: any = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    return items
      .filter((it: any) => it?.id?.videoId)
      .map((it: any) => ({
        videoId: it.id.videoId as string,
        title: it.snippet?.title ?? "Untitled",
        channel: it.snippet?.channelTitle ?? "",
        thumbnail:
          it.snippet?.thumbnails?.medium?.url ??
          it.snippet?.thumbnails?.default?.url ??
          `https://i.ytimg.com/vi/${it.id.videoId}/hqdefault.jpg`,
      }));
  });
