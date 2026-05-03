/**
 * filterResultsCache.ts  —  Stateful Pool Rotation Cache  (v2)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURE
 * ────────────
 *  Shared Pool Table  (filter_results_cache)
 *    One row per unique `filters_hash` (SHA-256 of canonical JSON of filters).
 *    Stores the FULL ~25-item pool returned by the Sub-API.
 *    Any user's call can seed it; all users share it.
 *
 *  Per-User Cursor Table  (filter_results_user_cursors)
 *    One row per (filters_hash, user_id) pair.
 *    Tracks the indices into pool_data the user has already been shown.
 *
 * ROTATION RULES
 * ──────────────
 *  1. Pool MISS  (nobody has fetched these filters yet)
 *     → Call Sub-API, store full pool, serve first PAGE_SIZE items,
 *       mark them as seen in this user's cursor row.
 *
 *  2. Pool HIT — user has unseen items remaining
 *     → cryptoShuffle the unseen indices, take PAGE_SIZE, update cursor.
 *
 *  3. Pool HIT — user has seen all items (pool exhausted for this user)
 *     → Call Sub-API for a fresh pool, replace shared pool, reset cursor,
 *       serve first PAGE_SIZE items.
 *
 *  4. Cross-user diversity
 *     → Each user has an independent cursor so User B's first page is a
 *       cryptoShuffled subset that does NOT follow the same path as User A's.
 *
 * PAGE_SIZE is configurable (default 5).
 *
 * SQL (run once in Supabase SQL editor):
 * ───────────────────────────────────────
 *  -- Shared pool table
 *  CREATE TABLE IF NOT EXISTS filter_results_cache (
 *    id               bigserial PRIMARY KEY,
 *    filters_hash     text        NOT NULL UNIQUE,
 *    owner_user_id    uuid,
 *    filters_payload  jsonb,
 *    pool_data        jsonb       NOT NULL DEFAULT '[]',
 *    result_data      jsonb       NOT NULL DEFAULT '[]',  -- compat: first 5 items
 *    expires_at       timestamptz NOT NULL,
 *    created_at       timestamptz NOT NULL DEFAULT now(),
 *    last_refreshed_at timestamptz NOT NULL DEFAULT now(),
 *    last_accessed_at  timestamptz NOT NULL DEFAULT now()
 *  );
 *  CREATE INDEX IF NOT EXISTS idx_frc_hash ON filter_results_cache(filters_hash);
 *
 *  -- Per-user cursor table
 *  CREATE TABLE IF NOT EXISTS filter_results_user_cursors (
 *    id              bigserial PRIMARY KEY,
 *    filters_hash    text        NOT NULL,
 *    user_id         uuid        NOT NULL,
 *    seen_indices    integer[]   NOT NULL DEFAULT '{}',
 *    expires_at      timestamptz NOT NULL,
 *    last_accessed_at timestamptz NOT NULL DEFAULT now(),
 *    UNIQUE(filters_hash, user_id)
 *  );
 *  CREATE INDEX IF NOT EXISTS idx_fruc_hash_user
 *    ON filter_results_user_cursors(filters_hash, user_id);
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Filters = Record<string, unknown>;

export type CacheSource =
  | "fresh_pool_miss"       // Sub-API called; new pool created (no prior pool)
  | "fresh_pool_exhausted"  // Sub-API called; user exhausted previous pool
  | "pool_rotation"         // Served from existing pool — user had unseen items
  | "fallback_direct";      // Cache layer errored; direct Sub-API call

export interface PoolRotationResult<T = unknown> {
  /** Where the items came from. */
  source: CacheSource;
  /** The current page of items (up to PAGE_SIZE). */
  items: T[];
  /** How many items remain unseen in the pool after this response. */
  remainingUnseen: number;
  /** SHA-256 hex of the canonical filters JSON (useful for client-side dedup). */
  filtersHash: string;
}

// Backward-compat alias — old code that imported CacheLookupResult still compiles.
export type CacheLookupResult<T = unknown> = PoolRotationResult<T>;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Items to serve per request ("one page"). */
const DEFAULT_PAGE_SIZE = 5;

/** Pool TTL: 7 days. */
const POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cursor TTL: 30 days — long memory of what each user has seen. */
const CURSOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Crypto Helpers ──────────────────────────────────────────────────────────

/**
 * Produce a stable JSON string regardless of key insertion order.
 * Nested objects are recursively sorted; arrays preserve their order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
    );
  return "{" + sorted.join(",") + "}";
}

/** SHA-256 hex digest using the Web Crypto API (Deno + modern browsers). */
export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the two stable identifiers used throughout the caching system.
 *
 * @param filters  Serialisable filter object (key order does not matter).
 * @param userId   Authenticated user UUID.
 * @returns
 *   filtersHash  — Hash of ONLY the filters (no userId). Identifies the shared pool.
 *   cacheKey     — Hash of filters + userId. Identifies the user's cursor row.
 */
