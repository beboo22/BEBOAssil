import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SocialIcon } from "@/components/social/SocialIcon";
import { DEFAULT_SOCIAL_LINKS, normalizeHref, normalizeSocialLinks, type SocialLinkConfig } from "@/components/social/socialLinks";

const SocialLinksFooter = () => {
  const [links, setLinks] = useState<SocialLinkConfig[]>(DEFAULT_SOCIAL_LINKS);

  useEffect(() => {
    let active = true;
    (supabase as any)
      .from("site_settings")
      .select("social_links")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setLinks(normalizeSocialLinks((data as any)?.social_links));
      });
    return () => { active = false; };
  }, []);

  const visible = links.filter((link) => link.enabled && link.url);
  if (!visible.length) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Official social links">
      {visible.map((link) => (
        <a
          key={link.id}
          href={normalizeHref(link.url)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.name}
          title={link.name}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <SocialIcon platform={link.platform} iconUrl={link.iconUrl} className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
};

export default SocialLinksFooter;