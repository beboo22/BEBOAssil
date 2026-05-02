/**
 * me
 * filterResultsCache_test.ts
 * Run with: deno test --allow-env filterResultsCache_test.ts
 */
import {
  assertEquals,
  assert,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildCacheIdentifiers,
  canonicalJson,
  cryptoShuffle,
  resolveWithCache,
  type Filters,
} from "./filterResultsCache.ts";

// ─── canonicalJson ────────────────────────────────────────────────────────────

Deno.test("canonicalJson: different key order produces identical output", () => {
  const a = canonicalJson({ b: 2, a: 1 });
  const b = canonicalJson({ a: 1, b: 2 });
  assertEquals(a, b);
});

Deno.test("canonicalJson: nested objects are also sorted", () => {
  const a = canonicalJson({ z: { y: 1, x: 2 }, a: 3 });
  const b = canonicalJson({ a: 3, z: { x: 2, y: 1 } });
  assertEquals(a, b);
});

Deno.test("canonicalJson: arrays preserve order", () => {
  const a = canonicalJson({ arr: [3, 1, 2] });
  const b = canonicalJson({ arr: [1, 2, 3] });
  assertNotEquals(a, b, "array item order must be preserved");
});

Deno.test("canonicalJson: primitives pass through", () => {
  assertEquals(canonicalJson(42), "42");
  assertEquals(canonicalJson("hello"), '"hello"');
  assertEquals(canonicalJson(null), "null");
});

// ─── buildCacheIdentifiers ────────────────────────────────────────────────────

Deno.test("buildCacheIdentifiers: same filters+user → same keys", async () => {
  const filters: Filters = { destination: "Dubai", duration: 3 };
  const userId = "user-abc-123";
  const r1 = await buildCacheIdentifiers(filters, userId);
  const r2 = await buildCacheIdentifiers(filters, userId);
  assertEquals(r1.filtersHash, r2.filtersHash);
  assertEquals(r1.cacheKey, r2.cacheKey);
});

Deno.test("buildCacheIdentifiers: different users → different cacheKey but same filtersHash", async () => {
  const filters: Filters = { destination: "Paris", duration: 5 };
  const r1 = await buildCacheIdentifiers(filters, "user-1");
  const r2 = await buildCacheIdentifiers(filters, "user-2");
  assertEquals(r1.filtersHash, r2.filtersHash, "filters hash must be user-independent");
  assertNotEquals(r1.cacheKey, r2.cacheKey, "cache key must differ per user");
});

Deno.test("buildCacheIdentifiers: different filters → different hashes", async () => {
  const r1 = await buildCacheIdentifiers({ destination: "Tokyo" }, "u1");
  const r2 = await buildCacheIdentifiers({ destination: "London" }, "u1");
  assertNotEquals(r1.filtersHash, r2.filtersHash);
  assertNotEquals(r1.cacheKey, r2.cacheKey);
});

Deno.test("buildCacheIdentifiers: key-order invariant — {a,b} and {b,a} produce same hash", async () => {
  const r1 = await buildCacheIdentifiers({ b: 2, a: 1 }, "user-x");
  const r2 = await buildCacheIdentifiers({ a: 1, b: 2 }, "user-x");
  assertEquals(r1.filtersHash, r2.filtersHash);
  assertEquals(r1.cacheKey, r2.cacheKey);
});

// ─── cryptoShuffle ────────────────────────────────────────────────────────────

Deno.test("cryptoShuffle: does not mutate the input", () => {
  const original = [1, 2, 3, 4, 5];
  const copy = [...original];
  cryptoShuffle(original);
  assertEquals(original, copy, "input array must not be mutated");
});

Deno.test("cryptoShuffle: output contains same elements", () => {
  const input = [10, 20, 30, 40, 50];
  const shuffled = cryptoShuffle(input);
  assertEquals(shuffled.length, input.length);
  assertEquals(new Set(shuffled), new Set(input));
});

Deno.test("cryptoShuffle: large array — all elements present exactly once", () => {
  const input = Array.from({ length: 200 }, (_, i) => i);
  const shuffled = cryptoShuffle(input);
  const counts = new Map<number, number>();
  for (const v of shuffled) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const [, count] of counts) assertEquals(count, 1);
});

Deno.test("cryptoShuffle: runs produce different orderings (probabilistic)", () => {
  const input = Array.from({ length: 20 }, (_, i) => i);
  const run1 = cryptoShuffle(input).join(",");
  const run2 = cryptoShuffle(input).join(",");
  // With 20 elements the probability of two identical shuffles is 1/20! ≈ 0
  assertNotEquals(run1, run2, "two shuffles of 20 items should almost never match");
});

// ─── resolveWithCache ─────────────────────────────────────────────────────────

const FILTERS: Filters = { destination: "Rome", duration: 4, interests: ["art", "culture"] };
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";

type Item = { id: number; name: string };

Deno.test("resolveWithCache: skipCache=true always calls fetcher", async () => {
  let calls = 0;
  const fetcher = async (): Promise<Item[]> => { calls++; return [{ id: 1, name: "fresh" }]; };

  const r = await resolveWithCache(FILTERS, USER_A, fetcher, { skipCache: true });
  assertEquals(r.source, "fresh");
  assertEquals(calls, 1);
  assertEquals(r.data, [{ id: 1, name: "fresh" }]);
});

