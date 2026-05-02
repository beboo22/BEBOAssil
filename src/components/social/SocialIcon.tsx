import { Link as LinkIcon } from "lucide-react";

export type SocialPlatform = "snapchat" | "x" | "tiktok" | "instagram" | "facebook" | "custom";

export const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "snapchat", label: "Snapchat" },
  { value: "x", label: "X" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "custom", label: "Custom" },
];

export const SocialIcon = ({ platform, className = "h-4 w-4", iconUrl }: { platform?: string; className?: string; iconUrl?: string }) => {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className={`${className} object-contain`} loading="lazy" />;
  }
  const key = String(platform || "custom").toLowerCase();
  if (key === "snapchat") {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M12.02 2.02c2.16 0 3.9 1.4 4.62 3.12.34.8.3 1.5.28 2.56l-.02.72c0 .2.07.28.17.28.24 0 .64-.22.95-.22.5 0 .82.34.82.73 0 .52-.55.91-1.64 1.15-.28.06-.36.16-.38.25-.04.16.08.36.2.55.5.8 1.2 1.36 2.22 1.62.3.08.78.22.76.7-.02.22-.18.5-.86.62-.25.04-.42.14-.48.28-.16.34-.4.56-.84.56-.2 0-.46-.04-.76-.1-.28-.06-.58-.12-.9-.12-.18 0-.36.02-.52.06-.34.08-.64.36-1 .7-.55.52-1.24 1.18-2.34 1.18h-.1c-1.1 0-1.8-.66-2.36-1.18-.36-.34-.66-.62-1-.7-.16-.04-.34-.06-.52-.06-.32 0-.62.06-.9.12-.3.06-.56.1-.76.1-.44 0-.68-.22-.84-.56-.06-.14-.23-.24-.48-.28-.68-.12-.84-.4-.86-.62-.02-.48.46-.62.76-.7 1.02-.26 1.72-.82 2.22-1.62.12-.2.24-.4.2-.55-.02-.1-.1-.2-.38-.25-1.09-.24-1.64-.63-1.64-1.15 0-.39.32-.73.82-.73.31 0 .71.22.95.22.1 0 .17-.08.17-.28l-.02-.72c-.02-1.06-.06-1.76.28-2.56.72-1.72 2.46-3.12 4.62-3.12Z" /></svg>;
  }
  if (key === "x") {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M17.53 3H20.7l-6.92 7.91L21.92 21h-6.37l-4.99-6.52L4.85 21H1.67l7.4-8.46L1.27 3h6.53l4.5 5.95L17.53 3Zm-1.11 16.22h1.76L6.84 4.69H4.95l11.47 14.53Z" /></svg>;
  }
  if (key === "tiktok") {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M16.6 3c.32 2.63 1.79 4.2 4.4 4.37v3.15c-1.52.15-2.85-.35-4.31-1.25v5.89c0 7.48-8.15 9.81-11.42 4.45-2.1-3.46-.82-9.53 5.93-9.77v3.32c-.5.08-1.04.21-1.53.38-1.47.5-2.3 1.44-2.07 3.11.44 3.19 6.3 4.13 5.82-2.1V3h3.18Z" /></svg>;
  }
  if (key === "instagram") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
  }
  if (key === "facebook") {
    return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.24 10.44 22v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22C18.34 21.24 22 17.08 22 12.06Z" /></svg>;
  }
  return <LinkIcon className={className} aria-hidden="true" />;
};