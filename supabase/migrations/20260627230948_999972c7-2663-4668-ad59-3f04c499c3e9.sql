
-- 1. Remove permissive SELECT on rooms; add code-based lookup function
DROP POLICY IF EXISTS "Authenticated users can look up rooms (used by join flow)" ON public.rooms;

CREATE OR REPLACE FUNCTION public.get_room_id_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.rooms WHERE code = upper(trim(_code)) LIMIT 1;
$$;

-- 2. Fix mutable search_path on generate_room_code
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
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

-- 3. Lock down SECURITY DEFINER function execution.
-- Trigger / internal-only functions: revoke from anon & authenticated.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_room_code() FROM PUBLIC, anon, authenticated;

-- Helper functions only used inside RLS policies (run as the policy evaluator);
-- revoke direct execution from anon and authenticated.
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_room_host(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- User-facing RPCs: signed-in users only (no anon).
REVOKE EXECUTE ON FUNCTION public.create_room(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_room_by_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_queue(uuid) TO authenticated;

-- New lookup function: signed-in users only.
REVOKE EXECUTE ON FUNCTION public.get_room_id_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_id_by_code(text) TO authenticated;
