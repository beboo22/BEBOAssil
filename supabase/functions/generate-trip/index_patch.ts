/**
 * index.ts  —  STATEFUL POOL ROTATION patch
 * ──────────────────────────────────────────────────────────────────────────────
 * INSTRUCTIONS
 * ──────────────────────────────────────────────────────────────────────────────
 * This file contains the TWO sections of index.ts that change.  All other code
 * (10 000+ lines) remains byte-for-byte identical.
 *
 * 1. Replace the import block near the very TOP of index.ts (the one that
 *    already imports from "./filterResultsCache.ts") with the block below
 *    labelled "SECTION 1 — Import".
 *
 * 2. Replace the entire Deno.serve(…) block at the BOTTOM of index.ts
 *    (from line 10327 to end of file) with the block labelled
 *    "SECTION 2 — Deno.serve handler".
 *
 * Deploy filterResultsCache.ts (the new full version) alongside index.ts.
 * Run the new SQL migration BEFORE deploying.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Import  (replaces the old import near the top of index.ts)
// ════════════════════════════════════════════════════════════════════════════

import {
  buildCacheIdentifiers,  // still exported; used nowhere in this file but kept for external callers
  canonicalJson,           // still exported; used in places_cache key building
  cryptoShuffle,           // used in local helpers below
  resolveWithCache,
  type Filters,
  type PoolRotationResult,
  // Backward-compat alias — old code that imported CacheLookupResult still compiles
  type CacheLookupResult,
} from "./filterResultsCache.ts";


// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Deno.serve handler
// (replaces the entire Deno.serve block at the bottom of index.ts)
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let requestData: any = {};
  let __tripFingerprint = "";
  let __generationSucceeded = false;

  try {
    requestData = await req.json();

    const {
      destination,
      departureCity,
      finalArrivalCity,
      duration,
      travelers,
      interests,
      additionalPreferences,
      startDate,
      endDate,
      cuisineTypes,
      regenMode,
    } = requestData;

    const authHeader = req.headers.get("authorization");
    const currentUserId = getUserIdFromAuthHeader(authHeader);

    // ── 1. Progress + Recovery setup ──────────────────────────────────────────
    __tripFingerprint = __buildTripRecoveryFingerprint(requestData);
    resetSerpRequestState(
      Array.isArray(interests) ? interests : [],
      currentUserId || null,
      typeof requestData?.guestId === "string" ? requestData.guestId : null,
      Number((requestData as any)?.variationSeed) || null,
    );
    setProgressToken((requestData as any)?.progressToken);
    emitProgress("prepare", 5, "request_received");

    // ── 2. "activity regen" fast path (unchanged from original) ───────────────
    if (regenMode === "activity") {
      emitProgress("generate", 30, "regen_activity");
      const result = await handleRegenActivity(requestData);
      emitProgress("save", 100, "ready");
      return jsonResponse(result);
    }

    // ── 3. Build normalised Filters for deterministic cache-key ───────────────
    //
    //  Rules for what goes into subApiFilters:
    //    ✓ Include semantically meaningful trip parameters.
    //    ✗ Exclude ephemeral / UX-only fields:
    //        progressToken, variationSeed, guestId, regenMode, lang, …
    //
    const subApiFilters: Filters = {
      destination:       destination,
      duration:          duration ?? null,
      // Sort arrays so {"interests":["art","food"]} ≡ {"interests":["food","art"]}
      interests:         [...(Array.isArray(interests) ? interests : [])].sort(),
      cuisineTypes:      [...(Array.isArray(cuisineTypes) ? cuisineTypes : [])].sort(),
      tripType:          requestData.tripType ?? null,
      activitiesPerDay:  requestData.activitiesPerDay ?? requestData.maxActivitiesPerDay ?? null,
      meals: {
        breakfast: !!(requestData.wantBreakfast ?? requestData.mealPreferences?.breakfast),
        lunch:     !!(requestData.wantLunch     ?? requestData.mealPreferences?.lunch),
        dinner:    !!(requestData.wantDinner    ?? requestData.mealPreferences?.dinner),
        snack:     !!(requestData.wantSnacks    ?? requestData.mealPreferences?.snacks),
      },
      multiCity: !!(requestData.multiCity),
      cities: Array.isArray(requestData.cities)
        ? requestData.cities.map((c: any) => ({ name: c.name, days: c.days }))
        : [],
    };

    // How many items the trip pipeline needs per request.
    // activitiesPerDay × duration gives an upper bound; pool rotation uses
    // DEFAULT_PAGE_SIZE (5) by default but respects the caller's request.
    const activitiesPerDay: number =
      Number(requestData.activitiesPerDay ?? requestData.maxActivitiesPerDay) || 5;
    const pageSize = activitiesPerDay;

    // ── 4. Resolve pool (Stateful Pool Rotation) ───────────────────────────────
    //
    //  fetcher()  is called only when:
    //    a) No shared pool exists yet for these filters  (pool miss)
    //    b) This user has already seen all items in the pool (pool exhausted)
    //
    //  In all other cases the user is served unseen items from the DB pool.
    //
    const fetcher = async (): Promise<unknown[]> => {
      emitProgress("generate", 18, "calling_sub_api");
      // `buildDynamicCityData` is the original function that calls SerpAPI /
      // AI to produce the full ~25-item pool for a destination.
      const pool = await buildDynamicCityData(
        destination,
        Array.isArray(cuisineTypes) && cuisineTypes.length > 0 ? cuisineTypes[0] : undefined,
        Array.isArray(interests) ? interests : [],
      );
      return Array.isArray(pool) ? pool : [];
    };

    emitProgress("prepare", 10, "checking_pool");

    let cacheResult: PoolRotationResult<unknown>;

    if (currentUserId) {
      cacheResult = await resolveWithCache<unknown>(subApiFilters, currentUserId, fetcher, { pageSize });
    } else {
      // Guest / unauthenticated: always call the Sub-API fresh; no DB writes.
      const freshPool = await fetcher();
      cacheResult = {
        source: "fresh_pool_miss",
        items: freshPool.slice(0, pageSize),
        remainingUnseen: Math.max(0, freshPool.length - pageSize),
        filtersHash: "",
      };
    }

    console.log(
      `[PoolRotation] source=${cacheResult.source} ` +
      `user=${currentUserId?.slice(0, 8) ?? "guest"} ` +
      `dest=${destination} ` +
      `items=${cacheResult.items.length} ` +
      `remaining=${cacheResult.remainingUnseen}`,
    );

    emitProgress("generate", 30, "building_itinerary");

    // ── 5. Build the full itinerary using the page of results ──────────────────
    //
    //  `cacheResult.items` is the current page of unseen, cryptoShuffled items.
    //  Pass them into createFallbackItinerary / the main generation pipeline
    //  exactly as `dynamicCityData` was used before.
    //
    const preferenceFlags = extractPreferences(interests, additionalPreferences, cuisineTypes);

    let finalItinerary = await createFallbackItinerary({
      ...requestData,
      dynamicCityData: cacheResult.items,
      preferenceFlags,
    });

    emitProgress("enrich", 65, "enriching_activities");

    // ── 6. Booking enrichment (hotels + flights) ───────────────────────────────
    const bookingPrefs: BookingPrefs = {
      wantHotel:          !!(requestData.wantHotel),
      wantFlight:         !!(requestData.wantFlight),
      accommodationType:  requestData.accommodationType,
      hotelStarRating:    Number(requestData.hotelStarRating) || 0,
      maxBudgetPerNight:  Number(requestData.maxBudgetPerNight) || 0,
      maxBudgetPerFlight: Number(requestData.maxBudgetPerFlight) || 0,
      currency:           requestData.currency || "USD",
      travelers:          Number(requestData.travelers) || 2,
      children:           Number(requestData.children) || 0,
      flightTripType:     requestData.flightTripType || "round",
      startDate:          startDate || "",
      endDate:            endDate,
    };

    if (!shouldUseActivitiesOnlyMode(interests, additionalPreferences)) {
      await enrichItineraryWithBookings(
        finalItinerary,
        Array.isArray(requestData.cityLegs) ? requestData.cityLegs : [],
        bookingPrefs,
        destination,
        departureCity,
        finalArrivalCity,
      );
    }

    // ── 7. Success — persist recovery snapshot and respond ────────────────────
    __generationSucceeded = true;
    if (__tripFingerprint) __writeTripRecoveryCache(__tripFingerprint, finalItinerary).catch(() => {});

    emitProgress("save", 100, "ready");

    return jsonResponse({
      ...finalItinerary,
      // Expose cache metadata so the frontend can surface "new results" vs
      // "from your personalised pool" messaging if desired.
      _cacheSource:    cacheResult.source,
      _remainingUnseen: cacheResult.remainingUnseen,
    });

  } catch (err) {
    console.error("[generate-trip] unhandled error:", String(err));

    // Last-resort: try to serve the most recent successful snapshot for this
    // exact trip configuration so the user is never left with a blank screen.
    if (__tripFingerprint && !__generationSucceeded) {
      try {
        const recovered = await __readTripRecoveryCache(__tripFingerprint);
        if (recovered) {
          console.log("[generate-trip] serving recovery snapshot");
          return jsonResponse({ ...recovered, _recovered: true });
        }
      } catch { /* noop */ }
    }

    return jsonResponse({ error: String(err) }, 500);
  }
});