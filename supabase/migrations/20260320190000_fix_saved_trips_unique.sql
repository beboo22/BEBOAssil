-- Add unique constraint on (user_id, trip_id) so upsert works correctly
ALTER TABLE public.saved_trips
  DROP CONSTRAINT IF EXISTS saved_trips_user_id_trip_id_key;

ALTER TABLE public.saved_trips
  ADD CONSTRAINT saved_trips_user_id_trip_id_key UNIQUE (user_id, trip_id);
