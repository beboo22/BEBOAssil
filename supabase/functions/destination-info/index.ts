// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Expanded city coordinates (fallback uses geocoding API for unlisted cities)
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  // Gulf
  dubai: { lat: 25.2048, lon: 55.2708 }, "abu dhabi": { lat: 24.4539, lon: 54.3773 },
  sharjah: { lat: 25.3463, lon: 55.4209 }, ajman: { lat: 25.4052, lon: 55.5136 },
  "ras al khaimah": { lat: 25.7895, lon: 55.9432 }, fujairah: { lat: 25.1288, lon: 56.3265 },
  "al ain": { lat: 24.1917, lon: 55.7606 },
  riyadh: { lat: 24.7136, lon: 46.6753 }, jeddah: { lat: 21.4858, lon: 39.1925 },
  mecca: { lat: 21.3891, lon: 39.8579 }, medina: { lat: 24.5247, lon: 39.5692 },
  dammam: { lat: 26.4207, lon: 50.0888 }, khobar: { lat: 26.2172, lon: 50.1971 },
  tabuk: { lat: 28.3838, lon: 36.5550 }, abha: { lat: 18.2164, lon: 42.5053 },
  "al ula": { lat: 26.6174, lon: 37.9209 }, neom: { lat: 27.9500, lon: 35.2500 },
  taif: { lat: 21.2703, lon: 40.4158 }, yanbu: { lat: 24.0895, lon: 38.0618 },
  doha: { lat: 25.2854, lon: 51.531 }, lusail: { lat: 25.4195, lon: 51.4903 },
  muscat: { lat: 23.588, lon: 58.3829 }, salalah: { lat: 17.0151, lon: 54.0924 },
  manama: { lat: 26.2285, lon: 50.5860 },
  "kuwait city": { lat: 29.3759, lon: 47.9774 }, kuwait: { lat: 29.3759, lon: 47.9774 },
  // Middle East
  beirut: { lat: 33.8938, lon: 35.5018 }, baghdad: { lat: 33.3152, lon: 44.3661 },
  erbil: { lat: 36.1912, lon: 44.0119 }, tehran: { lat: 35.6892, lon: 51.3890 },
  amman: { lat: 31.9454, lon: 35.9284 }, petra: { lat: 30.3285, lon: 35.4444 },
  aqaba: { lat: 29.5267, lon: 35.0078 },
  // North Africa
  cairo: { lat: 30.0444, lon: 31.2357 }, alexandria: { lat: 31.2001, lon: 29.9187 },
  luxor: { lat: 25.6872, lon: 32.6396 }, aswan: { lat: 24.0889, lon: 32.8998 },
  "sharm el sheikh": { lat: 27.9158, lon: 34.3300 }, hurghada: { lat: 27.2579, lon: 33.8116 },
  marrakech: { lat: 31.6295, lon: -7.9811 }, casablanca: { lat: 33.5731, lon: -7.5898 },
  fes: { lat: 34.0181, lon: -5.0078 }, tangier: { lat: 35.7595, lon: -5.8340 },
  tunis: { lat: 36.8065, lon: 10.1815 }, algiers: { lat: 36.7538, lon: 3.0588 },
  // Turkey
  istanbul: { lat: 41.0082, lon: 28.9784 }, antalya: { lat: 36.8969, lon: 30.7133 },
  ankara: { lat: 39.9334, lon: 32.8597 }, bodrum: { lat: 37.0344, lon: 27.4305 },
  cappadocia: { lat: 38.6431, lon: 34.8289 }, trabzon: { lat: 41.0027, lon: 39.7168 },
  izmir: { lat: 38.4237, lon: 27.1428 }, bursa: { lat: 40.1885, lon: 29.0610 },
  // Europe
  paris: { lat: 48.8566, lon: 2.3522 }, lyon: { lat: 45.7640, lon: 4.8357 },
  nice: { lat: 43.7102, lon: 7.2620 }, marseille: { lat: 43.2965, lon: 5.3698 },
  london: { lat: 51.5074, lon: -0.1278 }, manchester: { lat: 53.4808, lon: -2.2426 },
  edinburgh: { lat: 55.9533, lon: -3.1883 }, liverpool: { lat: 53.4084, lon: -2.9916 },
  berlin: { lat: 52.52, lon: 13.405 }, munich: { lat: 48.1351, lon: 11.5820 },
  frankfurt: { lat: 50.1109, lon: 8.6821 }, hamburg: { lat: 53.5511, lon: 9.9937 },
  nuremberg: { lat: 49.4521, lon: 11.0767 }, nürnberg: { lat: 49.4521, lon: 11.0767 },
  amsterdam: { lat: 52.3676, lon: 4.9041 }, rotterdam: { lat: 51.9244, lon: 4.4777 },
  vienna: { lat: 48.2082, lon: 16.3738 }, salzburg: { lat: 47.8095, lon: 13.0550 },
  zurich: { lat: 47.3769, lon: 8.5417 }, geneva: { lat: 46.2044, lon: 6.1432 },
  rome: { lat: 41.9028, lon: 12.4964 }, milan: { lat: 45.4642, lon: 9.19 },
  venice: { lat: 45.4408, lon: 12.3155 }, florence: { lat: 43.7696, lon: 11.2558 },
  naples: { lat: 40.8518, lon: 14.2681 },
  madrid: { lat: 40.4168, lon: -3.7038 }, barcelona: { lat: 41.3874, lon: 2.1686 },
  seville: { lat: 37.3891, lon: -5.9845 }, valencia: { lat: 39.4699, lon: -0.3763 },
  malaga: { lat: 36.7213, lon: -4.4214 }, granada: { lat: 37.1773, lon: -3.5986 },
  lisbon: { lat: 38.7223, lon: -9.1393 }, porto: { lat: 41.1579, lon: -8.6291 },
  athens: { lat: 37.9838, lon: 23.7275 }, santorini: { lat: 36.3932, lon: 25.4615 },
  mykonos: { lat: 37.4467, lon: 25.3289 },
  prague: { lat: 50.0755, lon: 14.4378 }, budapest: { lat: 47.4979, lon: 19.0402 },
  warsaw: { lat: 52.2297, lon: 21.0122 }, krakow: { lat: 50.0647, lon: 19.9450 },
  copenhagen: { lat: 55.6761, lon: 12.5683 }, stockholm: { lat: 59.3293, lon: 18.0686 },
  oslo: { lat: 59.9139, lon: 10.7522 }, helsinki: { lat: 60.1699, lon: 24.9384 },
  dublin: { lat: 53.3498, lon: -6.2603 }, brussels: { lat: 50.8503, lon: 4.3517 },
  moscow: { lat: 55.7558, lon: 37.6173 },
  // Asia
  tokyo: { lat: 35.6762, lon: 139.6503 }, osaka: { lat: 34.6937, lon: 135.5023 },
  kyoto: { lat: 35.0116, lon: 135.7681 },
  bangkok: { lat: 13.7563, lon: 100.5018 }, phuket: { lat: 7.8804, lon: 98.3923 },
  "chiang mai": { lat: 18.7883, lon: 98.9853 },
  "kuala lumpur": { lat: 3.139, lon: 101.6869 }, penang: { lat: 5.4141, lon: 100.3288 },
  singapore: { lat: 1.3521, lon: 103.8198 },
  seoul: { lat: 37.5665, lon: 126.978 }, busan: { lat: 35.1796, lon: 129.0756 },
  beijing: { lat: 39.9042, lon: 116.4074 }, shanghai: { lat: 31.2304, lon: 121.4737 },
  "hong kong": { lat: 22.3193, lon: 114.1694 },
  bali: { lat: -8.3405, lon: 115.092 }, jakarta: { lat: -6.2088, lon: 106.8456 },
  mumbai: { lat: 19.076, lon: 72.8777 }, delhi: { lat: 28.7041, lon: 77.1025 },
  "new delhi": { lat: 28.6139, lon: 77.2090 },
  manila: { lat: 14.5995, lon: 120.9842 }, hanoi: { lat: 21.0278, lon: 105.8342 },
  "ho chi minh": { lat: 10.8231, lon: 106.6297 },
  colombo: { lat: 6.9271, lon: 79.8612 }, kathmandu: { lat: 27.7172, lon: 85.3240 },
  tbilisi: { lat: 41.7151, lon: 44.8271 }, baku: { lat: 40.4093, lon: 49.8671 },
  // Americas
  "new york": { lat: 40.7128, lon: -74.006 }, "los angeles": { lat: 34.0522, lon: -118.2437 },
  chicago: { lat: 41.8781, lon: -87.6298 }, miami: { lat: 25.7617, lon: -80.1918 },
  "san francisco": { lat: 37.7749, lon: -122.4194 }, washington: { lat: 38.9072, lon: -77.0369 },
  orlando: { lat: 28.5383, lon: -81.3792 }, "las vegas": { lat: 36.1699, lon: -115.1398 },
  toronto: { lat: 43.6532, lon: -79.3832 }, vancouver: { lat: 49.2827, lon: -123.1207 },
  montreal: { lat: 45.5017, lon: -73.5673 },
  "mexico city": { lat: 19.4326, lon: -99.1332 }, cancun: { lat: 21.1619, lon: -86.8515 },
  "buenos aires": { lat: -34.6037, lon: -58.3816 },
  "rio de janeiro": { lat: -22.9068, lon: -43.1729 }, "sao paulo": { lat: -23.5505, lon: -46.6333 },
  bogota: { lat: 4.7110, lon: -74.0721 }, lima: { lat: -12.0464, lon: -77.0428 },
  santiago: { lat: -33.4489, lon: -70.6693 },
  // Africa & Oceania
  "cape town": { lat: -33.9249, lon: 18.4241 }, johannesburg: { lat: -26.2041, lon: 28.0473 },
  nairobi: { lat: -1.2921, lon: 36.8219 }, zanzibar: { lat: -6.1659, lon: 39.2026 },
  sydney: { lat: -33.8688, lon: 151.2093 }, melbourne: { lat: -37.8136, lon: 144.9631 },
  auckland: { lat: -36.8485, lon: 174.7633 },
  // Arabic names
  دبي: { lat: 25.2048, lon: 55.2708 }, أبوظبي: { lat: 24.4539, lon: 54.3773 },
  الشارقة: { lat: 25.3463, lon: 55.4209 }, عجمان: { lat: 25.4052, lon: 55.5136 },
  "رأس الخيمة": { lat: 25.7895, lon: 55.9432 }, الفجيرة: { lat: 25.1288, lon: 56.3265 },
  العين: { lat: 24.1917, lon: 55.7606 },
  الرياض: { lat: 24.7136, lon: 46.6753 }, جدة: { lat: 21.4858, lon: 39.1925 },
  مكة: { lat: 21.3891, lon: 39.8579 }, المدينة: { lat: 24.5247, lon: 39.5692 },
  الدمام: { lat: 26.4207, lon: 50.0888 }, الخبر: { lat: 26.2172, lon: 50.1971 },
  تبوك: { lat: 28.3838, lon: 36.5550 }, أبها: { lat: 18.2164, lon: 42.5053 },
  العلا: { lat: 26.6174, lon: 37.9209 }, نيوم: { lat: 27.9500, lon: 35.2500 },
  الطائف: { lat: 21.2703, lon: 40.4158 }, ينبع: { lat: 24.0895, lon: 38.0618 },
  الدوحة: { lat: 25.2854, lon: 51.531 }, مسقط: { lat: 23.588, lon: 58.3829 },
  صلالة: { lat: 17.0151, lon: 54.0924 }, المنامة: { lat: 26.2285, lon: 50.5860 },
  الكويت: { lat: 29.3759, lon: 47.9774 },
  بيروت: { lat: 33.8938, lon: 35.5018 }, بغداد: { lat: 33.3152, lon: 44.3661 },
  أربيل: { lat: 36.1912, lon: 44.0119 },
  القاهرة: { lat: 30.0444, lon: 31.2357 }, الإسكندرية: { lat: 31.2001, lon: 29.9187 },
  الأقصر: { lat: 25.6872, lon: 32.6396 }, أسوان: { lat: 24.0889, lon: 32.8998 },
  "شرم الشيخ": { lat: 27.9158, lon: 34.3300 }, الغردقة: { lat: 27.2579, lon: 33.8116 },
  إسطنبول: { lat: 41.0082, lon: 28.9784 }, أنطاليا: { lat: 36.8969, lon: 30.7133 },
  أنقرة: { lat: 39.9334, lon: 32.8597 }, بودروم: { lat: 37.0344, lon: 27.4305 },
  كابادوكيا: { lat: 38.6431, lon: 34.8289 }, طرابزون: { lat: 41.0027, lon: 39.7168 },
  عمان: { lat: 31.9454, lon: 35.9284 }, العقبة: { lat: 29.5267, lon: 35.0078 },
  باريس: { lat: 48.8566, lon: 2.3522 }, لندن: { lat: 51.5074, lon: -0.1278 },
  برلين: { lat: 52.52, lon: 13.405 }, أمستردام: { lat: 52.3676, lon: 4.9041 },
  روما: { lat: 41.9028, lon: 12.4964 }, مدريد: { lat: 40.4168, lon: -3.7038 },
  برشلونة: { lat: 41.3874, lon: 2.1686 }, فيينا: { lat: 48.2082, lon: 16.3738 },
  طوكيو: { lat: 35.6762, lon: 139.6503 }, بانكوك: { lat: 13.7563, lon: 100.5018 },
  كوالالمبور: { lat: 3.139, lon: 101.6869 }, سنغافورة: { lat: 1.3521, lon: 103.8198 },
  سيول: { lat: 37.5665, lon: 126.978 }, بكين: { lat: 39.9042, lon: 116.4074 },
  شنغهاي: { lat: 31.2304, lon: 121.4737 }, "هونغ كونغ": { lat: 22.3193, lon: 114.1694 },
  بالي: { lat: -8.3405, lon: 115.092 }, مومباي: { lat: 19.076, lon: 72.8777 },
  مراكش: { lat: 31.6295, lon: -7.9811 }, "الدار البيضاء": { lat: 33.5731, lon: -7.5898 },
  فاس: { lat: 34.0181, lon: -5.0078 }, طنجة: { lat: 35.7595, lon: -5.8340 },
  تونس: { lat: 36.8065, lon: 10.1815 }, الجزائر: { lat: 36.7538, lon: 3.0588 },
  نيويورك: { lat: 40.7128, lon: -74.006 }, تبليسي: { lat: 41.7151, lon: 44.8271 },
  باكو: { lat: 40.4093, lon: 49.8671 }, نورنبرغ: { lat: 49.4521, lon: 11.0767 },
  // Country names → capital cities
  "saudi arabia": { lat: 24.7136, lon: 46.6753 }, "السعودية": { lat: 24.7136, lon: 46.6753 },
  "المملكة العربية السعودية": { lat: 24.7136, lon: 46.6753 },
  "turkey": { lat: 41.0082, lon: 28.9784 }, "تركيا": { lat: 41.0082, lon: 28.9784 },
  "egypt": { lat: 30.0444, lon: 31.2357 }, "مصر": { lat: 30.0444, lon: 31.2357 },
  "uae": { lat: 25.2048, lon: 55.2708 }, "الإمارات": { lat: 25.2048, lon: 55.2708 },
  "united arab emirates": { lat: 25.2048, lon: 55.2708 },
  "france": { lat: 48.8566, lon: 2.3522 }, "فرنسا": { lat: 48.8566, lon: 2.3522 },
  "germany": { lat: 52.52, lon: 13.405 }, "ألمانيا": { lat: 52.52, lon: 13.405 },
  "uk": { lat: 51.5074, lon: -0.1278 }, "united kingdom": { lat: 51.5074, lon: -0.1278 }, "بريطانيا": { lat: 51.5074, lon: -0.1278 },
  "japan": { lat: 35.6762, lon: 139.6503 }, "اليابان": { lat: 35.6762, lon: 139.6503 },
  "south korea": { lat: 37.5665, lon: 126.978 }, "كوريا الجنوبية": { lat: 37.5665, lon: 126.978 },
  "morocco": { lat: 31.6295, lon: -7.9811 }, "المغرب": { lat: 31.6295, lon: -7.9811 },
  "qatar": { lat: 25.2854, lon: 51.531 }, "قطر": { lat: 25.2854, lon: 51.531 },
  "oman": { lat: 23.588, lon: 58.3829 }, "عمان": { lat: 31.9454, lon: 35.9284 },
  "bahrain": { lat: 26.2285, lon: 50.5860 }, "البحرين": { lat: 26.2285, lon: 50.5860 },
  "kuwait": { lat: 29.3759, lon: 47.9774 },
  "jordan": { lat: 31.9454, lon: 35.9284 }, "الأردن": { lat: 31.9454, lon: 35.9284 },
  "spain": { lat: 40.4168, lon: -3.7038 }, "إسبانيا": { lat: 40.4168, lon: -3.7038 },
  "italy": { lat: 41.9028, lon: 12.4964 }, "إيطاليا": { lat: 41.9028, lon: 12.4964 },
  "usa": { lat: 40.7128, lon: -74.006 }, "united states": { lat: 40.7128, lon: -74.006 },
  "america": { lat: 40.7128, lon: -74.006 }, "أمريكا": { lat: 40.7128, lon: -74.006 },
  "india": { lat: 28.7041, lon: 77.1025 }, "الهند": { lat: 28.7041, lon: 77.1025 },
  "thailand": { lat: 13.7563, lon: 100.5018 }, "تايلاند": { lat: 13.7563, lon: 100.5018 },
  "malaysia": { lat: 3.139, lon: 101.6869 }, "ماليزيا": { lat: 3.139, lon: 101.6869 },
  "indonesia": { lat: -6.2088, lon: 106.8456 }, "إندونيسيا": { lat: -6.2088, lon: 106.8456 },
};

