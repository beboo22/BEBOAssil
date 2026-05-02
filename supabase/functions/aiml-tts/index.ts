// Using built-in Deno.serve (no import needed)
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function truncateForTTS(text: string, maxLen = 600): string {
  if (text.length <= maxLen) return text;
  const truncated = text.substring(0, maxLen);
  const lastPeriod = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf("؟ "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf(".\n"),
  );
  if (lastPeriod > maxLen * 0.5) return truncated.substring(0, lastPeriod + 1);
  return truncated + "...";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    let { text, voice } = body;

    if (!text) throw new Error("text is required");

    // Clean markdown
    text = text.replace(/#{1,6}\s/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/\[(.+?)\]\(.+?\)/g, "$1").replace(/[-*+]\s/g, "").trim();
    text = truncateForTTS(text);

    if (!text || text.length < 2) throw new Error("Text too short for TTS");

    const isArabic = /[\u0600-\u06FF]/.test(text);
    if (!voice) voice = isArabic ? "nova" : "alloy";

    console.log(`TTS: voice=${voice}, len=${text.length}, arabic=${isArabic}`);

    const AIML_API_KEY = Deno.env.get("AIML_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Strategy 1: AIML OpenAI-compatible TTS
    if (AIML_API_KEY) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch("https://api.aimlapi.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${AIML_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice,
            response_format: "mp3",
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(tid));

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("audio") || contentType.includes("octet-stream")) {
            const audioBuffer = await response.arrayBuffer();
            if (audioBuffer.byteLength > 100) {
              const audioBase64 = base64Encode(audioBuffer);
              console.log(`TTS AIML success: ${audioBuffer.byteLength} bytes`);
              return new Response(JSON.stringify({ audioContent: audioBase64, contentType: "audio/mpeg" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
          const data = await response.json().catch(() => null);
          if (data?.audioContent) {
            return new Response(JSON.stringify({ audioContent: data.audioContent, contentType: data.contentType || "audio/mpeg" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        console.warn(`AIML TTS failed: ${response.status}`);
      } catch (err: any) {
        console.warn("AIML TTS error:", err?.message || err);
      }
    }

    // Strategy 2: Lovable AI Gateway (uses OpenAI TTS under the hood)
    if (LOVABLE_API_KEY) {
      try {
        console.log("Trying Lovable AI TTS...");
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice,
            response_format: "mp3",
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(tid));

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("audio") || contentType.includes("octet-stream")) {
            const audioBuffer = await response.arrayBuffer();
            if (audioBuffer.byteLength > 100) {
              const audioBase64 = base64Encode(audioBuffer);
              console.log(`TTS Lovable success: ${audioBuffer.byteLength} bytes`);
              return new Response(JSON.stringify({ audioContent: audioBase64, contentType: "audio/mpeg" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }
        console.warn(`Lovable TTS failed: ${response.status}`);
      } catch (err: any) {
        console.warn("Lovable TTS error:", err?.message || err);
      }
    }

    // Strategy 3: AIML legacy /v1/tts
    if (AIML_API_KEY) {
      try {
        console.log("Trying AIML legacy /v1/tts...");
        const response = await fetch("https://api.aimlapi.com/v1/tts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${AIML_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "openai/tts-1", text, voice }),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("audio") || contentType.includes("octet-stream")) {
            const audioBuffer = await response.arrayBuffer();
            const audioBase64 = base64Encode(audioBuffer);
            console.log(`TTS legacy success: ${audioBuffer.byteLength} bytes`);
            return new Response(JSON.stringify({
              audioContent: audioBase64,
              contentType: contentType.includes("wav") ? "audio/wav" : "audio/mpeg",
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const data = await response.json();
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        console.warn("Legacy TTS error:", err);
      }
    }

    throw new Error("All TTS strategies failed");
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("aiml-tts error:", errMsg);
    
    // Check if configuration is missing
    const AIML_API_KEY = Deno.env.get("AIML_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    let detail = errMsg;
    if (!AIML_API_KEY && !LOVABLE_API_KEY) {
      detail = "No AI API keys (AIML_API_KEY or LOVABLE_API_KEY) are set in Supabase secrets.";
    }

    return new Response(JSON.stringify({ 
      error: "TTS Error", 
      message: errMsg,
      detail: detail
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
