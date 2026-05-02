import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface StoreLink {
  enabled: boolean;
  url: string;
}

interface AppStoreConfig {
  apple: StoreLink;
  google: StoreLink;
  huawei: StoreLink;
}

const AppStoreLinks = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppStoreConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase.from("site_settings").select("app_store_links").eq("id", "default").single();
      if (data?.app_store_links) {
        setConfig(data.app_store_links as unknown as AppStoreConfig);
      }
    };
    fetchConfig();
  }, []);

  if (!config) return null;

  const hasAny = config.apple?.enabled || config.google?.enabled || config.huawei?.enabled;
  if (!hasAny) return null;

  return (
    <section className="py-12 bg-gradient-to-b from-secondary/30 to-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center space-y-6"
        >
          <h2 className="text-2xl md:text-3xl font-bold">
            {t("appStore.title", { defaultValue: "حمّل التطبيق الآن" })}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t("appStore.subtitle", { defaultValue: "احصل على تجربة أفضل مع تطبيقنا المتوفر على جميع المنصات" })}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            {config.apple?.enabled && config.apple?.url && (
              <motion.a
                href={config.apple.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block"
              >
                <div className="bg-black text-white rounded-xl px-5 py-3 flex items-center gap-3 min-w-[180px] hover:bg-black/90 transition-colors">
                  <svg viewBox="0 0 384 512" className="w-7 h-7 fill-current">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                  </svg>
                  <div className="text-right">
                    <p className="text-[10px] opacity-80">Download on the</p>
                    <p className="text-base font-semibold -mt-0.5">App Store</p>
                  </div>
                </div>
              </motion.a>
            )}

            {config.google?.enabled && config.google?.url && (
              <motion.a
                href={config.google.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block"
              >
                <div className="bg-black text-white rounded-xl px-5 py-3 flex items-center gap-3 min-w-[180px] hover:bg-black/90 transition-colors">
                  <svg viewBox="0 0 512 512" className="w-7 h-7 fill-current">
                    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.4c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
                  </svg>
                  <div className="text-right">
                    <p className="text-[10px] opacity-80">GET IT ON</p>
                    <p className="text-base font-semibold -mt-0.5">Google Play</p>
                  </div>
                </div>
              </motion.a>
            )}

            {config.huawei?.enabled && config.huawei?.url && (
              <motion.a
                href={config.huawei.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block"
              >
                <div className="bg-[#C7002B] text-white rounded-xl px-5 py-3 flex items-center gap-3 min-w-[180px] hover:bg-[#a80024] transition-colors">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H9V7h2v10zm4 0h-2V7h2v10z"/>
                  </svg>
                  <div className="text-right">
                    <p className="text-[10px] opacity-80">EXPLORE IT ON</p>
                    <p className="text-base font-semibold -mt-0.5">AppGallery</p>
                  </div>
                </div>
              </motion.a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AppStoreLinks;