type CoordsResult = {
  lat: number;
  lon: number;
  resolvedName: string;
  countryCode?: string;
  state?: string;
};

const normalizeText = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeForMatch = (value: string) =>
  normalizeText(value)
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/ß/g, "s");

const cleanText = (value: string | null | undefined, maxLength = 240) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const WIKI_HEADERS = { "Api-User-Agent": "AseelTripApp/1.0 (support@aseelaitrip.app)" };

const NORMALIZED_CITY_COORDS: Record<string, { lat: number; lon: number }> = Object.entries(CITY_COORDS).reduce((acc, [key, value]) => {
  acc[normalizeText(key)] = value;
  return acc;
}, {} as Record<string, { lat: number; lon: number }>);

async function findCoords(destination: string, apiKey: string | undefined): Promise<CoordsResult | null> {
  const normalizedDestination = normalizeText(destination);

  if (NORMALIZED_CITY_COORDS[normalizedDestination]) {
    return { ...NORMALIZED_CITY_COORDS[normalizedDestination], resolvedName: destination };
  }

  for (const [key, coords] of Object.entries(NORMALIZED_CITY_COORDS)) {
    if (normalizedDestination.includes(key) || key.includes(normalizedDestination)) {
      return { ...coords, resolvedName: destination };
    }
  }

  if (!apiKey) return null;

  try {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=5&appid=${apiKey}`;
    const res = await fetch(geoUrl);
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const scored = data
      .map((item: any) => {
        const names = [
          item?.name,
          item?.state,
          item?.country,
          ...(item?.local_names ? Object.values(item.local_names) : []),
        ].filter(Boolean).map((n) => normalizeText(String(n)));

        let score = 0;
        if (names.some((n) => n === normalizedDestination)) score += 120;
        if (names.some((n) => n.includes(normalizedDestination) || normalizedDestination.includes(n))) score += 50;
        if (item?.country && normalizedDestination.includes(normalizeText(item.country))) score += 8;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.item || data[0];

    return {
      lat: best.lat,
      lon: best.lon,
      resolvedName: best.name || destination,
      countryCode: best.country,
      state: best.state,
    };
  } catch (e) {
    console.error("Geocoding fallback error:", e);
    return null;
  }
}

async function resolveWikipediaBaseTitle(resolvedName: string, coords: { lat: number; lon: number } | null): Promise<string | null> {
  const normalizedDestination = normalizeForMatch(resolvedName);
  const NON_CITY_KEYWORDS = [
    "airport", "station", "hauptbahnhof", "hbf", "museum", "stadium", "university",
    "fc", "district", "castle", "river", "bridge", "church", "hotel", "road",
  ];

  if (coords) {
    const geoSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coords.lat}|${coords.lon}&gsradius=12000&gslimit=12&format=json`;
    const geoRes = await fetch(geoSearchUrl, { headers: WIKI_HEADERS });
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      const pages = geoData?.query?.geosearch || [];

      if (Array.isArray(pages) && pages.length > 0) {
        const scoredPages = pages
          .map((p: any) => {
            const title = String(p?.title || "");
            const normalizedTitle = normalizeForMatch(title);
            let score = 0;

            if (normalizedTitle === normalizedDestination) score += 120;
            if (normalizedTitle.includes(normalizedDestination) || normalizedDestination.includes(normalizedTitle)) score += 70;
            if (normalizedTitle.includes(normalizedDestination.split(" ")[0] || "")) score += 20;
            if (normalizedTitle.split(" ").length <= 2) score += 20;
            if (NON_CITY_KEYWORDS.some((k) => normalizedTitle.includes(k))) score -= 85;
            score -= Math.min((Number(p?.dist) || 0) / 500, 40);

            return { title, score };
          })
          .sort((a: any, b: any) => b.score - a.score);

        if (scoredPages[0]?.title) return scoredPages[0].title;
      }
    }
  }

  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`intitle:"${resolvedName}" city`)}&srlimit=5&format=json`;
  const searchRes = await fetch(searchUrl, { headers: WIKI_HEADERS });
  if (!searchRes.ok) return null;

  const searchData = await searchRes.json();
  const searchResults = searchData?.query?.search || [];
  if (!Array.isArray(searchResults) || !searchResults.length) return null;

  const scored = searchResults
    .map((item: any) => {
      const title = String(item?.title || "");
      const normalizedTitle = normalizeForMatch(title);
      const snippet = normalizeForMatch(cleanText(item?.snippet || "", 500));
      let score = 0;

      if (normalizedTitle.includes(normalizedDestination) || normalizedDestination.includes(normalizedTitle)) score += 60;
      if (snippet.includes(normalizedDestination)) score += 30;
      if (/\bcity\b|\btown\b|\bmunicipality\b/.test(snippet)) score += 10;
      if (normalizedTitle.split(" ").length <= 2) score += 15;
      if (NON_CITY_KEYWORDS.some((k) => normalizedTitle.includes(k))) score -= 70;

      return { title, score };
    })
    .sort((a: any, b: any) => b.score - a.score);

  return scored[0]?.title || searchResults[0]?.title || null;
}

async function getLocalizedTitle(baseTitleEn: string, targetLang: "ar" | "en"): Promise<string | null> {
  if (targetLang === "en") return baseTitleEn;

  const langLinkUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=${targetLang}&lllimit=1&titles=${encodeURIComponent(baseTitleEn)}&format=json&redirects=1`;
  const langRes = await fetch(langLinkUrl, { headers: WIKI_HEADERS });
  if (!langRes.ok) return null;

  const langData = await langRes.json();
  const pages = Object.values(langData?.query?.pages || {}) as any[];
  const langTitle = pages?.[0]?.langlinks?.[0]?.["*"];
  return typeof langTitle === "string" ? langTitle : null;
}

