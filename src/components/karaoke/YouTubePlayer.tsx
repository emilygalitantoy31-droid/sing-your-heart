import { useEffect, useRef } from "react";

// Lightweight YouTube IFrame Player wrapper.
// Loads the API script once, then exposes play/pause/seek via ref-style callbacks.

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
  return apiPromise;
}

export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seek: (s: number) => void;
  currentTime: () => number;
};

export function YouTubePlayer({
  videoId,
  onReady,
  onEnded,
  onStateChange,
}: {
  videoId: string | null;
  onReady?: (h: PlayerHandle) => void;
  onEnded?: () => void;
  onStateChange?: (state: number) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!videoId || !elRef.current) return;
    loadYouTubeAPI().then(() => {
      if (cancelled || !elRef.current) return;
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        return;
      }
      playerRef.current = new window.YT.Player(elRef.current, {
        videoId,
        playerVars: { autoplay: 1, modestbranding: 1, rel: 0, playsinline: 1, controls: 1 },
        events: {
          onReady: () => {
            const handle: PlayerHandle = {
              play: () => playerRef.current?.playVideo(),
              pause: () => playerRef.current?.pauseVideo(),
              seek: (s: number) => playerRef.current?.seekTo(s, true),
              currentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
            };
            onReady?.(handle);
          },
          onStateChange: (e: any) => {
            onStateChange?.(e.data);
            if (e.data === 0) onEnded?.(); // ended
          },
        },
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-stage/40 text-sm text-muted-foreground">
        Nothing playing — add a song to start the night
      </div>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <div ref={elRef} className="size-full" />
    </div>
  );
}

// Parse common YouTube URL formats into a video id.
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "");
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
      const sh = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
      if (sh) return sh[1];
    }
  } catch { /* ignore */ }
  return null;
}
