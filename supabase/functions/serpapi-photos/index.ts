// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    if (!SERPAPI_KEY) {
      throw new Error("SERPAPI_KEY is not configured");
    }

    const { data_id, query, latitude, longitude } = await req.json();

    let url: string;
    if (data_id) {
      // Fetch photos for a specific place by data_id
      url = `https://serpapi.com/search.json?engine=google_maps_photos&data_id=${encodeURIComponent(data_id)}&hl=en&api_key=${SERPAPI_KEY}`;
    } else if (query) {
      // Search for place first, then get photos
      const searchUrl = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}${latitude && longitude ? `&ll=@${latitude},${longitude},17z` : ""}&hl=en&api_key=${SERPAPI_KEY}`;
      const searchResp = await fetch(searchUrl);
      if (!searchResp.ok) throw new Error(`Search failed: ${searchResp.status}`);
      const searchData = await searchResp.json();
      const place = (searchData.local_results || []).find((p: any) => {
        const title = String(p?.title || "").toLowerCase();
        const type = String(p?.type || p?.category || "").toLowerCase();
        return title.includes("hotel") || type.includes("hotel") || type.includes("lodging") || type.includes("resort");
      }) || searchData.local_results?.[0];
      if (!place?.data_id) {
        return new Response(
          JSON.stringify({ success: true, photos: [], categories: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      url = `https://serpapi.com/search.json?engine=google_maps_photos&data_id=${encodeURIComponent(place.data_id)}&hl=en&api_key=${SERPAPI_KEY}`;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "data_id or query required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching photos...");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SerpAPI error: ${response.status}`);

    const data = await response.json();

    const photos = (data.photos || []).slice(0, 10).map((p: any) => ({
      thumbnail: p.thumbnail,
      image: p.image,
    }));

    const categories = (data.categories || []).map((c: any) => ({
      title: c.title,
      id: c.id,
    }));

    console.log(`Found ${photos.length} photos`);

    return new Response(
      JSON.stringify({ success: true, photos, categories }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("serpapi-photos error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
