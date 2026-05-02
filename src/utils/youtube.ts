export function extractYouTubeVideoId(urlOrId?: string | null): string | null {
  if (!urlOrId) return null;
  const raw = urlOrId.trim();
  if (!raw) return null;

  // If it's already an 11-char id (common), accept it.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    // Support bare domains/paths without protocol
    const maybeUrl = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const url = new URL(maybeUrl);

    // youtu.be/<id>
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // youtube.com/embed/<id> or /shorts/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    const embedIndex = parts.findIndex(p => p === 'embed' || p === 'shorts');
    if (embedIndex >= 0 && parts[embedIndex + 1]) {
      const id = parts[embedIndex + 1];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {
    // ignore
  }

  return null;
}

export function getYouTubeThumbnail(urlOrId?: string | null): string | null {
  const id = extractYouTubeVideoId(urlOrId);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

