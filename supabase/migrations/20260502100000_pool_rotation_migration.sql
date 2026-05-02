-- ============================================================
-- Migration: Stateful Pool Rotation
-- Date: 2026-05-02
-- Description:
--   Adds pool_data + last_refreshed_at columns to the existing
--   filter_results_cache table, and creates the new per-user
--   cursor table filter_results_user_cursors.
-- ============================================================

-- ── 1. Extend filter_results_cache ────────────────────────────────────────────
--
--  pool_data        : The FULL ~25-item pool returned by the Sub-API.
--                     (result_data is kept for backward compat and stores
--                      only the first page for legacy consumers.)
--  last_refreshed_at: Timestamp of the most recent Sub-API call that
--                      refreshed this pool row.
--
--  The unique constraint on filters_hash ensures one pool per filter combo.
--  We use ON CONFLICT … DO UPDATE for upserts so concurrent requests are safe.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.filter_results_cache
  add column if not exists pool_data         jsonb        not null default '[]'::jsonb,
  add column if not exists last_refreshed_at timestamptz  not null default now();

-- Unique constraint on filters_hash so we can use ON CONFLICT (filters_hash)
-- in upserts.  If it already exists this is a no-op.
do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'filter_results_cache_filters_hash_key'
      and  conrelid = 'public.filter_results_cache'::regclass
  ) then
    alter table public.filter_results_cache
      add constraint filter_results_cache_filters_hash_key unique (filters_hash);
  end if;
end;
$$;


-- ── 2. Create filter_results_user_cursors ─────────────────────────────────────
--
--  One row per (filters_hash, user_id) pair.
--  seen_indices  : integer[] of pool_data positions already served to this user.
--  expires_at    : 30-day TTL — long memory so users rarely repeat results.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.filter_results_user_cursors (
  id               bigserial    primary key,

  -- Links back to the shared pool in filter_results_cache.
  filters_hash     text         not null,

  -- The authenticated user this cursor belongs to.
  user_id          text         not null,

  -- Array of integer indices into filter_results_cache.pool_data that this
  -- user has already been shown.  Starts empty; grows with each request.
  seen_indices     integer[]    not null default '{}'::integer[],

  -- Bookkeeping
  created_at       timestamptz  not null default now(),
  expires_at       timestamptz  not null default (now() + interval '30 days'),
  last_accessed_at timestamptz  not null default now(),

  -- One cursor per (filters_hash, user) pair.
  constraint filter_results_user_cursors_uq unique (filters_hash, user_id)
);

-- Fast per-user lookup
create index if not exists idx_filter_user_cursors_user_hash
  on public.filter_results_user_cursors (user_id, filters_hash);

-- TTL cleanup
create index if not exists idx_filter_user_cursors_expires
  on public.filter_results_user_cursors (expires_at);

-- RLS: edge function uses service-role key → bypasses all policies.
-- Authenticated users can read their own cursor for transparency / debugging,
-- but writes are always done via the service key from the edge function.
alter table public.filter_results_user_cursors enable row level security;

create policy "service_role_all"
  on public.filter_results_user_cursors
  for all
  using (auth.role() = 'service_role');

create policy "user_read_own"
  on public.filter_results_user_cursors
  for select
  using (auth.uid()::text = user_id);


-- ── 3. Optional: pg_cron cleanup job ─────────────────────────────────────────
-- Uncomment and adjust the schedule if pg_cron is enabled on your project.
--
-- select cron.schedule(
--   'prune-filter-results-cache',
--   '0 3 * * *',        -- 03:00 UTC daily
--   $$
--     delete from public.filter_results_cache
--     where expires_at < now();
--
--     delete from public.filter_results_user_cursors
--     where expires_at < now();
--   $$
-- );
