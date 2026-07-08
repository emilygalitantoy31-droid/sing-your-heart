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
  // Stable container React owns. We append a throwaway child inside it for
  // YouTube to replace with its <iframe>, so React never tries to unmount
  // a node that YouTube already swapped out (which throws NotFoundError:
  // Failed to execute 'removeChild' and crashes the whole page).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!videoId || !containerRef.current) return;

    // Reuse existing player if present.
    if (playerRef.current) {
      try { playerRef.current.loadVideoById(videoId); } catch { /* ignore */ }
      return;
    }

    // Create an inner mount node that YouTube can replace.
    const mount = document.createElement("div");
    mount.className = "size-full";
    containerRef.current.appendChild(mount);
    mountRef.current = mount;

    loadYouTubeAPI().then(() => {
      if (cancelled || !mountRef.current) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
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

  // On unmount (or when videoId becomes null and the container un-renders),
  // destroy the YT player so its iframe is removed before React tears down.
  useEffect(() => {
    return () => {
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      mountRef.current = null;
    };
  }, []);

  if (!videoId) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-stage/40 text-sm text-muted-foreground">
        Nothing playing — add a song to start the night
      </div>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <div ref={containerRef} className="size-full" />
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
