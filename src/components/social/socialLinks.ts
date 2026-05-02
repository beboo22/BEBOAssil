export type SocialLinkConfig = {
  id: string;
  name: string;
  platform: string;
  url: string;
  enabled: boolean;
  sortOrder?: number;
  iconUrl?: string;
};

export const DEFAULT_SOCIAL_LINKS: SocialLinkConfig[] = [
  { id: "snapchat", name: "Snapchat", platform: "snapchat", url: "https://www.snapchat.com/add/aseelaitrip?share_id=sdQ4HDjys5o&locale=ar-AE", enabled: true, sortOrder: 1 },
  { id: "x", name: "X", platform: "x", url: "https://x.com/Aseelaitrip", enabled: true, sortOrder: 2 },
  { id: "tiktok", name: "TikTok", platform: "tiktok", url: "https://www.tiktok.com/@aseelaitrip?_r=1&_t=ZN-95zpQrYrY2w", enabled: true, sortOrder: 3 },
  { id: "instagram", name: "Instagram", platform: "instagram", url: "https://www.instagram.com/aseelaitrip?igsh=MXh3bGNreHdkOWhqNQ==", enabled: true, sortOrder: 4 },
  { id: "facebook", name: "Facebook", platform: "facebook", url: "https://www.facebook.com/share/1GhHPg3gmL/", enabled: true, sortOrder: 5 },
];

export const normalizeSocialLinks = (value: unknown): SocialLinkConfig[] => {
  const source = Array.isArray(value) ? value : DEFAULT_SOCIAL_LINKS;
  return source
    .map((item: any, index) => ({
      id: String(item?.id || `${item?.platform || "custom"}-${index}-${Date.now()}`),
      name: String(item?.name || item?.platform || "Link"),
      platform: String(item?.platform || "custom").toLowerCase(),
      url: String(item?.url || ""),
      enabled: item?.enabled !== false,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index + 1,
      iconUrl: typeof item?.iconUrl === "string" ? item.iconUrl : undefined,
    }))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
};

export const normalizeHref = (url: string): string => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "#";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};