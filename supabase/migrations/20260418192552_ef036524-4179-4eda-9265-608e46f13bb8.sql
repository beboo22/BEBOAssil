
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS serpapi_flights_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serpapi_hotels_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_serpapi_flight_searches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_serpapi_hotel_searches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_flight_results_per_search integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_hotel_results_per_search integer NOT NULL DEFAULT 12;
