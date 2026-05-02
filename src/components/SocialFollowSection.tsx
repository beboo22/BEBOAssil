import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { SocialIcon } from "@/components/social/SocialIcon";
import {
  DEFAULT_SOCIAL_LINKS,
  normalizeHref,
  normalizeSocialLinks,
  type SocialLinkConfig,
} from "@/components/social/socialLinks";

const PLATFORM_GRADIENT: Record<string, string> = {
  instagram: "linear-gradient(135deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)",
  tiktok: "linear-gradient(135deg,#25F4EE,#000000,#FE2C55)",
  snapchat: "linear-gradient(135deg,#FFFC00,#FFEB3B)",
  facebook: "linear-gradient(135deg,#1877F2,#0a4dab)",
  x: "linear-gradient(135deg,#0f172a,#000000)",
  twitter: "linear-gradient(135deg,#0f172a,#000000)",
  youtube: "linear-gradient(135deg,#FF0000,#b00000)",
  whatsapp: "linear-gradient(135deg,#25D366,#128C7E)",
  telegram: "linear-gradient(135deg,#37BBFE,#007ABF)",
  linkedin: "linear-gradient(135deg,#0A66C2,#004182)",
  threads: "linear-gradient(135deg,#000000,#262626)",
};

const SocialFollowSection = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [links, setLinks] = useState<SocialLinkConfig[]>(DEFAULT_SOCIAL_LINKS);

  useEffect(() => {
    let active = true;
    (supabase as any)
      .from("site_settings")
      .select("social_links")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }: any) => {
        if (!active) return;
        setLinks(normalizeSocialLinks(data?.social_links));
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = links.filter((l) => l.enabled && l.url);
  if (!visible.length) return null;

  return (
    <section className="py-14 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl md:text-4xl font-extrabold text-foreground mb-2">
            {isAr ? "تابعنا على وسائل التواصل" : "Follow Us On Social Media"}
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            {isAr
              ? "كن أول من يعلم بآخر العروض والوجهات والقصص الملهمة"
              : "Stay updated with our latest offers, destinations & inspiring stories"}
          </p>
        </motion.div>

        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
          {visible.map((link, idx) => {
            const key = (link.platform || "").toLowerCase();
            const bg = PLATFORM_GRADIENT[key] || "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))";
            return (
              <motion.a
                key={link.id}
                href={normalizeHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.name}
                title={link.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                whileHover={{ scale: 1.1, y: -4 }}
                whileTap={{ scale: 0.95 }}
                className="group relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl text-white shadow-lg hover:shadow-2xl transition-shadow"
                style={{ background: bg }}
              >
                <SocialIcon
                  platform={link.platform}
                  iconUrl={link.iconUrl}
                  className="h-7 w-7 md:h-9 md:w-9"
                />
                <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {link.name}
                </span>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SocialFollowSection;