async function fetchWikipediaSummary(lang: "ar" | "en", title: string) {
  const wikiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const wikiRes = await fetch(wikiUrl, { headers: WIKI_HEADERS });
  if (!wikiRes.ok) return null;
  const wikiData = await wikiRes.json();
  return {
    title: wikiData.title,
    extract: cleanText(wikiData.extract, 700),
    thumbnail: wikiData.thumbnail?.source || null,
    image: wikiData.originalimage?.source || null,
    description: cleanText(wikiData.description, 120) || null,
    source_url: wikiData.content_urls?.desktop?.page || wikiData.content_urls?.mobile?.page || null,
  };
}

const WEATHER_AR: Record<string, string> = {
  "Clear": "صافي", "Clouds": "غائم", "Rain": "ممطر", "Drizzle": "رذاذ",
  "Thunderstorm": "عاصفة رعدية", "Snow": "ثلج", "Mist": "ضباب خفيف",
  "Fog": "ضباب", "Haze": "ضبابي", "Dust": "غبار", "Sand": "رمال",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let destination = "";
    let lang = "en";
    let tripDays = 3;
    let startDate = "";
    try {
      const body = await req.json();
      destination = body?.destination || "";
      lang = body?.lang || body?.language || "en";
      tripDays = Math.max(1, Math.min(Number(body?.tripDays || body?.duration || 3), 120));
      startDate = String(body?.startDate || body?.tripStartDate || "").slice(0, 10);
    } catch {
      return new Response(JSON.stringify({ error: "invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!destination) {
      return new Response(JSON.stringify({ error: "destination required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isArabic = lang.startsWith("ar");
    const results: Record<string, unknown> = {
      weather: null,
      forecast: [],
      news: [],
      wikipedia: null,
      sources: [],
      country_code: null,
      resolved_destination: destination,
      fetched_at: new Date().toISOString(),
    };

    const owmKey = Deno.env.get("OPENWEATHERMAP_API_KEY");
    const coordsResult = await findCoords(destination, owmKey);
    const coords = coordsResult ? { lat: coordsResult.lat, lon: coordsResult.lon } : null;
    const resolvedName = coordsResult?.resolvedName || destination;
    let wikiLookupName = resolvedName;
    results.resolved_destination = resolvedName;
    if (coordsResult?.countryCode) results.country_code = coordsResult.countryCode;

    // 1) OpenWeatherMap (current weather + daily forecast)
    if (owmKey && coords) {
      try {
        const weatherLang = isArabic ? "ar" : "en";
        const owmUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${owmKey}&units=metric&lang=${weatherLang}`;
        const owmRes = await fetch(owmUrl);
        if (owmRes.ok) {
          const owmData = await owmRes.json();
          const mainWeather = owmData.weather?.[0]?.main || "";
          const desc = owmData.weather?.[0]?.description || "";
          results.country_code = owmData.sys?.country || results.country_code;

          results.weather = {
            temp: `${Math.round(owmData.main?.temp)}°C`,
            feels_like: `${Math.round(owmData.main?.feels_like)}°C`,
            temp_min: `${Math.round(owmData.main?.temp_min)}°C`,
            temp_max: `${Math.round(owmData.main?.temp_max)}°C`,
            condition: desc.charAt(0).toUpperCase() + desc.slice(1),
            humidity: `${owmData.main?.humidity}%`,
            wind_speed: `${owmData.wind?.speed} m/s`,
            icon: owmData.weather?.[0]?.icon,
            main: isArabic ? (WEATHER_AR[mainWeather] || mainWeather) : mainWeather,
          };

          if (owmData?.name) {
            wikiLookupName = String(owmData.name);
          }
        }

        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${owmKey}&units=metric&lang=${weatherLang}`;
        const forecastRes = await fetch(forecastUrl);
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          const list = Array.isArray(forecastData?.list) ? forecastData.list : [];
          const timezoneOffset = Number(forecastData?.city?.timezone) || 0;

          const groupedByDay = list.reduce((acc: Record<string, any[]>, item: any) => {
            const dayKey = new Date((Number(item?.dt || 0) + timezoneOffset) * 1000).toISOString().slice(0, 10);
            if (!acc[dayKey]) acc[dayKey] = [];
            acc[dayKey].push(item);
            return acc;
          }, {});

          const dailyForecast = Object.entries(groupedByDay)
            .map(([date, entries]) => {
              const sortedEntries = [...entries].sort((a: any, b: any) => {
                const hourA = Number((a?.dt_txt || "").split(" ")[1]?.split(":")?.[0] || 0);
                const hourB = Number((b?.dt_txt || "").split(" ")[1]?.split(":")?.[0] || 0);
                return Math.abs(hourA - 12) - Math.abs(hourB - 12);
              });

              const midday = sortedEntries[0] || entries[0];
              const minTemp = Math.min(...entries.map((e: any) => Number(e?.main?.temp_min || e?.main?.temp || 0)));
              const maxTemp = Math.max(...entries.map((e: any) => Number(e?.main?.temp_max || e?.main?.temp || 0)));

              return {
                date,
                temp_min: `${Math.round(minTemp)}°C`,
                temp_max: `${Math.round(maxTemp)}°C`,
                condition: cleanText(midday?.weather?.[0]?.description || "", 80),
                icon: midday?.weather?.[0]?.icon || null,
              };
            });

          const requestedStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
            ? new Date(`${startDate}T00:00:00Z`)
            : null;
          const forecastByDate = new Map(dailyForecast.map((day: any) => [day.date, day]));
          const sample = dailyForecast.length ? dailyForecast : [];
          const firstSampleDate = sample[0]?.date ? new Date(`${sample[0].date}T00:00:00Z`) : null;

          // Determine if trip start is far beyond OWM 5-day window → use Open-Meteo seasonal estimate
          let climateByDate = new Map<string, { temp_min: string; temp_max: string; condition: string }>();
          if (requestedStart && firstSampleDate) {
            const lastSampleDate = new Date(sample[sample.length - 1].date + 'T00:00:00Z');
            const tripEnd = new Date(requestedStart.getTime() + (tripDays - 1) * 86400000);
            const outOfRange = requestedStart.getTime() > lastSampleDate.getTime();
            if (outOfRange) {
              try {
                // Use historical same-period average from previous year as climate proxy
                const prevYear = requestedStart.getUTCFullYear() - 1;
                const histStart = `${prevYear}-${String(requestedStart.getUTCMonth() + 1).padStart(2, '0')}-${String(requestedStart.getUTCDate()).padStart(2, '0')}`;
                const prevTripEnd = new Date(tripEnd.getTime());
                prevTripEnd.setUTCFullYear(prevYear);
                const histEnd = prevTripEnd.toISOString().slice(0, 10);
                const omUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${histStart}&end_date=${histEnd}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
                const omRes = await fetch(omUrl);
                if (omRes.ok) {
                  const om = await omRes.json();
                  const dates: string[] = om?.daily?.time || [];
                  const tmax: number[] = om?.daily?.temperature_2m_max || [];
                  const tmin: number[] = om?.daily?.temperature_2m_min || [];
                  const wcode: number[] = om?.daily?.weathercode || [];
                  const codeToCondition = (c: number): string => {
                    if (c === 0) return weatherLang === 'ar' ? 'صافٍ' : 'Clear';
                    if (c <= 2) return weatherLang === 'ar' ? 'غائم جزئياً' : 'Partly cloudy';
                    if (c === 3) return weatherLang === 'ar' ? 'غائم' : 'Cloudy';
                    if (c >= 45 && c <= 48) return weatherLang === 'ar' ? 'ضباب' : 'Foggy';
                    if (c >= 51 && c <= 67) return weatherLang === 'ar' ? 'مطر' : 'Rain';
                    if (c >= 71 && c <= 77) return weatherLang === 'ar' ? 'ثلج' : 'Snow';
                    if (c >= 80 && c <= 82) return weatherLang === 'ar' ? 'زخات مطر' : 'Showers';
                    if (c >= 95) return weatherLang === 'ar' ? 'عواصف رعدية' : 'Thunderstorm';
                    return weatherLang === 'ar' ? 'متغير' : 'Variable';
                  };
                  dates.forEach((d, i) => {
                    // Map historical date back to requested year date (same month/day)
                    const parts = d.split('-');
                    const futureKey = `${requestedStart.getUTCFullYear()}-${parts[1]}-${parts[2]}`;
                    climateByDate.set(futureKey, {
                      temp_min: `${Math.round(tmin[i] ?? 0)}°C`,
                      temp_max: `${Math.round(tmax[i] ?? 0)}°C`,
                      condition: codeToCondition(wcode[i] ?? 0),
                    });
                  });
                }
              } catch (omErr) {
                console.error('Open-Meteo climate error:', omErr);
              }
            }
          }

          const aligned = Array.from({ length: tripDays }, (_, i) => {
            const date = requestedStart
              ? new Date(requestedStart.getTime() + i * 86400000).toISOString().slice(0, 10)
              : sample[i]?.date;
            const exact = date ? forecastByDate.get(date) : null;
            if (exact) return exact;
            // Use historical climate match for the exact future date if available
            const climate = date ? climateByDate.get(date) : null;
            if (climate) {
              return { date, temp_min: climate.temp_min, temp_max: climate.temp_max, condition: climate.condition, estimated: true };
            }
            const offset = firstSampleDate && date
              ? Math.abs(Math.round((new Date(`${date}T00:00:00Z`).getTime() - firstSampleDate.getTime()) / 86400000))
              : i;
            const src = sample.length ? sample[offset % sample.length] : null;
            return src ? {
              date: date || src.date,
              temp_min: src.temp_min,
              temp_max: src.temp_max,
              condition: src.condition,
              icon: src.icon,
              estimated: true,
            } : null;
          }).filter(Boolean);

          results.forecast = aligned;
        }

        (results.sources as any[]).push({
          label: "OpenWeatherMap",
          url: "https://openweathermap.org/",
          type: "weather",
        });
      } catch (e) {
        console.error("OpenWeatherMap error:", e);
      }
    }

    // 2) Wikipedia summary (always resolve from English first for accuracy)
    try {
      const baseTitleEn = await resolveWikipediaBaseTitle(wikiLookupName, coords);
      if (baseTitleEn) {
        const preferredLang: "ar" | "en" = isArabic ? "ar" : "en";
        const localizedTitle = await getLocalizedTitle(baseTitleEn, preferredLang);

        const localizedSummary = localizedTitle
          ? await fetchWikipediaSummary(preferredLang, localizedTitle)
          : null;
        const fallbackSummary = await fetchWikipediaSummary("en", baseTitleEn);

        results.wikipedia = localizedSummary || fallbackSummary;

        const wikiSourceUrl = (results.wikipedia as any)?.source_url || `https://en.wikipedia.org/wiki/${encodeURIComponent(baseTitleEn.replace(/\s+/g, "_"))}`;
        (results.sources as any[]).push({
          label: "Wikipedia",
          url: wikiSourceUrl,
          type: "overview",
        });
      }
    } catch (e) {
      console.error("Wikipedia error:", e);
    }

    // 3) Related city updates/articles (strictly tied to destination, no random featured feed)
    try {
      const preferredLang: "ar" | "en" = isArabic ? "ar" : "en";
      const newsItems: { title: string; summary: string; thumbnail?: string; url?: string; source?: string }[] = [];
      const seenTitles = new Set<string>();
      const destinationMatch = normalizeForMatch(wikiLookupName);
      const destinationToken = destinationMatch.split(" ").filter((x) => x.length > 2)[0] || destinationMatch;
      const NOISY_TITLES = ["history", "biography", "footballer", "politician", "singer", "album", "covid"];

      const addSummaryAsNews = async (baseTitleEn: string) => {
        if (!baseTitleEn) return;

        const normalizedTitle = normalizeForMatch(baseTitleEn);
        if (seenTitles.has(normalizedTitle)) return;
        if (NOISY_TITLES.some((noise) => normalizedTitle.includes(noise))) return;

        const localizedTitle = await getLocalizedTitle(baseTitleEn, preferredLang);
        const preferredSummary = localizedTitle
          ? await fetchWikipediaSummary(preferredLang, localizedTitle)
          : null;
        const fallbackSummary = await fetchWikipediaSummary("en", baseTitleEn);
        const summary = preferredSummary || fallbackSummary;

        if (!summary?.title || !summary?.extract) return;

        const combinedText = normalizeForMatch(`${summary.title} ${summary.extract}`);
        const isDestinationRelated = combinedText.includes(destinationMatch) || combinedText.includes(destinationToken);
        if (!isDestinationRelated) return;

        const sourceUrl = summary.source_url || `https://en.wikipedia.org/wiki/${encodeURIComponent(baseTitleEn.replace(/\s+/g, "_"))}`;

        seenTitles.add(normalizedTitle);
        newsItems.push({
          title: summary.title,
          summary: cleanText(summary.extract, 220),
          thumbnail: summary.thumbnail || undefined,
          url: sourceUrl,
          source: "Wikipedia",
        });
      };

      if (coords) {
        const geoSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coords.lat}|${coords.lon}&gsradius=20000&gslimit=10&format=json`;
        const geoSearchRes = await fetch(geoSearchUrl, { headers: WIKI_HEADERS });
        if (geoSearchRes.ok) {
          const geoData = await geoSearchRes.json();
          const nearbyPages = Array.isArray(geoData?.query?.geosearch) ? geoData.query.geosearch : [];
          for (const page of nearbyPages) {
            if (newsItems.length >= 4) break;
            await addSummaryAsNews(String(page?.title || ""));
          }
        }
      }

      if (newsItems.length < 2) {
        const fallbackSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${wikiLookupName} landmarks history travel`)}&srlimit=8&format=json`;
        const fallbackSearchRes = await fetch(fallbackSearchUrl, { headers: WIKI_HEADERS });
        if (fallbackSearchRes.ok) {
          const fallbackSearchData = await fallbackSearchRes.json();
          const fallbackResults = Array.isArray(fallbackSearchData?.query?.search) ? fallbackSearchData.query.search : [];
          for (const result of fallbackResults) {
            if (newsItems.length >= 4) break;
            await addSummaryAsNews(String(result?.title || ""));
          }
        }
      }

      results.news = newsItems.slice(0, 4);
      if (newsItems.length) {
        (results.sources as any[]).push({
          label: "Wikipedia Related Articles",
          url: newsItems[0]?.url || "https://www.wikipedia.org/",
          type: "news",
        });
      }
    } catch (e) {
      console.error("Wiki news error:", e);
    }

    return new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ weather: null, forecast: [], news: [], wikipedia: null, sources: [] }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  }
});