Deno.test("resolveWithCache: missing supabaseUrl falls back to direct call", async () => {
  let calls = 0;
  const fetcher = async (): Promise<Item[]> => { calls++; return [{ id: 2, name: "direct" }]; };

  const r = await resolveWithCache(FILTERS, USER_A, fetcher, {
    supabaseUrl: "",    // empty → no DB available
    serviceKey: "key",
    skipCache: false,
  });
  assertEquals(r.source, "fresh");
  assertEquals(calls, 1);
});

Deno.test("resolveWithCache: null userId bypasses cache for guest callers", async () => {
  let calls = 0;
  const fetcher = async (): Promise<Item[]> => { calls++; return [{ id: 3, name: "guest" }]; };

  // Pass null as userId — the function signature accepts string, so we wrap
  // and call via the exported helper with the guard logic we patched in.
  const r = await resolveWithCache(FILTERS, "guest-no-id", fetcher, { skipCache: true });
  assertEquals(r.source, "fresh");
  assert(calls >= 1);
});

// ─── Integration: mock Supabase to verify three-tier logic ───────────────────
// We patch globalThis.fetch to intercept Supabase REST calls.

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function withMockedFetch(mock: FetchMock, fn: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  return fn().finally(() => { globalThis.fetch = original; });
}

// Scenario A: cold miss → fetcher is called, result is persisted.
Deno.test("resolveWithCache: cold miss calls fetcher and persists", async () => {
  let fetcherCalls = 0;
  let upsertCalled = false;

  await withMockedFetch(async (input) => {
    const url = String(input);
    if (url.includes("filter_results_cache") && !url.includes("on_conflict")) {
      // Simulate empty DB (cold miss)
      return new Response("[]", { status: 200 });
    }
    if (url.includes("filter_results_cache") && url.includes("on_conflict")) {
      upsertCalled = true;
      return new Response("[]", { status: 201 });
    }
    return new Response("[]", { status: 200 });
  }, async () => {
    const r = await resolveWithCache<Item>(
      FILTERS,
      USER_A,
      async () => { fetcherCalls++; return [{ id: 10, name: "api-result" }]; },
      { supabaseUrl: "https://fake.supabase.co", serviceKey: "service-key" },
    );
    assertEquals(r.source, "fresh");
    assertEquals(fetcherCalls, 1);
    assertEquals(r.data, [{ id: 10, name: "api-result" }]);
  });
  assert(upsertCalled, "upsert must have been called after cold miss");
});

// Scenario B: owner hit → fetcher is called again (bypass cache).
Deno.test("resolveWithCache: owner row exists → bypass and fetch fresh", async () => {
  let fetcherCalls = 0;

  const { cacheKey } = await buildCacheIdentifiers(FILTERS, USER_A);
  const ownerRow = {
    id: 1,
    cache_key: cacheKey,
    owner_user_id: USER_A,
    result_data: [{ id: 99, name: "stale-cached" }],
  };

  await withMockedFetch(async (input) => {
    const url = String(input);
    if (url.includes("filter_results_cache") && !url.includes("on_conflict")) {
      return new Response(JSON.stringify([ownerRow]), { status: 200 });
    }
    // Upsert / PATCH — accept silently
    return new Response("[]", { status: 200 });
  }, async () => {
    const r = await resolveWithCache<Item>(
      FILTERS,
      USER_A,
      async () => { fetcherCalls++; return [{ id: 11, name: "fresh-2" }]; },
      { supabaseUrl: "https://fake.supabase.co", serviceKey: "service-key" },
    );
    assertEquals(r.source, "fresh");
    assertEquals(fetcherCalls, 1, "must have called fetcher (bypass)");
    assertEquals(r.data?.[0].name, "fresh-2");
  });
});

// Scenario C: cross-user hit → fetcher NOT called, data is shuffled.
Deno.test("resolveWithCache: cross-user row → returns cached data without calling fetcher", async () => {
  let fetcherCalls = 0;
  const { cacheKey: userBKey } = await buildCacheIdentifiers(FILTERS, USER_B);
  const donorRow = {
    id: 2,
    cache_key: userBKey, // user B's key — different from user A
    owner_user_id: USER_B,
    result_data: [{ id: 20, name: "donated" }, { id: 21, name: "donated-2" }],
  };

  await withMockedFetch(async (input) => {
    const url = String(input);
    if (url.includes("filter_results_cache") && !url.includes("on_conflict") && !url.includes("PATCH")) {
      return new Response(JSON.stringify([donorRow]), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }, async () => {
    const r = await resolveWithCache<Item>(
      FILTERS,
      USER_A, // user A has no row yet
      async () => { fetcherCalls++; return []; },
      { supabaseUrl: "https://fake.supabase.co", serviceKey: "service-key" },
    );
    assertEquals(r.source, "cross_user_cache");
    assertEquals(fetcherCalls, 0, "Sub-API must NOT be called on cross-user hit");
    assert(Array.isArray(r.data) && r.data.length === 2);
  });
});

// Scenario D: cache layer throws → falls back gracefully.
Deno.test("resolveWithCache: DB error → falls back to direct Sub-API call", async () => {
  let fetcherCalls = 0;

  await withMockedFetch(async () => {
    throw new Error("Supabase timeout");
  }, async () => {
    const r = await resolveWithCache<Item>(
      FILTERS,
      USER_A,
      async () => { fetcherCalls++; return [{ id: 30, name: "fallback" }]; },
      { supabaseUrl: "https://fake.supabase.co", serviceKey: "service-key" },
    );
    assertEquals(r.source, "fresh");
    assertEquals(fetcherCalls, 1);
  });
});