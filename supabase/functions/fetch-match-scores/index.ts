import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://deno.land/x/cors@v1.2.2/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sportdbKey = Deno.env.get("SPORTDB_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
      if (!roleData) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const source = body.source || "sportdb"; // sportdb or ai
    const season = body.season || "2026";

    if (source === "sportdb") {
      if (!sportdbKey) {
        return new Response(JSON.stringify({ error: "SPORTDB_API_KEY not configured" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      

      // Fetch standings from SportDB
      const standingsUrl = `https://api.sportdb.dev/api/flashscore/football/world:8/world-cup:lvUBR5F8/${season}/standings`;
      const standingsRes = await fetch(standingsUrl, { headers: { "X-API-Key": sportdbKey } });
      
      if (!standingsRes.ok) {
        const errText = await standingsRes.text();
        return new Response(JSON.stringify({ error: `SportDB API error: ${standingsRes.status}`, details: errText }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const standingsData = await standingsRes.json();

      // Fetch fixtures
      const fixturesUrl = `https://api.sportdb.dev/api/flashscore/football/world:8/world-cup:lvUBR5F8/${season}/fixtures?page=1`;
      const fixturesRes = await fetch(fixturesUrl, { headers: { "X-API-Key": sportdbKey } });
      const fixturesData = fixturesRes.ok ? await fixturesRes.json() : [];

      // Fetch results
      const resultsUrl = `https://api.sportdb.dev/api/flashscore/football/world:8/world-cup:lvUBR5F8/${season}/results?page=1`;
      const resultsRes = await fetch(resultsUrl, { headers: { "X-API-Key": sportdbKey } });
      const resultsData = resultsRes.ok ? await resultsRes.json() : [];

      // Combine results + fixtures
      const allMatches = [...(resultsData || []), ...(fixturesData || [])];

      // Get existing events
      const { data: existingEvents } = await supabase
        .from("global_events")
        .select("id, title, metadata")
        .eq("is_active", true)
        .ilike("title", "%World Cup 2026%");

      let updated = 0;
      let skipped = 0;

      for (const match of allMatches) {
        const homeTeam = match.homeName || match.homeFirstName;
        const awayTeam = match.awayName || match.awayFirstName;
        if (!homeTeam || !awayTeam) continue;

        // Find matching event in DB
        const existing = existingEvents?.find((e: any) => {
          const m = e.metadata;
          return m?.team1 === homeTeam && m?.team2 === awayTeam;
        });

        if (!existing) { skipped++; continue; }

        const homeScore = match.homeResult || match.homeScore || match.eventHomeScore;
        const awayScore = match.awayResult || match.awayScore || match.eventAwayScore;
        const stage = match.eventStage || "";

        let matchStatus = "scheduled";
        if (stage === "FINISHED" || stage === "AFTER_EXTRA_TIME" || stage === "AFTER_PENALTIES") matchStatus = "finished";
        else if (stage === "LIVE" || stage === "1ST_HALF" || stage === "2ND_HALF") matchStatus = "live";
        else if (stage === "HALFTIME") matchStatus = "halftime";

        const hasScore = homeScore !== "" && homeScore !== undefined && homeScore !== null;

        if (hasScore) {
          const newMeta = {
            ...existing.metadata,
            score1: parseInt(homeScore),
            score2: parseInt(awayScore),
            match_status: matchStatus,
            last_updated: new Date().toISOString(),
            updated_by: "sportdb",
          };
          await supabase.from("global_events").update({ metadata: newMeta }).eq("id", existing.id);
          updated++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        source: "sportdb",
        updated,
        skipped,
        totalMatches: allMatches.length,
        standings: standingsData,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown source" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fetch-match-scores error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
