UPDATE public.site_settings 
SET nav_order = jsonb_build_object(
  'visible', (
    SELECT CASE 
      WHEN nav_order->'visible' IS NOT NULL 
      THEN (nav_order->'visible') || '["store"]'::jsonb
      ELSE '["home","destinations","planner","promotions","bookings","flights","hotels","cars","my-trips","store","stories","story-explorer","stories-map","memories","reels","events","saved-bookings","pricing","wallet"]'::jsonb
    END
    FROM public.site_settings WHERE id = 'default'
  ),
  'hidden', COALESCE((SELECT nav_order->'hidden' FROM public.site_settings WHERE id = 'default'), '[]'::jsonb)
)
WHERE id = 'default' AND (nav_order->'visible' IS NULL OR NOT (nav_order->'visible')::jsonb @> '["store"]'::jsonb);