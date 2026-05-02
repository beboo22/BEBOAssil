-- Sanitize the `_loc` translation map inside each result of places_cache.results.
-- Keeps only entries where the language key is a 2-5 char string and the value
-- is a JSON object with optional title/description strings. Anything else is dropped.
CREATE OR REPLACE FUNCTION public.sanitize_places_cache_loc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb;
  v_item jsonb;
  v_loc jsonb;
  v_clean_loc jsonb;
  v_clean_results jsonb := '[]'::jsonb;
  v_lang_key text;
  v_lang_val jsonb;
  v_clean_entry jsonb;
BEGIN
  IF NEW.results IS NULL OR jsonb_typeof(NEW.results) <> 'array' THEN
    RETURN NEW;
  END IF;

  v_results := NEW.results;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_results) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      v_clean_results := v_clean_results || jsonb_build_array(v_item);
      CONTINUE;
    END IF;

    v_loc := v_item -> '_loc';
    IF v_loc IS NULL OR jsonb_typeof(v_loc) <> 'object' THEN
      -- Drop any non-object _loc field
      v_clean_results := v_clean_results || jsonb_build_array(v_item - '_loc');
      CONTINUE;
    END IF;

    v_clean_loc := '{}'::jsonb;
    FOR v_lang_key, v_lang_val IN SELECT * FROM jsonb_each(v_loc) LOOP
      IF char_length(v_lang_key) BETWEEN 2 AND 5
         AND jsonb_typeof(v_lang_val) = 'object' THEN
        v_clean_entry := '{}'::jsonb;
        IF jsonb_typeof(v_lang_val -> 'title') = 'string' THEN
          v_clean_entry := v_clean_entry || jsonb_build_object('title', left(v_lang_val ->> 'title', 240));
        END IF;
        IF jsonb_typeof(v_lang_val -> 'description') = 'string' THEN
          v_clean_entry := v_clean_entry || jsonb_build_object('description', left(v_lang_val ->> 'description', 1000));
        END IF;
        IF v_clean_entry <> '{}'::jsonb THEN
          v_clean_loc := v_clean_loc || jsonb_build_object(lower(v_lang_key), v_clean_entry);
        END IF;
      END IF;
    END LOOP;

    IF v_clean_loc = '{}'::jsonb THEN
      v_clean_results := v_clean_results || jsonb_build_array(v_item - '_loc');
    ELSE
      v_clean_results := v_clean_results || jsonb_build_array(jsonb_set(v_item, '{_loc}', v_clean_loc, true));
    END IF;
  END LOOP;

  NEW.results := v_clean_results;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_places_cache_loc ON public.places_cache;
CREATE TRIGGER trg_sanitize_places_cache_loc
BEFORE INSERT OR UPDATE OF results ON public.places_cache
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_places_cache_loc();

-- Make sure cache_key lookups stay fast
CREATE INDEX IF NOT EXISTS idx_places_cache_cache_key ON public.places_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_places_cache_expires_at ON public.places_cache(expires_at);