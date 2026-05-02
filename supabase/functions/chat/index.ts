// Using built-in Deno.serve (no import needed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(): string {
  const now = new Date();
  // Get current date details
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNamesAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const monthNamesAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  const todayDay = now.getDate();
  const todayMonth = now.getMonth(); // 0-indexed
  const todayYear = now.getFullYear();
  const todayWeekday = now.getDay(); // 0=Sun

  // Next week: find next Monday
  const daysUntilMonday = (1 - todayWeekday + 7) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);

  // This weekend
  const daysUntilSaturday = (6 - todayWeekday + 7) % 7 || 7;
  const thisSaturday = new Date(now);
  thisSaturday.setDate(now.getDate() + daysUntilSaturday);

  // Next month
  const nextMonthIdx = (todayMonth + 1) % 12;
  const nextMonthYear = todayMonth === 11 ? todayYear + 1 : todayYear;

  // After 3 days
  const threeDaysLater = new Date(now);
  threeDaysLater.setDate(now.getDate() + 3);

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const dateContext = `
=== CURRENT DATE & TIME CONTEXT ===
Today: ${dayNames[todayWeekday]}, ${monthNames[todayMonth]} ${todayDay}, ${todayYear} (${dayNamesAr[todayWeekday]}، ${todayDay} ${monthNamesAr[todayMonth]} ${todayYear})
Today's date (ISO): ${fmt(now)}
Current month: ${monthNames[todayMonth]} ${todayYear}
Next month: ${monthNames[nextMonthIdx]} ${nextMonthYear} (starts: ${nextMonthYear}-${pad(nextMonthIdx + 1)}-01)
This weekend: Saturday ${fmt(thisSaturday)}
Next week starts (Monday): ${fmt(nextMonday)}
3 days from now: ${fmt(threeDaysLater)}

IMPORTANT DATE RULES:
- "next month" = ${monthNames[nextMonthIdx]} ${nextMonthYear}
- "next week" = week of ${fmt(nextMonday)}
- "this weekend" = ${fmt(thisSaturday)}
- "after 3 days" = ${fmt(threeDaysLater)}
- "tomorrow" = ${fmt(new Date(now.getTime() + 86400000))}
- Always convert relative date expressions to actual calendar dates in your responses
- When suggesting booking links, always use real calculated dates (YYYY-MM-DD format)
===================================`;

  return `You are "Aseel AI" (أسيل AI) — the personal AI travel assistant for ASEEL AI TRIP platform. Always introduce yourself as "Aseel AI" when greeting users.

${dateContext}

YOUR IDENTITY:
- Name: Aseel AI (أسيل AI)
- Role: Personal travel assistant & trip planner
- Personality: Friendly, knowledgeable, enthusiastic about travel
- Always sign off or greet as "Aseel AI" / "أسيل AI"

CAPABILITIES:
1. **Trip Planning**: Create detailed trip plans with day-by-day itineraries
2. **Flight Search**: Suggest flights with estimated prices and booking links
3. **Hotel Recommendations**: Suggest hotels with prices, ratings, and booking links
4. **Car Rental**: Suggest car rental options with prices
5. **Price Estimates**: Always include realistic price estimates in USD
6. **Booking Links**: Generate affiliate booking links when possible
7. **Translation**: Translate any text between languages when asked
8. **Image Analysis**: When an image is sent, analyze it thoroughly
9. **Voice Understanding**: Process voice-transcribed text naturally. When receiving voice input, understand that it may have minor transcription errors - interpret the intent.

CRITICAL RULES:
- ALWAYS follow the user's specific requests precisely. If they say "I want to go ONLY to America, not Mexico or Canada" — respect that exactly.
- If the user mentions specific preferences (suburbs, specific areas, avoiding crowds, etc.) — tailor your response to match.
- Always respond in the SAME LANGUAGE the user writes in
- Use markdown formatting for readability
- When suggesting trips, include:
  - Day-by-day schedule with times
  - Estimated costs for each activity/meal
  - Hotel recommendations with nightly rates
  - Booking links using these formats:
    - Flights: https://www.aviasales.com/search/{FROM_CODE}{DDMM}{TO_CODE}{DDMM}1?marker=688262
    - Hotels: https://search.hotellook.com/hotels?destination={CITY}&checkIn={YYYY-MM-DD}&checkOut={YYYY-MM-DD}&adults=2&marker=688262
- Be enthusiastic but practical about budgets

IMPORTANT: Always provide actionable information with real prices and booking options. Use real dates based on the current date context above. For voice interactions, keep responses concise (under 3 paragraphs) for better TTS experience.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language, maxActivitiesPerDay, planName } = await req.json();

    const AIML_KEY = Deno.env.get("AIML_API_KEY");
    const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!OPENROUTER_KEY && !LOVABLE_KEY && !AIML_KEY) {
      console.error("CRITICAL: No AI API keys found in chat function environment variables.");
      return new Response(JSON.stringify({ 
        error: "Configuration Missing", 
        detail: "No AI API keys (AIML, OpenRouter, or Lovable) are set in Supabase secrets for the chat function." 
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if any message contains an image
    const hasImages = messages.some((m: any) =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === "image_url")
    );

    // Build dynamic system prompt with current date and subscription limits
    let subscriptionNote = "";
    if (maxActivitiesPerDay) {
      subscriptionNote = `\n\nSUBSCRIPTION PLAN LIMITS:
