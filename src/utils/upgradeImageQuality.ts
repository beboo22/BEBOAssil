// Client-side image quality upgrader. Rewrites known thumbnail URL patterns
// (Google user content, ggpht, gstatic, Unsplash, lh*.googleusercontent) to
// request the highest-resolution variant available — without re-fetching from
// the source. Safe to call on any URL: unknown patterns are returned as-is.

export function upgradeImageQuality(url: string | undefined | null, opts?: { width?: number; height?: number }): string {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  const w = Math.max(640, Math.min(2048, opts?.width ?? 1600));
  const h = Math.max(360, Math.min(1536, opts?.height ?? 900));

  // Google user content / ggpht / gstatic — they accept =w{W}-h{H}-no
  if (/(googleusercontent\.com|ggpht\.com|gstatic\.com)/i.test(trimmed)) {
    const cleaned = trimmed.replace(/=[swh]\d+(-[hw]\d+)?(-[a-z0-9-]+)?$/i, "")
                            .replace(/=[swh]\d+(-[hw]\d+)?(-[a-z0-9-]+)?(?=[?#]|$)/i, "");
    return `${cleaned}=w${w}-h${h}-no`;
  }

  // Unsplash — bump w/q and ensure crop+format
  if (/images\.unsplash\.com/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      u.searchParams.set("w", String(w));
      u.searchParams.set("q", "85");
      if (!u.searchParams.get("auto")) u.searchParams.set("auto", "format");
      if (!u.searchParams.get("fit")) u.searchParams.set("fit", "crop");
      return u.toString();
    } catch { /* fall through */ }
  }

  // SerpAPI thumbnail proxy → strip the fixed size param if present
  if (/serpapi\.com\/.*\/(images|photos)/i.test(trimmed)) {
    return trimmed.replace(/([?&])(w|h|size)=\d+/gi, "$1");
  }

  return trimmed;
}
