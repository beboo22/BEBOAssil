import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Megaphone, ArrowRight, Sparkles, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Promotion {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  media_urls: string[];
  media_type: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

const HomepagePromotions = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(6);
      if (data) setPromotions(data as any);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading || promotions.length === 0) return null;

  return (
    <section className="py-16 bg-gradient-to-b from-background to-secondary/10" dir={isAr ? "rtl" : "ltr"}>
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
            <Megaphone size={14} /> {t('promotions.exclusiveOffers')}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-3 gradient-text">
            {t('promotions.featuredOffersTitle')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t('promotions.featuredOffersSubtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {promotions.map((promo, idx) => {
            const title = isAr ? promo.title_ar || promo.title : promo.title;
            const desc = isAr ? promo.description_ar || promo.description : promo.description;
            const heroImage = promo.media_urls?.[0];

            return (
              <motion.div
                key={promo.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group cursor-pointer"
                onClick={() => navigate(`/promotions/${promo.id}`)}
              >
                <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
                  <div className="relative h-48 overflow-hidden">
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <Megaphone size={48} className="text-primary/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {promo.start_date && (
                      <Badge className="absolute top-3 start-3 bg-primary/90 text-primary-foreground backdrop-blur-sm gap-1">
                        <Calendar size={10} />
                        {format(new Date(promo.start_date), "dd MMM yyyy")}
                      </Badge>
                    )}
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="text-lg font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {desc?.replace(/<[^>]*>/g, "").slice(0, 120)}...
                    </p>
                    <div className="flex items-center justify-between pt-2">
                      <Button variant="ghost" size="sm" className="gap-1 text-primary p-0 h-auto hover:bg-transparent hover:gap-2 transition-all">
                        {t('promotions.viewDetails')} <ArrowRight size={14} className={isAr ? "rotate-180" : ""} />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-10"
        >
          <Button
            size="lg"
            variant="outline"
            className="gap-2 rounded-full px-8"
            onClick={() => navigate("/promotions")}
          >
            <Sparkles size={16} /> {t('promotions.viewAllOffers')}
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default HomepagePromotions;
