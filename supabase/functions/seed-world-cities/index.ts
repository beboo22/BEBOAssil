// Seeds world_cities table from GeoNames cities15000.zip
// Admin-only: requires authenticated admin user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader, TextWriter } from "npm:@zip.js/zip.js@2.7.45";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Common Arabic translations for major cities (extend as needed)
const arabicMap: Record<string, string> = {
  'Riyadh': 'الرياض', 'Jeddah': 'جدة', 'Mecca': 'مكة المكرمة', 'Medina': 'المدينة المنورة',
  'Dubai': 'دبي', 'Abu Dhabi': 'أبوظبي', 'Doha': 'الدوحة', 'Kuwait City': 'مدينة الكويت',
  'Cairo': 'القاهرة', 'Alexandria': 'الإسكندرية', 'Amman': 'عمّان', 'Beirut': 'بيروت',
  'Baghdad': 'بغداد', 'Damascus': 'دمشق', 'Istanbul': 'إسطنبول', 'Ankara': 'أنقرة',
  'Paris': 'باريس', 'London': 'لندن', 'Rome': 'روما', 'Madrid': 'مدريد', 'Berlin': 'برلين',
  'Moscow': 'موسكو', 'Tokyo': 'طوكيو', 'Beijing': 'بكين', 'Shanghai': 'شنغهاي',
  'New York City': 'نيويورك', 'Los Angeles': 'لوس أنجلوس', 'Chicago': 'شيكاغو',
  'Sydney': 'سيدني', 'Mumbai': 'مومباي', 'Delhi': 'دلهي', 'Bangkok': 'بانكوك',
};

// Extract Arabic name from alternateNames CSV (col 3): "name1,name2,..."
function extractArabicName(altNames: string, fallback: string): string | null {
  if (arabicMap[fallback]) return arabicMap[fallback];
  if (!altNames) return null;
  // GeoNames alt names don't include language tags here — only full names.
  // Detect Arabic script presence
  const arNames = altNames.split(',').filter(n => /[\u0600-\u06FF]/.test(n));
  return arNames[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing auth header');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) throw new Error('Admin access required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse body for options
    const body = await req.json().catch(() => ({}));
    const minPopulation = body.minPopulation ?? 15000;
    const source = body.source ?? 'cities15000'; // cities500, cities1000, cities5000, cities15000

    console.log(`Downloading ${source}.zip from GeoNames...`);
    const zipUrl = `https://download.geonames.org/export/dump/${source}.zip`;
    const res = await fetch(zipUrl);
    if (!res.ok) throw new Error(`GeoNames download failed: ${res.status}`);
    const zipBlob = await res.blob();

    console.log('Unzipping...');
    const zipReader = new ZipReader(new BlobReader(zipBlob));
    const entries = await zipReader.getEntries();
    const txtEntry = entries.find(e => e.filename.endsWith('.txt'));
    if (!txtEntry) throw new Error('No .txt file in archive');
    const text = await txtEntry.getData!(new TextWriter());
    await zipReader.close();

    console.log('Parsing rows...');
    // GeoNames cities format: tab-separated
    // 0:geonameid 1:name 2:asciiname 3:alternatenames 4:lat 5:lng 6:fclass 7:fcode
    // 8:country 9:cc2 10:admin1 ... 14:population ... 17:timezone
    const lines = text.split('\n').filter(l => l.trim());
    const rows: any[] = [];
    const seenIds = new Set<number>();

    // Country code -> name (subset; full list is large, fetched separately)
    const countryNames = await fetch('https://download.geonames.org/export/dump/countryInfo.txt')
      .then(r => r.text())
      .then(t => {
        const map: Record<string, string> = {};
        for (const line of t.split('\n')) {
          if (line.startsWith('#') || !line.trim()) continue;
          const cols = line.split('\t');
          if (cols.length > 4) map[cols[0]] = cols[4];
        }
        return map;
      })
      .catch(() => ({} as Record<string, string>));

    for (const line of lines) {
      const c = line.split('\t');
      if (c.length < 18) continue;
      const id = parseInt(c[0]);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const pop = parseInt(c[14]) || 0;
      if (pop < minPopulation) continue;

      rows.push({
        id,
        name: c[1],
        ascii_name: c[2],
        name_ar: extractArabicName(c[3], c[1]),
        alt_names: c[3]?.substring(0, 1000) || null,
        country_code: c[8],
        country_name: countryNames[c[8]] || c[8],
        admin1: c[10] || null,
        latitude: parseFloat(c[4]),
        longitude: parseFloat(c[5]),
        population: pop,
        feature_code: c[7],
        timezone: c[17] || null,
      });
    }

    console.log(`Parsed ${rows.length} cities. Upserting in batches...`);

    // Clear existing
    await supabase.from('world_cities').delete().neq('id', 0);

    // Batch insert (1000 per batch)
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      const { error } = await supabase.from('world_cities').insert(batch);
      if (error) {
        console.error(`Batch ${i} error:`, error);
        throw error;
      }
      inserted += batch.length;
    }

    return new Response(JSON.stringify({ success: true, inserted, source }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('seed-world-cities error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
