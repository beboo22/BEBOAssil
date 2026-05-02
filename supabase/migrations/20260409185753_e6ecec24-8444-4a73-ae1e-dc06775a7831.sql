
CREATE OR REPLACE FUNCTION public.get_total_used_activities(p_user_id uuid, p_since timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.usage_tracking
  WHERE user_id = p_user_id
    AND used_at >= p_since
    AND feature IN ('planner', 'regen_activity', 'regen_day', 'regen_full', 'auto_generate');
  RETURN v_total;
END;
$function$;