- User's plan: ${planName || 'Free'}
- Maximum activities per day: ${maxActivitiesPerDay}
- When suggesting trip plans or itineraries, NEVER exceed ${maxActivitiesPerDay} non-meal activities per day
- If the user asks for more activities than their plan allows, politely inform them about their current limit and suggest upgrading`;
    }

    const SYSTEM_PROMPT = buildSystemPrompt() + subscriptionNote + (language ? `\n\nIMPORTANT: The user's interface language is "${language}". Always respond in this language unless the user writes in a different language, then match their language.` : '');

    // Build provider list - Priority: AIML → OpenRouter → Lovable
    const providers = [];

    if (AIML_KEY) {
      if (hasImages) {
        providers.push(
          { url: "https://api.aimlapi.com/v1/chat/completions", key: AIML_KEY, model: "gpt-4o" },
        );
      } else {
        providers.push(
          { url: "https://api.aimlapi.com/v1/chat/completions", key: AIML_KEY, model: "gpt-4o" },
          { url: "https://api.aimlapi.com/v1/chat/completions", key: AIML_KEY, model: "gpt-4o-mini" },
        );
      }
    }

    if (OPENROUTER_KEY) {
      providers.push(
        { url: "https://openrouter.ai/api/v1/chat/completions", key: OPENROUTER_KEY, model: "openai/gpt-4o-mini" },
        { url: "https://openrouter.ai/api/v1/chat/completions", key: OPENROUTER_KEY, model: "google/gemini-flash-1.5" },
      );
    }

    if (LOVABLE_KEY) {
      if (hasImages) {
        providers.push(
          { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LOVABLE_KEY, model: "google/gemini-2.5-flash" },
          { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LOVABLE_KEY, model: "openai/gpt-5" },
        );
      } else {
        providers.push(
          { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LOVABLE_KEY, model: "google/gemini-3-flash-preview" },
          { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LOVABLE_KEY, model: "openai/gpt-5" },
        );
      }
    }

    for (const provider of providers) {
      try {
        console.log(`Trying provider: ${provider.model} at ${provider.url}`);
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages,
            ],
            stream: true,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Chat model ${provider.model} failed (${response.status}):`, errText);
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          continue;
        }

        console.log(`Success with provider: ${provider.model}`);
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      } catch (e) {
        console.error(`Provider ${provider.model} exception:`, e);
      }
    }

    console.error("Critical: All AI providers failed. Providers tried:", providers.length);
    return new Response(JSON.stringify({ 
      error: "All AI Providers Failed", 
      detail: "Check Supabase logs for specific provider errors. Ensure API keys are valid and have sufficient quota."
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
