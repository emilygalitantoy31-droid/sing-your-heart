
-- =========================================================
-- Enums
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.playback_state AS ENUM ('idle', 'playing', 'paused');
CREATE TYPE public.queue_status AS ENUM ('queued', 'playing', 'done', 'skipped');

-- =========================================================
-- Profiles
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- User roles
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- =========================================================
-- Rooms
-- =========================================================
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Karaoke Night',
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_item_id UUID,
  playback_state public.playback_state NOT NULL DEFAULT 'idle',
  position_seconds NUMERIC NOT NULL DEFAULT 0,
  playback_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE INDEX rooms_code_idx ON public.rooms(code);

-- =========================================================
-- Room members
-- =========================================================
CREATE TABLE public.room_members (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_members TO authenticated;
GRANT ALL ON public.room_members TO service_role;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check membership without recursive RLS
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members WHERE room_id = _room_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_host(_room_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = _room_id AND host_id = _user_id
  );
$$;

-- Rooms policies
CREATE POLICY "Members and host can view their rooms"
ON public.rooms FOR SELECT TO authenticated
USING (host_id = auth.uid() OR public.is_room_member(id, auth.uid()));

CREATE POLICY "Anyone authenticated can create rooms as host"
ON public.rooms FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());

CREATE POLICY "Only host can update room"
ON public.rooms FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

CREATE POLICY "Only host can delete room"
ON public.rooms FOR DELETE TO authenticated USING (host_id = auth.uid());

-- Allow looking up a room by code to join it (needed before becoming a member)
CREATE POLICY "Authenticated users can look up rooms (used by join flow)"
ON public.rooms FOR SELECT TO authenticated USING (true);

-- Members policies
CREATE POLICY "Members can view co-members"
ON public.room_members FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()) OR public.is_room_host(room_id, auth.uid()));

CREATE POLICY "Users can join a room as themselves"
ON public.room_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave; host can remove members"
ON public.room_members FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_room_host(room_id, auth.uid()));

-- =========================================================
-- Queue items
-- =========================================================
CREATE TABLE public.queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  channel TEXT,
  duration_seconds INTEGER,
  added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  singer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status public.queue_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_items TO authenticated;
GRANT ALL ON public.queue_items TO service_role;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX queue_items_room_idx ON public.queue_items(room_id, position);

CREATE POLICY "Members can view queue"
ON public.queue_items FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()) OR public.is_room_host(room_id, auth.uid()));

CREATE POLICY "Members can add to queue"
ON public.queue_items FOR INSERT TO authenticated
WITH CHECK (
  added_by = auth.uid()
  AND (public.is_room_member(room_id, auth.uid()) OR public.is_room_host(room_id, auth.uid()))
);

CREATE POLICY "Host or song owner can update item"
ON public.queue_items FOR UPDATE TO authenticated
USING (public.is_room_host(room_id, auth.uid()) OR added_by = auth.uid() OR singer_id = auth.uid())
WITH CHECK (public.is_room_host(room_id, auth.uid()) OR added_by = auth.uid() OR singer_id = auth.uid());

CREATE POLICY "Host or owner can remove item"
ON public.queue_items FOR DELETE TO authenticated
USING (public.is_room_host(room_id, auth.uid()) OR added_by = auth.uid());

-- =========================================================
-- Scores
-- =========================================================
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  queue_item_id UUID NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,
  singer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  judged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (queue_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO authenticated;
GRANT ALL ON public.scores TO service_role;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view scores"
ON public.scores FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()) OR public.is_room_host(room_id, auth.uid()));

CREATE POLICY "Only host can submit scores"
ON public.scores FOR INSERT TO authenticated
WITH CHECK (judged_by = auth.uid() AND public.is_room_host(room_id, auth.uid()));

CREATE POLICY "Only host can update scores"
ON public.scores FOR UPDATE TO authenticated
USING (public.is_room_host(room_id, auth.uid()))
WITH CHECK (public.is_room_host(room_id, auth.uid()));

CREATE POLICY "Only host can delete scores"
ON public.scores FOR DELETE TO authenticated
USING (public.is_room_host(room_id, auth.uid()));

-- =========================================================
-- Helpers: create_room, join_room_by_code (atomic)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_room(_name TEXT)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  attempts INTEGER := 0;
  new_room public.rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  LOOP
    new_code := public.generate_room_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms WHERE code = new_code);
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate unique room code';
    END IF;
  END LOOP;

  INSERT INTO public.rooms (code, name, host_id)
  VALUES (new_code, COALESCE(NULLIF(trim(_name), ''), 'Karaoke Night'), auth.uid())
  RETURNING * INTO new_room;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (new_room.id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN new_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room_by_code(_code TEXT)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_room public.rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO target_room FROM public.rooms WHERE code = upper(trim(_code)) LIMIT 1;
  IF target_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (target_room.id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN target_room;
END;
$$;

-- Advance to next queued song (host only). Marks current as done, picks next.
CREATE OR REPLACE FUNCTION public.advance_queue(_room_id UUID)
RETURNS public.queue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_item public.queue_items;
BEGIN
  IF NOT public.is_room_host(_room_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the host can advance the queue';
  END IF;

  -- Mark current as done
  UPDATE public.queue_items
  SET status = 'done'
  WHERE room_id = _room_id AND status = 'playing';

  -- Pick next queued by position then created_at
  SELECT * INTO next_item
  FROM public.queue_items
  WHERE room_id = _room_id AND status = 'queued'
  ORDER BY position ASC, created_at ASC
  LIMIT 1;

  IF next_item.id IS NOT NULL THEN
    UPDATE public.queue_items SET status = 'playing' WHERE id = next_item.id;
    UPDATE public.rooms
    SET current_item_id = next_item.id,
        playback_state = 'playing',
        position_seconds = 0,
        playback_updated_at = now()
    WHERE id = _room_id;
  ELSE
    UPDATE public.rooms
    SET current_item_id = NULL,
        playback_state = 'idle',
        position_seconds = 0,
        playback_updated_at = now()
    WHERE id = _room_id;
  END IF;

  RETURN next_item;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_host(UUID, UUID) TO authenticated;

-- =========================================================
-- Realtime
-- =========================================================
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.queue_items REPLICA IDENTITY FULL;
ALTER TABLE public.room_members REPLICA IDENTITY FULL;
ALTER TABLE public.scores REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
