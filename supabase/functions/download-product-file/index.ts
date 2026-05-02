const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedHosts = new Set([
  "kphgbuxwtggnnnakpodh.supabase.co",
  "aseelaitrip.com",
  "www.aseelaitrip.com",
]);

const sanitizeFilename = (value: string | null, fallback: string) => {
  const raw = (value || fallback || "download").trim() || "download";
  return raw.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").slice(0, 140) || "download";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const requestUrl = new URL(req.url);
    const targetParam = requestUrl.searchParams.get("url") || "";
    const target = new URL(targetParam);

    if (!["https:", "http:"].includes(target.protocol) || !allowedHosts.has(target.hostname)) {
      return new Response(JSON.stringify({ error: "unsupported_file_host" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const urlName = decodeURIComponent(target.pathname.split("/").pop() || "download");
    const filename = sanitizeFilename(requestUrl.searchParams.get("filename"), urlName);
    const upstream = await fetch(target.toString());

    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: "file_not_found" }), {
        status: upstream.status || 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "invalid_download_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});