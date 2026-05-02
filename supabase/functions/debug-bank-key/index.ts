// Debug endpoint that mirrors the synonym + canonicalization logic used by
// generate-trip when building the shared SerpApi cache key. Lets admins verify
// that "café" / "coffee shop" / "مقهى" / "kahve" all collapse to the same
// canonical token, and that two queries hash to the same bank key.
//
// Public-callable but intended for admin use only — returns no secrets.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Inline copies of the normalization helpers (kept verbatim with generate-trip
// so the admin tool always reflects production behavior).
function __normalizeCacheText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function __hashCacheKey(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
const __SYN_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canon: string, words: string[]) => {
    m[canon] = canon;
    for (const w of words) m[__normalizeCacheText(w)] = canon;
  };
  add("italian", ["italian","italiano","italienne","italienisch","italiana","ايطالي","إيطالي","итальянская","italyan"]);
  add("french", ["french","francaise","française","francese","französisch","فرنسي","французская","fransiz","fransız"]);
  add("japanese", ["japanese","japonais","japonesa","giapponese","japanisch","ياباني","японская","japon"]);
  add("chinese", ["chinese","chinois","china","cinese","chinesisch","صيني","китайская","cin","çin"]);
  add("korean", ["korean","coreen","coreano","koreanisch","kore","كوري","корейская"]);
  add("thai", ["thai","thailandais","tailandesa","thailaendisch","تايلاندي","تايلندي","тайская"]);
  add("indian", ["indian","indien","indiana","indisch","indiano","هندي","индийская","hint"]);
  add("mexican", ["mexican","mexicain","mexicana","messicano","mexikanisch","مكسيكي","мексиканская","meksika"]);
  add("lebanese", ["lebanese","libanais","libanesa","libanese","libanesisch","لبناني","ливанская","lubnan"]);
  add("turkish", ["turkish","turc","turca","turco","tuerkisch","تركي","турецкая","turk","türk"]);
  add("greek", ["greek","grec","griega","greco","griechisch","يوناني","греческая","yunan"]);
  add("spanish", ["spanish","espagnol","espanola","spagnola","spanisch","اسباني","إسباني","испанская","ispanyol"]);
  add("arabic", ["arabic","arabe","arabica","araba","arabisch","عربي","عربية","арабская","arap"]);
  add("seafood", ["seafood","fruits de mer","mariscos","frutti di mare","meeresfruechte","مأكولات بحرية","морепродукты","deniz urunleri","deniz ürünleri","fish","سمك","poisson","pesce"]);
  add("vegan", ["vegan","végan","vegano","نباتي صرف","веганская","vejetaryen vegan"]);
  add("vegetarian", ["vegetarian","vegetarien","vegetariano","vegetarisch","نباتي","вегетарианская","vejetaryen"]);
  add("halal", ["halal","حلال","халяль"]);
  add("sushi", ["sushi","سوشي","суши"]);
  add("pizza", ["pizza","بيتزا","пицца"]);
  add("burger", ["burger","burgers","hamburger","برغر","برجر","бургер"]);
  add("steak", ["steak","steakhouse","ستيك","стейк","steak ev","et restoranı"]);
  add("grill", ["grill","grilled","grillé","parrilla","grigliata","مشوي","mangal","шашлык"]);
  add("bbq", ["bbq","barbecue","barbacoa","شواء","grill bbq"]);
  add("bakery", ["bakery","bakeries","boulangerie","panaderia","panificio","baeckerei","مخبز","bocchi","pekarnya","fırın","firin","пекарня"]);
  add("dessert", ["dessert","desserts","postre","dolci","nachtisch","حلويات","tatli","tatlı","десерт","sweet","sweets"]);
  add("breakfast", ["breakfast","petit dejeuner","desayuno","colazione","fruehstueck","فطور","افطار","kahvalti","kahvaltı","завтрак"]);
  add("lunch", ["lunch","dejeuner","almuerzo","pranzo","mittagessen","غداء","ogle","öğle","обед"]);
  add("dinner", ["dinner","diner","cena","abendessen","عشاء","aksam","akşam","ужин"]);
  add("brunch", ["brunch","برانش","бранч"]);
  add("cafe", ["cafe","café","coffee","coffee shop","coffeeshop","cafeteria","kaffee","caffe","caffè","مقهى","مقاهي","قهوة","kahve","kahveci","кофейня","кафе"]);
  add("restaurant", ["restaurant","restaurants","restaurante","ristorante","gaststaette","مطعم","مطاعم","lokanta","ресторан"]);
  add("museum", ["museum","museums","musee","musée","museo","متحف","متاحف","muze","müze","музей"]);
  add("park", ["park","parc","parque","parco","حديقة","حدائق","حديقه","bahce","bahçe","парк"]);
  add("beach", ["beach","plage","playa","spiaggia","strand","شاطئ","شاطىء","plaj","пляж"]);
  add("mall", ["mall","shopping mall","centre commercial","centro comercial","centro commerciale","einkaufszentrum","مول","تسوق","alisveris","alışveriş","торговый центр"]);
  add("market", ["market","marche","mercado","mercato","markt","سوق","pazar","рынок","souk"]);
  add("garden", ["garden","jardin","giardino","garten","حديقة نباتية","bahce","сад"]);
  add("trail", ["trail","sentier","sendero","sentiero","wanderweg","ممر مشي","yuruyus","yürüyüş","тропа"]);
  add("viewpoint", ["viewpoint","mirador","belvedere","aussichtspunkt","نقطة مشاهدة","seyir","смотровая"]);
  add("nightlife", ["nightlife","vie nocturne","vida nocturna","vita notturna","nachtleben","حياة ليلية","gece hayati","ночная жизнь","bar","club","disco","pub"]);
  add("entertainment", ["entertainment","divertissement","entretenimiento","divertimento","unterhaltung","ترفيه","eglence","eğlence","развлечения","amusement","theme park"]);
  add("shopping", ["shopping","achats","compras","shopping mall","تسوق","alisveris","шопинг"]);
  add("nature", ["nature","naturaleza","natur","natura","طبيعة","doga","doğa","природа"]);
  add("sports", ["sports","sport","deportes","sportivo","رياضة","رياضي","spor","спорт"]);
  add("culture", ["culture","cultural","cultura","kulture","kultur","ثقافة","ثقافي","kultur","kültür","культура"]);
  add("history", ["history","historic","historical","historico","storico","تاريخي","تاريخ","tarih","tarihi","история"]);
  add("art", ["art","arte","kunst","sanat","فن","فني","искусство","gallery","galleria","galerie"]);
  return m;
})();
function __canonSynonym(token: string): string {
  if (!token) return token;
  const direct = __SYN_MAP[token];
  if (direct) return direct;
  if (token.endsWith("s") && token.length > 3) {
    const sing = token.slice(0, -1);
    if (__SYN_MAP[sing]) return __SYN_MAP[sing];
  }
  return token;
}
function __extractCanonPhrases(normText: string): string[] {
  const out = new Set<string>();
  if (!normText) return [];
  const words = normText.split(" ").filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i + 1]}`;
    if (__SYN_MAP[bi]) out.add(__SYN_MAP[bi]);
  }
  for (const w of words) {
    const c = __canonSynonym(w);
    if (c && c.length >= 3) out.add(c);
  }
  return [...out];
}
function __extractPrefTokensFromQuery(query: string): string[] {
  const norm = __normalizeCacheText(query);
  const stop = new Set([
    "the","a","an","in","at","near","to","for","of","and","or","with","best",
    "top","good","great","place","places","spot","spots","real","local","authentic",
    "food","eatery","dining","cuisine","shop","shops","store","stores",
    "things","do","see","visit","tour","tours","real",
  ]);
  const tokens = new Set<string>();
  for (const c of __extractCanonPhrases(norm)) tokens.add(c);
  for (const w of norm.split(" ")) {
    if (!w || stop.has(w) || w.length < 3) continue;
    tokens.add(__canonSynonym(w));
  }
  return [...tokens].sort().slice(0, 8);
}
function __canonPrefValue(v: string): string {
  if (!v) return "";
  const norm = __normalizeCacheText(v);
  const phrases = __extractCanonPhrases(norm);
  return phrases[0] || norm;
}
function __canonLang(lang?: string | null): string {
  if (!lang) return "en";
  const base = String(lang).toLowerCase().split(/[-_]/)[0];
  return ["en","ar","es","fr","de","it","tr","ru"].includes(base) ? base : "en";
}
function __buildSharedCacheKey(
  query: string,
  city: string,
  cuisines: string[],
  categories: string[],
  lat?: number,
  lng?: number,
): string {
  const prefCuisines = (cuisines || []).map(__canonPrefValue).filter(Boolean).sort().join(",");
  const prefCats = (categories || []).map(__canonPrefValue).filter(Boolean).sort().join(",");
  const queryTokens = __extractPrefTokensFromQuery(query).join(",");
  const seed = [
    queryTokens,
    __normalizeCacheText(city || ""),
    prefCuisines,
    prefCats,
    "", "search",
    Number.isFinite(lat as number) ? (lat as number).toFixed(2) : "",
    Number.isFinite(lng as number) ? (lng as number).toFixed(2) : "",
  ].join("|");
  return __hashCacheKey(seed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const query = String(body?.query || "");
    const city = String(body?.city || "");
    const lang = String(body?.lang || "en");
    const cuisines: string[] = Array.isArray(body?.cuisines) ? body.cuisines.map(String) : [];
    const categories: string[] = Array.isArray(body?.categories) ? body.categories.map(String) : [];
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);

    const queryNorm = __normalizeCacheText(query);
    const cityNorm = __normalizeCacheText(city);
    const queryTokens = __extractPrefTokensFromQuery(query);
    const cuisineMap = cuisines.map((c) => ({ input: c, normalized: __normalizeCacheText(c), canonical: __canonPrefValue(c) }));
    const categoryMap = categories.map((c) => ({ input: c, normalized: __normalizeCacheText(c), canonical: __canonPrefValue(c) }));
    const cacheKey = __buildSharedCacheKey(query, city, cuisines, categories, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);

    return new Response(
      JSON.stringify({
        input: { query, city, lang, cuisines, categories, lat, lng },
        normalized: {
          query: queryNorm,
          city: cityNorm,
          lang: __canonLang(lang),
        },
        query_tokens: queryTokens,
        cuisine_map: cuisineMap,
        category_map: categoryMap,
        seed_components: {
          query_tokens: queryTokens.join(","),
          city: cityNorm,
          pref_cuisines: cuisineMap.map((m) => m.canonical).filter(Boolean).sort().join(","),
          pref_categories: categoryMap.map((m) => m.canonical).filter(Boolean).sort().join(","),
        },
        cache_key: cacheKey,
        notes: "Same cache_key across two inputs ⇒ they hit the same shared SerpApi bank.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
