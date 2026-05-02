// Hybrid city search: local world_cities table first, Photon (OSM) fallback
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CityResult {
  name: string;
  name_ar?: string | null;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  population?: number;
  source: 'local' | 'photon';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 50);
    const lang = url.searchParams.get('lang') || 'en';

    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const isArabic = /[\u0600-\u06FF]/.test(q);
    const results: CityResult[] = [];

    // Tier ranking (language-agnostic, based on country code + canonical English name):
    //  1 = globally famous tourist cities (NO Arab cities except Dubai)
    //  2 = Europe / Americas
    //  3 = Arab world
    //  4 = other (alphabetical)
    const TIER1_FAMOUS = new Set<string>([
      // Europe — flagship tourist hubs
      'paris','london','rome','barcelona','madrid','amsterdam','venice','florence','milan','prague',
      'vienna','berlin','munich','lisbon','porto','athens','santorini','mykonos','dublin','edinburgh',
      'brussels','bruges','budapest','warsaw','krakow','copenhagen','stockholm','oslo','helsinki','reykjavik',
      'zurich','geneva','interlaken','lucerne','nice','cannes','marseille','seville','granada','valencia',
      'naples','verona','dubrovnik','split','santorini','heraklion','istanbul','antalya','cappadocia','bodrum',
      // Asia / Pacific — flagship tourist hubs
      'tokyo','kyoto','osaka','hokkaido','seoul','busan','beijing','shanghai','hong kong','macau',
      'taipei','singapore','bangkok','phuket','chiang mai','pattaya','bali','jakarta','kuala lumpur','siem reap',
      'hanoi','ho chi minh city','mumbai','new delhi','delhi','jaipur','agra','goa','colombo','male',
      'kathmandu','sydney','melbourne','auckland','queenstown','fiji','tahiti',
      // North America — flagship tourist hubs
      'new york','los angeles','san francisco','las vegas','miami','orlando','chicago','washington','boston','seattle',
      'honolulu','san diego','new orleans','austin','toronto','vancouver','montreal','quebec city','niagara falls',
      // Latin America — flagship tourist hubs
      'mexico city','cancun','tulum','playa del carmen','rio de janeiro','sao paulo','buenos aires','cusco','machu picchu','lima',
      'santiago','cartagena','havana','san jose','panama city',
      // Africa — flagship tourist hubs (NO Arab cities here)
      'cape town','nairobi','zanzibar','victoria falls','kruger',
      // Middle East — only Dubai (per requirement)
      'dubai',
    ]);
    const TIER2_EU_AM_COUNTRIES = new Set<string>([
      // Europe
      'FR','GB','DE','IT','ES','PT','NL','BE','CH','AT','SE','NO','DK','FI','IE','PL','CZ','HU','GR','RO',
      'BG','HR','SK','SI','EE','LV','LT','IS','LU','MT','CY','RU','UA','TR','RS','BA','MK','AL','MD','BY',
      // Americas
      'US','CA','MX','BR','AR','CL','CO','PE','VE','UY','EC','BO','PY','CR','PA','DO','CU','GT','HN','SV','NI','PR',
    ]);
    const TIER3_ARAB_COUNTRIES = new Set<string>([
      'SA','AE','QA','KW','BH','OM','YE','JO','LB','SY','IQ','PS','EG','SD','LY','TN','DZ','MA','MR','SO','DJ','KM',
    ]);
    const tierOf = (name: string, cc: string): number => {
      const n = (name || '').toLowerCase().trim();
      // Dubai exception: famous Arab city allowed in tier 1
      if (n === 'dubai') return 1;
      // Other Arab cities are NEVER tier 1 (even if their name accidentally appears in famous list)
      if (TIER3_ARAB_COUNTRIES.has(cc)) return 3;
      if (TIER1_FAMOUS.has(n)) return 1;
      if (TIER2_EU_AM_COUNTRIES.has(cc)) return 2;
      return 4;
    };

    // Sanitize query: take only the first token before comma (e.g. "Mecca, Saudi Arabia" -> "Mecca")
    // and escape PostgREST .or() reserved chars: , ( ) .
    const cleanQ = q.split(',')[0].trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
    const safeQ = cleanQ.replace(/[%_*]/g, ''); // strip wildcards user might inject

    // 1) Local search via trigram similarity, ordered by population
    let query = supabase
      .from('world_cities')
      .select('name, ascii_name, name_ar, country_code, country_name, latitude, longitude, population')
      .order('population', { ascending: false })
      .limit(limit);

    if (isArabic) {
      query = query.or(`name_ar.ilike.%${safeQ}%,alt_names.ilike.%${safeQ}%`);
    } else {
      query = query.or(`ascii_name.ilike.${safeQ}%,name.ilike.${safeQ}%,ascii_name.ilike.%${safeQ}%`);
    }

    const { data: localData, error: localErr } = await query;
    if (localErr) console.error('Local search error:', localErr);

    if (localData) {
      for (const r of localData) {
        results.push({
          name: r.name,
          name_ar: r.name_ar,
          country: r.country_name,
          country_code: r.country_code,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          population: r.population,
          source: 'local',
        });
      }
    }

    // 2) Photon fallback if results too few
    if (results.length < 3) {
      try {
        const photonUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=${limit}&osm_tag=place:city&osm_tag=place:town&lang=${lang === 'ar' ? 'default' : lang}`;
        const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(4000) });
        if (photonRes.ok) {
          const photonData = await photonRes.json();
          const seen = new Set(results.map(r => `${r.name}|${r.country_code}`));
          for (const f of photonData.features || []) {
            const p = f.properties;
            const name = p.name;
            const cc = p.countrycode || '';
            const key = `${name}|${cc}`;
            if (!name || seen.has(key)) continue;
            seen.add(key);
            results.push({
              name,
              country: p.country || cc,
              country_code: cc,
              latitude: f.geometry.coordinates[1],
              longitude: f.geometry.coordinates[0],
              source: 'photon',
            });
          }
        }
      } catch (e) {
        console.warn('Photon fallback failed:', (e as Error).message);
      }
    }

    // Tier-based ordering: famous tourist cities first, then EU/Americas, then Arab, then others alphabetical.
    // Within each tier we keep relative population (desc) for relevance, except tier 4 which is alphabetical.
    const ranked = results
      .map((r) => ({ r, tier: tierOf(r.name, r.country_code) }))
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.tier === 4) return a.r.name.localeCompare(b.r.name, 'en');
        return (b.r.population || 0) - (a.r.population || 0);
      })
      .map((x) => x.r);

    return new Response(JSON.stringify({ results: ranked.slice(0, limit) }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('search-cities error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
