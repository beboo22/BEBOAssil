// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzedRequest {
  query: string;
  category: string;
  forDay?: number | null;
  preferredTime?: string | null;
}

const isMeaningfulQuery = (value: unknown) => {
  const clean = String(value || "").trim();
  if (!clean || clean.length < 3 || clean.length > 160) return false;
  if (/^(?:\d{1,2}|\d{1,2}:\d{2}|am|pm|utc(?:[+-]?\d+)?)$/i.test(clean)) return false;
  if (/^(?:day\s*\d+|اليوم\s*\d+)$/i.test(clean)) return false;
  const alphaCount = (clean.match(/[\p{L}\p{M}]/gu) || []).length;
  return alphaCount >= 2;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { specialRequests, language } = await req.json();
    const text = (specialRequests || "").toString().trim();
    if (!text) {
      return new Response(JSON.stringify({ requests: [], provider: "aiml" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AIML_API_KEY = Deno.env.get("AIML_API_KEY");
    if (!AIML_API_KEY) {
      return new Response(
        JSON.stringify({ requests: [], error: "AIML not configured", provider: "aiml" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sys = `You are a multilingual travel-prompt analyzer. The user provided a free-text special request (any of: Arabic, English, Urdu, German, French, Spanish, Chinese, Russian).
Extract every distinct desire as a structured search query optimized for SerpAPI/Google.
Return ONLY a JSON array. Each item: { "query": string (English, search-engine optimized, but preserve explicit venue/event names exactly), "category": one of ["restaurant","cafe","attraction","sport","stadium","tour","shopping","nightlife","nature","museum","other"], "forDay": number|null (1-based day index if mentioned, else null), "preferredTime": string|null (24h "HH:MM" if a time was mentioned, else null) }.
Never return a time-only query like "19:00" or "00". Never return date fragments as queries. Be concise. Max 8 items. Do not invent items. If empty, return [].`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);

    const aiRes = await fetch("https://api.aimlapi.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIML_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `User language: ${language || "auto"}\nSpecial requests:\n${text}` },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("AIML error:", aiRes.status, errText);
      return new Response(
        JSON.stringify({ requests: [], error: `AIML error: ${aiRes.status}`, details: errText, provider: "aiml" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const content: string = data?.choices?.[0]?.message?.content || "[]";

    let parsed: AnalyzedRequest[] = [];
    try {
      const cleaned = content.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch (e) {
      console.error("Parse error:", e, "Raw:", content);
      parsed = [];
    }

    if (!Array.isArray(parsed)) parsed = [];
    parsed = parsed
      .filter((r) => r && isMeaningfulQuery(r.query))
      .slice(0, 8)
      .map((r) => ({
        query: String(r.query).trim(),
        category: String(r.category || "other").toLowerCase(),
        forDay: typeof r.forDay === "number" ? r.forDay : null,
        preferredTime: typeof r.preferredTime === "string" && /^(\d{1,2}):(\d{2})$/.test(r.preferredTime) ? r.preferredTime : null,
      }));

    return new Response(JSON.stringify({ requests: parsed, provider: "aiml" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-special-requests error:", e);
    return new Response(
      JSON.stringify({ requests: [], error: (e as Error).message, provider: "aiml" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