export async function buildCacheIdentifiers(
  filters: Filters,
  userId: string,
): Promise<{ filtersHash: string; cacheKey: string }> {
  const canonical = canonicalJson(filters);
  const filtersHash = await sha256Hex(canonical);
  const cacheKey = await sha256Hex(canonical + "|" + userId);
  return { filtersHash, cacheKey };
}

/**
 * Fisher-Yates shuffle using `crypto.getRandomValues` for true randomness.
 * Returns a new array; the input is never mutated.
 */
export function cryptoShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Supabase REST helpers ────────────────────────────────────────────────────

function supabaseHeaders(serviceKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Prefer: "return=representation",
  };
}

// ── Shared pool ───────────────────────────────────────────────────────────────

interface PoolRow {
  id: number;
  filters_hash: string;
  pool_data: unknown[];
  expires_at: string;
  created_at: string;
  last_refreshed_at: string;
}

async function readPool(
  supabaseUrl: string,
  serviceKey: string,
  filtersHash: string,
): Promise<PoolRow | null> {
  try {
    const url =
      `${supabaseUrl}/rest/v1/filter_results_cache` +
      `?filters_hash=eq.${encodeURIComponent(filtersHash)}` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id,filters_hash,pool_data,expires_at,created_at,last_refreshed_at` +
      `&limit=1`;
    const resp = await fetch(url, { headers: supabaseHeaders(serviceKey) });
    if (!resp.ok) return null;
    const rows: PoolRow[] = await resp.json();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function upsertPool(
  supabaseUrl: string,
  serviceKey: string,
  filtersHash: string,
  ownerUserId: string,
  filtersPayload: Filters,
  poolData: unknown[],
): Promise<void> {
  const now = new Date();
  const body = {
    filters_hash: filtersHash,
    owner_user_id: ownerUserId,
    filters_payload: filtersPayload,
    pool_data: poolData,
    // Backward-compat: keep result_data as first PAGE_SIZE items.
    result_data: poolData.slice(0, DEFAULT_PAGE_SIZE),
    expires_at: new Date(now.getTime() + POOL_TTL_MS).toISOString(),
    last_refreshed_at: now.toISOString(),
    last_accessed_at: now.toISOString(),
  };
  await fetch(
    `${supabaseUrl}/rest/v1/filter_results_cache` +
      `?on_conflict=filters_hash&resolution=merge-duplicates`,
    {
      method: "POST",
      headers: supabaseHeaders(serviceKey),
      body: JSON.stringify(body),
    },
  ).catch(() => {});
}

// ── Per-user cursor ───────────────────────────────────────────────────────────

interface CursorRow {
  id: number;
  filters_hash: string;
  user_id: string;
  seen_indices: number[];
  expires_at: string;
}

async function readCursor(
  supabaseUrl: string,
  serviceKey: string,
  filtersHash: string,
  userId: string,
): Promise<CursorRow | null> {
  try {
    const url =
      `${supabaseUrl}/rest/v1/filter_results_user_cursors` +
      `?filters_hash=eq.${encodeURIComponent(filtersHash)}` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      `&select=id,filters_hash,user_id,seen_indices,expires_at` +
      `&limit=1`;
    const resp = await fetch(url, { headers: supabaseHeaders(serviceKey) });
    if (!resp.ok) return null;
    const rows: CursorRow[] = await resp.json();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function upsertCursor(
  supabaseUrl: string,
  serviceKey: string,
  filtersHash: string,
  userId: string,
  seenIndices: number[],
): Promise<void> {
  const body = {
    filters_hash: filtersHash,
    user_id: userId,
    seen_indices: seenIndices,
    expires_at: new Date(Date.now() + CURSOR_TTL_MS).toISOString(),
    last_accessed_at: new Date().toISOString(),
  };
  await fetch(
    `${supabaseUrl}/rest/v1/filter_results_user_cursors` +
      `?on_conflict=filters_hash,user_id&resolution=merge-duplicates`,
    {
      method: "POST",
      headers: supabaseHeaders(serviceKey),
      body: JSON.stringify(body),
    },
  ).catch(() => {});
}

// ─── Core rotation logic ──────────────────────────────────────────────────────

/**
 * Pick `pageSize` unseen items from `pool` given the already-seen index set.
 *
 * Strategy:
 *   1. Build the list of unseen indices, cryptoShuffle it (cross-user diversity).
 *   2. Take the first `pageSize` entries.
 *   3. Return items + the new merged seen-index set.
 */
function pickUnseenPage<T>(
  pool: T[],
  seenIndices: number[],
  pageSize: number,
): { page: T[]; newSeenIndices: number[]; remainingUnseen: number } {
  const seenSet = new Set(seenIndices);
  const unseenIndices = pool
    .map((_, i) => i)
    .filter((i) => !seenSet.has(i));

  // cryptoShuffle so concurrent users see a different order.
  const shuffledUnseen = cryptoShuffle(unseenIndices);
  const pickedIndices = shuffledUnseen.slice(0, pageSize);
  const page = pickedIndices.map((i) => pool[i]);
  const newSeenIndices = Array.from(new Set([...seenIndices, ...pickedIndices]));
  const remainingUnseen = Math.max(0, shuffledUnseen.length - pickedIndices.length);
  return { page, newSeenIndices, remainingUnseen };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Resolves a "page" of results using the Stateful Pool
 * Rotation strategy.
 *
 * @param filters   Normalised filter payload (key order doesn't matter).
 * @param userId    Authenticated user UUID. Pass null for guests (always fresh).
 * @param fetcher   Callback that calls the Sub-API and returns the FULL pool
 *                  (~20-25 items). Only invoked when the pool is missing or
 *                  exhausted for this user.
 * @param opts      Optional overrides.
 */
export async function resolveWithCache<T = unknown>(
  filters: Filters,
  userId: string | null,
  fetcher: () => Promise<T[]>,
  opts?: {
    supabaseUrl?: string;
    serviceKey?: string;
    skipCache?: boolean;
    /** Number of items to return per call (default 5). */
    pageSize?: number;
  },
): Promise<PoolRotationResult<T>> {
  const supabaseUrl =
    opts?.supabaseUrl ??
    (typeof Deno !== "undefined" ? Deno.env.get("SUPABASE_URL") ?? "" : "");
  const serviceKey =
    opts?.serviceKey ??
    (typeof Deno !== "undefined"
      ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      : "");
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;

  const { filtersHash } = await buildCacheIdentifiers(filters, userId ?? "guest");

  // ── Bypass: no userId, skipCache=true, or missing env vars ──────────────────
  if (!userId || opts?.skipCache || !supabaseUrl || !serviceKey) {
    const freshPool = await fetcher();
    const shuffled = cryptoShuffle(freshPool);
    return {
      source: "fresh_pool_miss",
      items: shuffled.slice(0, pageSize),
      remainingUnseen: Math.max(0, shuffled.length - pageSize),
      filtersHash,
    };
  }

  try {
    // ── STEP 1: Read the shared pool from DB ──────────────────────────────────
    const poolRow = await readPool(supabaseUrl, serviceKey, filtersHash);

    // ── STEP 2: Read this user's cursor ───────────────────────────────────────
    const cursorRow = await readCursor(supabaseUrl, serviceKey, filtersHash, userId);
    const seenIndices: number[] = cursorRow?.seen_indices ?? [];

    // ── STEP 3: Decide whether we need a fresh Sub-API call ───────────────────
    let pool: T[];
    let cacheSource: CacheSource;

    const poolExists =
      poolRow !== null &&
      Array.isArray(poolRow.pool_data) &&
      poolRow.pool_data.length > 0;
    const seenAll = poolExists && seenIndices.length >= poolRow!.pool_data.length;

    if (!poolExists || seenAll) {
      // Pool is missing or this user has exhausted it → fetch fresh.
      cacheSource = poolExists ? "fresh_pool_exhausted" : "fresh_pool_miss";
      console.log(
        `[PoolRotation] ${cacheSource} — calling Sub-API for user=${userId.slice(0, 8)} hash=${filtersHash.slice(0, 12)}`,
      );
      const freshPool = await fetcher();
      pool = freshPool;

      // Persist the new pool (fire-and-forget).
      upsertPool(supabaseUrl, serviceKey, filtersHash, userId, filters, freshPool).catch(() => {});

      // Reset cursor since this is a fresh pool.
      const { page, newSeenIndices, remainingUnseen } = pickUnseenPage(pool, [], pageSize);
      upsertCursor(supabaseUrl, serviceKey, filtersHash, userId, newSeenIndices).catch(() => {});

      return { source: cacheSource, items: page, remainingUnseen, filtersHash };
    }

    // ── STEP 4: Pool HIT — serve unseen items from the existing pool ──────────
    pool = poolRow!.pool_data as T[];
    cacheSource = "pool_rotation";

    const { page, newSeenIndices, remainingUnseen } = pickUnseenPage(pool, seenIndices, pageSize);

    console.log(
      `[PoolRotation] pool_rotation — user=${userId.slice(0, 8)} hash=${filtersHash.slice(0, 12)} ` +
        `seen=${seenIndices.length}/${pool.length} serving=${page.length} remaining=${remainingUnseen}`,
    );

    // Persist updated cursor (fire-and-forget).
    upsertCursor(supabaseUrl, serviceKey, filtersHash, userId, newSeenIndices).catch(() => {});

    return { source: cacheSource, items: page, remainingUnseen, filtersHash };
  } catch (err) {
    // The cache layer must NEVER crash the main pipeline.
    console.warn("[PoolRotation] error — falling back to direct Sub-API call:", String(err));
    const freshPool = await fetcher();
    const shuffled = cryptoShuffle(freshPool);
    return {
      source: "fallback_direct",
      items: shuffled.slice(0, pageSize),
      remainingUnseen: Math.max(0, shuffled.length - pageSize),
      filtersHash,
    };
  }
}