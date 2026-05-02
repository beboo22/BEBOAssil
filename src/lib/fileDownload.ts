const DOWNLOAD_FUNCTION = "download-product-file";

export const sanitizeDownloadFilename = (value?: string | null, fallback = "download") => {
  const raw = (value || fallback).trim() || fallback;
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
};

export const inferDownloadFilename = (url: string, label?: string | null) => {
  let fromUrl = "download";
  try {
    const parsed = new URL(url);
    fromUrl = decodeURIComponent(parsed.pathname.split("/").pop() || "download");
  } catch {
    fromUrl = url.split("/").pop()?.split("?")[0] || "download";
  }

  const extension = fromUrl.match(/\.[a-z0-9]{1,12}$/i)?.[0] || "";
  const preferred = label?.trim() || fromUrl;
  const withExtension = extension && !/\.[a-z0-9]{1,12}$/i.test(preferred) ? `${preferred}${extension}` : preferred;
  return sanitizeDownloadFilename(withExtension, sanitizeDownloadFilename(fromUrl));
};

export const getDownloadProxyUrl = (url: string, filename?: string | null) => {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${DOWNLOAD_FUNCTION}`;
  const proxy = new URL(base);
  proxy.searchParams.set("url", url);
  proxy.searchParams.set("filename", inferDownloadFilename(url, filename));
  return proxy.toString();
};

export const triggerFileDownload = (url: string, filename?: string | null) => {
  const finalName = inferDownloadFilename(url, filename);
  const anchor = document.createElement("a");
  anchor.href = getDownloadProxyUrl(url, finalName);
  anchor.download = finalName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 1000);
};