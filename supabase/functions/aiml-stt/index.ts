// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].split(";")[0];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac",
  };
  return map[mime] || "webm";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIML_API_KEY = Deno.env.get("AIML_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!AIML_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("No STT API key configured");
    }

    const body = await req.json();
    const { audioBase64, language } = body;
    if (!audioBase64) throw new Error("audioBase64 is required");

    const parsed = parseDataUrl(audioBase64);
    if (!parsed) throw new Error("Invalid audioBase64 format");
    if (parsed.bytes.length < 1000) {
      return new Response(JSON.stringify({ text: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`STT: MIME=${parsed.mime}, Size=${parsed.bytes.length}`);
    const ext = extFromMime(parsed.mime);
    const blob = new Blob([parsed.bytes], { type: parsed.mime });
    const langCode = language && language !== "auto" ? language.split("-")[0].toLowerCase() : undefined;

    // Strategy 1: AIML Whisper (synchronous endpoint first for speed)
    if (AIML_API_KEY) {
      try {
        const formData = new FormData();
        formData.append("file", blob, `audio.${ext}`);
        formData.append("model", "whisper-1");
        if (langCode) formData.append("language", langCode);

        console.log("Trying AIML sync Whisper...");
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch("https://api.aimlapi.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${AIML_API_KEY}` },
          body: formData,
          signal: controller.signal,
        }).finally(() => clearTimeout(tid));

        if (resp.ok) {
          const data = await resp.json();
          const text = data?.text || "";
          if (text.trim()) {
            console.log(`AIML sync STT success: "${text.substring(0, 60)}"`);
            return new Response(JSON.stringify({ text: text.trim() }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        console.warn(`AIML sync STT failed: ${resp.status}`);
      } catch (err: any) {
        if (err?.name === "AbortError") console.warn("AIML sync STT timeout");
        else console.warn("AIML sync STT error:", err?.message);
      }
    }

    // Strategy 2: AIML async create+poll (fallback)
    if (AIML_API_KEY) {
      try {
        const formData = new FormData();
        formData.append("audio", blob, `audio.${ext}`);
        formData.append("model", "#g1_whisper-large");
        if (langCode) formData.append("language", langCode);

        console.log("Trying AIML async STT...");
        const createRes = await fetch("https://api.aimlapi.com/v1/stt/create", {
          method: "POST",
          headers: { "Authorization": `Bearer ${AIML_API_KEY}` },
          body: formData,
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          const generationId = createData.id || createData.generation_id;

          if (generationId) {
            for (let attempt = 1; attempt <= 8; attempt++) {
              await new Promise(r => setTimeout(r, 600));
              try {
                const pollRes = await fetch(`https://api.aimlapi.com/v1/stt/${generationId}`, {
                  method: "GET",
                  headers: { "Authorization": `Bearer ${AIML_API_KEY}` },
                });
                if (pollRes.ok) {
                  const pollData = await pollRes.json();
                  const status = (pollData.status || "").toLowerCase();
                  if (status === "completed" || status === "success" || status === "done") {
                    const text = pollData?.result?.text || pollData?.text || 
                      pollData?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
                    if (text.trim()) {
                      console.log(`AIML async STT success at attempt ${attempt}`);
                      return new Response(JSON.stringify({ text: text.trim() }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                      });
                    }
                  }
                  if (status === "failed" || status === "error") break;
                }
              } catch {}
            }
          }
        }
        console.warn("AIML async STT exhausted");
      } catch (err) {
        console.warn("AIML async STT error:", err);
      }
    }

    // Strategy 3: Lovable AI Gateway Whisper
    if (LOVABLE_API_KEY) {
      try {
        console.log("Trying Lovable AI STT...");
        const formData = new FormData();
        formData.append("file", blob, `audio.${ext}`);
        formData.append("model", "whisper-1");
        if (langCode) formData.append("language", langCode);

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}` },
          body: formData,
          signal: controller.signal,
        }).finally(() => clearTimeout(tid));

        if (resp.ok) {
          const data = await resp.json();
          const text = data?.text || "";
          if (text.trim()) {
            console.log(`Lovable STT success: "${text.substring(0, 60)}"`);
            return new Response(JSON.stringify({ text: text.trim() }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        console.warn(`Lovable STT failed: ${resp.status}`);
      } catch (err: any) {
        console.warn("Lovable STT error:", err?.message);
      }
    }

    // All strategies failed
    console.warn("All STT strategies failed");
    return new Response(JSON.stringify({ text: "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aiml-stt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
