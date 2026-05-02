// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeArabicDigits(input: string): string {
  const arabicZero = "٠".charCodeAt(0);
  const easternZero = "۰".charCodeAt(0);
  return input.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    const offset = code >= 0x06F0 ? code - easternZero : code - arabicZero;
    return String(offset);
  });
}

function toISODate(d: Date): string {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString().split("T")[0];
}

function parseNaturalDateFromText(text: string, uiLanguage?: string): string | null {
  if (!text) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const norm = normalizeArabicDigits(text).toLowerCase();
  const hasArabic = /[\u0600-\u06FF]/.test(text) || uiLanguage === "ar";

  // Helper to get first day of next month
  const firstDayNextMonth = () => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1, 1);
    return toISODate(d);
  };

  // Helper to get first day of next week (upcoming Sunday - more natural in many Arabic locales)
  const firstDayNextWeek = () => {
    const d = new Date(today);
    const day = d.getDay(); // 0=Sun..6=Sat
    const sunday = 0;
    let diff = sunday - day;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return toISODate(d);
  };

  // Helper to get "end of week" (Friday)
  const endOfWeek = () => {
    const d = new Date(today);
    const friday = 5; // 0=Sun..6=Sat
    const day = d.getDay();
    let diff = friday - day;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return toISODate(d);
  };

  if (hasArabic) {
    if (norm.includes("الشهر القادم") || norm.includes("الشهر الجاي") || norm.includes("شهر جاي")) {
      return firstDayNextMonth();
    }
    if (norm.includes("الأسبوع القادم") || norm.includes("الاسبوع القادم") || norm.includes("الاسبوع الجاي") || norm.includes("الأسبوع الجاي")) {
      return firstDayNextWeek();
    }
    if (norm.includes("نهاية الأسبوع") || norm.includes("نهاية الاسبوع") || norm.includes("آخر الأسبوع") || norm.includes("اخر الاسبوع")) {
      return endOfWeek();
    }
    const afterDaysMatch = norm.match(/بعد\s+(\d+)\s*(يوم|ايام|أيام)/);
    if (afterDaysMatch) {
      const n = parseInt(afterDaysMatch[1], 10);
      if (!isNaN(n) && n >= 0 && n <= 365) {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return toISODate(d);
      }
    }
  } else {
    if (norm.includes("next month")) {
      return firstDayNextMonth();
    }
    if (norm.includes("next week")) {
      return firstDayNextWeek();
    }
    if (norm.includes("end of the week") || norm.includes("this weekend") || norm.includes("weekend")) {
      return endOfWeek();
    }
    const inDaysMatch = norm.match(/in\s+(\d+)\s*(day|days)/);
    if (inDaysMatch) {
      const n = parseInt(inDaysMatch[1], 10);
      if (!isNaN(n) && n >= 0 && n <= 365) {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return toISODate(d);
      }
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, uiLanguage } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AIML_API_KEY = Deno.env.get("AIML_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (!LOVABLE_API_KEY && !AIML_API_KEY && !OPENROUTER_API_KEY) {
      console.error("CRITICAL: No AI API keys found in environment variables.");
      return new Response(JSON.stringify({ 
        error: "Configuration Missing", 
        detail: "No AI API keys (Lovable, AIML, or OpenRouter) are set in secrets." 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Priority: Lovable → AIML → OpenRouter
    const aiKey = LOVABLE_API_KEY || AIML_API_KEY || OPENROUTER_API_KEY;
    const aiUrl = LOVABLE_API_KEY
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : (AIML_API_KEY
        ? "https://api.aimlapi.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions");

    // Model selection based on provider
    let aiModel = LOVABLE_API_KEY ? "google/gemini-3-flash-preview" : (AIML_API_KEY ? "gpt-4o" : "google/gemini-2.0-flash-001");

    const lastUserMsg = messages.filter((m: any) => m.role === "user").pop()?.content || "";
    const hasArabic = /[\u0600-\u06FF]/.test(lastUserMsg);

    let detectedLang = "English";
    if (hasArabic) detectedLang = "Arabic";
    else if (uiLanguage === "ar") detectedLang = "Arabic";
    else if (uiLanguage === "fr") detectedLang = "French";
    else if (uiLanguage === "es") detectedLang = "Spanish";
    else if (uiLanguage === "de") detectedLang = "German";

    const systemPrompt = `You are a friendly travel planning assistant. Your job is to help users plan their trip by collecting all necessary details through natural conversation.

CRITICAL LANGUAGE RULE: You MUST respond ONLY in ${detectedLang}. NEVER switch languages based on the destination.

When a user describes their trip, collect these details:
- destination (where they want to go)
- departureCity (where they're traveling from)  
- travelers (number of adults — if user doesn't mention, default to 1)
- children (number of children, default 0)
- duration (number of days)
- startDate (when they want to start, YYYY-MM-DD format)
- budget (total budget in USD)
- interests (list like: nature, shopping, culture, beaches, adventure, art, food, nightlife, relaxation)
- specialRequests (any special needs)

CRITICAL RULES:
1. ALWAYS respond with text in ${detectedLang}. Never leave your response empty.
2. Ask about 2-3 missing details naturally per message. Don't ask everything at once.
3. Priority: destination > duration > startDate > travelers > departureCity > budget > interests
4. startDate is REQUIRED — if the user doesn't provide it, you MUST ask for it. Don't assume a date.
5. If travelers is not mentioned, set it to 1 (not 2).
6. When you have destination + duration + startDate at minimum, set ready=true.
7. When ready=true, present a FULL SUMMARY of all collected details and ask the user to confirm before generating. Include: destination, departure city, travelers, duration, dates, budget, interests, special requests. Ask if they want to change anything or add notes.
8. ONLY set confirmed=true when the user EXPLICITLY confirms the summary (says "yes", "confirm", "go ahead", "يلا", "نعم", "أكيد", "تمام", etc.).
9. Be enthusiastic and suggest interesting ideas! For example, suggest popular activities, best time to visit, or local food to try based on the destination.
10. Keep responses SHORT (3-5 sentences). Be conversational and helpful.
11. RESPOND ONLY IN ${detectedLang}.`;

    // ... rest of logic ...

    // ... inner fetch call updated ...
    const extractResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_trip_details",
            description: "Extract and track trip planning details from the conversation. MUST be called on every response.",
            parameters: {
              type: "object",
              properties: {
                destination: { type: "string", description: "Trip destination city/country, null if unknown" },
                departureCity: { type: "string", description: "Departure city, null if unknown" },
                travelers: { type: "number", description: "Number of adult travelers. Default 1 if not specified." },
                children: { type: "number", description: "Number of children, default 0" },
                duration: { type: "number", description: "Trip duration in days, null if unknown" },
                startDate: { type: "string", description: "Start date YYYY-MM-DD, null if unknown. MUST be asked if missing." },
                budget: { type: "number", description: "Total budget in USD, null if unknown" },
                interests: { type: "array", items: { type: "string" }, description: "List of interests" },
                specialRequests: { type: "string", description: "Special requests, null if none" },
                ready: { type: "boolean", description: "true ONLY if destination AND duration AND startDate are all known" },
                confirmed: { type: "boolean", description: "true ONLY if user explicitly confirmed the summary to generate" },
              },
              required: ["ready", "confirmed"],
            },
          },
        }],
      }),
    });

    if (!extractResponse.ok) {
      const errText = await extractResponse.text();
      console.error(`AI gateway error (${extractResponse.status}):`, errText);
      return new Response(JSON.stringify({ 
        error: "AI Provider Error", 
        status: extractResponse.status,
        detail: errText.substring(0, 200) 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await extractResponse.json();
    const choice = data.choices?.[0]?.message;

    let tripDetails = null;
    const toolCall = choice?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        tripDetails = JSON.parse(toolCall.function.arguments);
        // Enforce default 1 traveler
        if (tripDetails.travelers === null || tripDetails.travelers === undefined) {
          tripDetails.travelers = 1;
        }
        console.log("Extracted details:", JSON.stringify(tripDetails));
      } catch {
        console.warn("Failed to parse tool arguments:", toolCall.function.arguments);
      }
    }

    // Try to resolve natural-language dates like "الشهر القادم", "الأسبوع القادم", "بعد 3 أيام", "نهاية الأسبوع"
    // from the latest user message if startDate is missing or not in ISO format.
    const naturalDate = parseNaturalDateFromText(lastUserMsg, uiLanguage);
    if (tripDetails && naturalDate) {
      const looksIso = typeof tripDetails.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tripDetails.startDate);
      if (!tripDetails.startDate || !looksIso) {
        tripDetails.startDate = naturalDate;
      }
      if (tripDetails.destination && tripDetails.duration && !tripDetails.ready) {
        tripDetails.ready = true;
      }
    }

    let textContent = choice?.content || "";

    if (!textContent.trim()) {
      console.log("No text in first response, making follow-up call...");

      const detailsSummary = tripDetails ? JSON.stringify(tripDetails) : "No details extracted yet";

      const followUpResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            {
              role: "system", content: `You are a friendly travel assistant. RESPOND ONLY IN ${detectedLang}.

Current extracted trip details: ${detailsSummary}

Rules:
- If startDate is missing, ASK for it. Don't assume dates.
- If destination or duration is missing, ask about them first.
- If ready (destination + duration + startDate known), present a FULL SUMMARY and ask user to confirm.
- Suggest interesting ideas and activities for the destination.
- Be enthusiastic, short (3-5 sentences), and respond ONLY in ${detectedLang}.`
            },
            ...messages,
          ],
        }),
      });

      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        textContent = followUpData.choices?.[0]?.message?.content || "";
      }
    }

    // Final fallback
    if (!textContent.trim()) {
      const isArabic = detectedLang === "Arabic";
      if (tripDetails?.destination && tripDetails?.duration && tripDetails?.startDate) {
        textContent = isArabic
          ? `رائع! إليك ملخص رحلتك:\n📍 الوجهة: ${tripDetails.destination}\n📅 المدة: ${tripDetails.duration} أيام\n🗓️ تاريخ البدء: ${tripDetails.startDate}\n👤 المسافرين: ${tripDetails.travelers || 1}\nهل تريد تأكيد هذه التفاصيل وتوليد الخطة؟`
          : `Great! Here's your trip summary:\n📍 Destination: ${tripDetails.destination}\n📅 Duration: ${tripDetails.duration} days\n🗓️ Start: ${tripDetails.startDate}\n👤 Travelers: ${tripDetails.travelers || 1}\nWould you like to confirm and generate the plan?`;
      } else if (tripDetails?.destination && tripDetails?.duration) {
        textContent = isArabic
          ? `ممتاز! ${tripDetails.destination} لمدة ${tripDetails.duration} أيام 🌍 متى تريد أن تبدأ الرحلة؟ (حدد التاريخ من فضلك)`
          : `${tripDetails.destination} for ${tripDetails.duration} days 🌍 When do you want to start? (Please specify the date)`;
      } else {
        textContent = isArabic
          ? `أهلاً! أخبرني إلى أين تريد السفر وسأساعدك في التخطيط 🗺️`
          : `Hello! Tell me where you'd like to travel and I'll help you plan 🗺️`;
      }
    }

    // If we successfully parsed a natural-language date (مثل "الأسبوع القادم" أو "الشهر القادم"),
    // وضبطنا startDate، أضف توضيحاً صريحاً بالنص يبيّن التاريخ الفعلي المستخدم في الخطة.
    if (tripDetails && tripDetails.startDate && naturalDate && textContent.trim()) {
      const isArabic = detectedLang === "Arabic";
      const note = isArabic
        ? `\n\n📅 سيتم اعتبار تاريخ بداية الرحلة: ${tripDetails.startDate}.`
        : `\n\n📅 The trip start date will be treated as: ${tripDetails.startDate}.`;
      textContent += note;
    }

    console.log("Final response lang:", detectedLang, "text:", textContent.substring(0, 100));

    return new Response(JSON.stringify({
      message: textContent,
      tripDetails,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-trip-details error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
