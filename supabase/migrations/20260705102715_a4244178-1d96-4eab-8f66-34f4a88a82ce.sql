
CREATE OR REPLACE FUNCTION public.shares_room_with(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _a = _b OR EXISTS (
    SELECT 1 FROM public.room_members m1
    JOIN public.room_members m2 ON m1.room_id = m2.room_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles readable by users sharing a room"
ON public.profiles FOR SELECT
TO authenticated
USING (public.shares_room_with(auth.uid(), id));
