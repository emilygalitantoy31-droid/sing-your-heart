
## What we're building

A multi-device karaoke party app. Sign in, create or join a room with a short code, search YouTube for songs, queue them collaboratively, and watch a synced player on every device. The current singer controls their own playback; the host can override. After each song, the host enters a score for the singer; a per-room leaderboard tracks the night. A pitch visualizer runs locally on the singing device using the mic.

## Stack

- **Lovable Cloud** for Postgres, auth (email + Google), Realtime, RLS.
- **TanStack Start** routes already scaffolded.
- **YouTube IFrame Player API** (no key needed) for playback + search via a thin server function calling YouTube Data API (requires `YOUTUBE_API_KEY` secret — I'll request it before that feature ships).
- **Web Audio API** for the local pitch visualizer (autocorrelation, no upload).

## Data model

```text
profiles(id PK→auth.users, display_name, avatar_url)
rooms(id, code unique 6-char, host_id→profiles, status, current_item_id, playback_state, position_seconds, playback_updated_at, created_at)
room_members(room_id, user_id, joined_at)  -- PK (room_id,user_id)
queue_items(id, room_id, youtube_id, title, thumbnail_url, channel, duration_seconds, added_by, singer_id, position, status: queued|playing|done|skipped, created_at)
scores(id, room_id, queue_item_id, singer_id, score int 0-100, judged_by, created_at)
user_roles(user_id, role: 'admin'|'user')  -- security-definer has_role()
```

RLS: members can read their room's rows; host/singer can mutate playback fields; anyone in room can append to queue; only host can score (or singer-of-record can self-rate? — host-only for v1).

## Playback sync model

Single source of truth: `rooms.playback_state` + `position_seconds` + `playback_updated_at`. Whoever is allowed to control (current singer or host) writes updates. Other clients compute `effective_position = position_seconds + (now - playback_updated_at)` when playing, and call `player.seekTo` if drift > 1.5s. Realtime channel on the `rooms` row pushes changes.

## Routes

```text
/                       marketing landing + CTA to sign in
/auth                   sign in / sign up (email + Google)
/_authenticated/
  rooms                 your rooms + "Create" + "Join with code"
  rooms/$code           the karaoke room (player + queue + leaderboard + add-song)
```

## Build order

1. Enable Lovable Cloud.
2. Migration: profiles + trigger, rooms, room_members, queue_items, scores, user_roles, `has_role()`, RLS, GRANTs. Enable Realtime on rooms + queue_items + scores.
3. Design system tweak in `src/styles.css` — stage-lights dark theme, neon magenta/cyan accent, Outfit + Inter via @fontsource.
4. Auth page + Google via `lovable.auth.signInWithOAuth`. Configure social auth.
5. `/rooms` list + create/join flow (6-char code generator, server fn).
6. `/rooms/$code` shell: header, three panes (Now Playing, Queue, Leaderboard).
7. YouTube player component + sync logic (subscribe to room row, seek on drift, control gating: current singer || host).
8. Add-song dialog: request `YOUTUBE_API_KEY`, server fn proxies search, insert into queue.
9. Skip / end-song flow → marks item `done`, advances to next queued item, opens score dialog for host.
10. Leaderboard panel (aggregate scores per singer).
11. Pitch visualizer card (mic permission, autocorrelation, draws to canvas).
12. SEO meta per route + sitemap/robots.

## What I'll ask you for as it comes up

- **Google OAuth provider** — I'll wire it; you may need to confirm Google sign-in in the auth panel.
- **`YOUTUBE_API_KEY`** — I'll request it via the secret form before shipping song search. Get it from Google Cloud Console → APIs & Services → YouTube Data API v3.

## Known v1 limits (call out so we agree up front)

- Sync is "good enough karaoke party" sync (~1s tolerance), not frame-accurate.
- Pitch visualizer is a fun local display, not real-time scoring.
- Scoring is host-entered (0–100); automatic pitch-based scoring is a separate feature.
- Recording/export is out of v1 scope per your selection.

Approve and I'll start at step 1.
