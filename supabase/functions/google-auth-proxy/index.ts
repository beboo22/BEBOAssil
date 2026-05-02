// Using built-in Deno.serve (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// @ts-ignore
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const { token } = await req.json();
    if (!token) throw new Error("Missing token");

    console.log("Verifying Google token...");
    // 1. Verify token with Google
    const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    const googleUser = await googleResponse.json();

    if (!googleUser.email) {
      console.error("Google verify failed:", googleUser);
      throw new Error("Invalid Google token or expired");
    }

    // 2. Check Client ID
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    console.log("Configured Client ID found:", !!GOOGLE_CLIENT_ID);
    
    if (!GOOGLE_CLIENT_ID) {
      throw new Error("GOOGLE_CLIENT_ID is not set in Supabase Secrets. Please add it via Lovable or Supabase CLI.");
    }

    if (googleUser.aud !== GOOGLE_CLIENT_ID) {
      console.error("Audience mismatch:", { tokenAud: googleUser.aud, expectedAud: GOOGLE_CLIENT_ID });
      throw new Error("Token audience mismatch.");
    }

    // 3. Supabase Admin
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Internal Server Error: Supabase env vars missing.");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Generate Link
    console.log("Generating login link for:", googleUser.email);
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: googleUser.email,
      options: {
        data: {
          full_name: googleUser.name,
          avatar_url: googleUser.picture,
        },
        redirectTo: req.headers.get("origin") + "/auth" || undefined,
      },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ 
      action_link: data.properties.action_link,
      email: googleUser.email 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (e) {
    console.error("Function error:", e.message);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal Error" }), {
      status: 200, // Return 200 with error property for easier frontend handling
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
