-- Add indexes to improve trip caching lookups
CREATE INDEX IF NOT EXISTS idx_saved_trips_destination ON public.saved_trips (destination);
CREATE INDEX IF NOT EXISTS idx_travel_stories_location_name ON public.travel_stories (location_name);

-- GIN index for JSONB content if we want to search by category or interests inside trip_data
-- CREATE INDEX IF NOT EXISTS idx_saved_trips_data_gin ON public.saved_trips USING GIN (trip_data);
