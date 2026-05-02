-- ============================================================
-- filter_results_cache
-- Stores Sub-API results keyed by a deterministic hash of the
-- user's Filters payload.  Multiple users can share the same
-- Filters row; the owner_user_id column records who originally
-- fetched the data so the caching rules can be applied:
--
--   • Same user + same filters  → bypass cache (fetch fresh)
--   • Different user + same filters → serve cached rows
--     (randomly ordered per request for UX variety)
-- ============================================================

create table if not exists public.filter_results_cache (
  id               bigserial    primary key,

  -- SHA-256 hex of the canonical JSON of the Filters object.
  -- Indexed for O(1) lookups.
  filters_hash     text         not null,

  -- The user whose Sub-API call produced this row.
  owner_user_id    text         not null,

  -- Raw Filters payload stored for debugging / introspection.
  filters_payload  jsonb        not null default '{}'::jsonb,

  -- The result data returned by the Sub-API.
  result_data      jsonb        not null default '[]'::jsonb,

  -- Bookkeeping
  hit_count        integer      not null default 0,
  created_at       timestamptz  not null default now(),
  expires_at       timestamptz  not null default (now() + interval '7 days'),
  last_accessed_at timestamptz  not null default now()
);

-- Fast lookup by hash
create index if not exists idx_filter_results_cache_hash
  on public.filter_results_cache (filters_hash);

-- Support "same hash, different owner" query
create index if not exists idx_filter_results_cache_hash_owner
  on public.filter_results_cache (filters_hash, owner_user_id);

-- TTL cleanup helper (call from a cron job or pg_cron)
create index if not exists idx_filter_results_cache_expires
  on public.filter_results_cache (expires_at);

-- Row-level security: service-role key bypasses everything;
-- anon/authenticated roles only read their own rows (write is
-- done exclusively via the edge function with the service key).
alter table public.filter_results_cache enable row level security;

create policy "service_role_all"
  on public.filter_results_cache
  for all
  using (auth.role() = 'service_role');