-- Per-user uniqueness (one row per user per place)
CREATE UNIQUE INDEX IF NOT EXISTS places_usage_user_place_uidx
  ON public.places_usage (place_key, user_id)
  WHERE user_id IS NOT NULL;

-- Global uniqueness (one shared row when user_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS places_usage_global_place_uidx
  ON public.places_usage (place_key)
  WHERE user_id IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS places_usage_last_used_idx
  ON public.places_usage (last_used_at DESC);

CREATE INDEX IF NOT EXISTS places_usage_user_last_used_idx
  ON public.places_usage (user_id, last_used_at DESC);

CREATE INDEX IF NOT EXISTS places_usage_place_user_idx
  ON public.places_usage (place_key, user_id);

-- Helper: increment usage atomically (per-user + global shared row)
CREATE OR REPLACE FUNCTION public.touch_place_usage(
  p_place_key text,
  p_user_id uuid,
  p_place_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_place_key IS NULL OR length(btrim(p_place_key)) = 0 THEN
    RETURN;
  END IF;

  -- Per-user row
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.places_usage (place_key, user_id, place_name, city, category, usage_count, last_used_at)
    VALUES (p_place_key, p_user_id, p_place_name, p_city, p_category, 1, now())
    ON CONFLICT (place_key, user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET
      usage_count = places_usage.usage_count + 1,
      last_used_at = now(),
      place_name = COALESCE(EXCLUDED.place_name, places_usage.place_name),
      city = COALESCE(EXCLUDED.city, places_usage.city),
      category = COALESCE(EXCLUDED.category, places_usage.category);
  END IF;

  -- Global shared row (user_id NULL)
  INSERT INTO public.places_usage (place_key, user_id, place_name, city, category, usage_count, last_used_at)
  VALUES (p_place_key, NULL, p_place_name, p_city, p_category, 1, now())
  ON CONFLICT (place_key) WHERE user_id IS NULL
  DO UPDATE SET
    usage_count = places_usage.usage_count + 1,
    last_used_at = now(),
    place_name = COALESCE(EXCLUDED.place_name, places_usage.place_name),
    city = COALESCE(EXCLUDED.city, places_usage.city),
    category = COALESCE(EXCLUDED.category, places_usage.category);
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_place_usage(text, uuid, text, text, text) TO anon, authenticated, service_role;