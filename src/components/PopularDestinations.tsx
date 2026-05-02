import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import DestinationCard from "./DestinationCard";
import { supabase } from "@/integrations/supabase/client";

interface Destination {
  id: string;
  city: string;
  country: string;
  code: string;
  image: string;
  description: string;
  description_ar: string | null;
  rating: number;
  avg_price: number;
  best_season: string;
  highlights: string[];
  sort_order: number;
}

const PopularDestinations = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const INITIAL_COUNT = 8;
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDestinations = async () => {
      const { data } = await supabase
        .from("destinations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (data) {
        setDestinations(data.map((d: any) => ({
          ...d,
          highlights: Array.isArray(d.highlights) ? d.highlights : [],
        })));
      }
      setLoading(false);
    };
    fetchDestinations();
  }, []);

  if (loading) {
    return (
      <section className="bg-secondary/30 py-16">
        <div className="section-container flex justify-center">
          <Loader2 className="animate-spin text-muted-foreground" size={32} />
        </div>
      </section>
    );
  }

  if (destinations.length === 0) return null;

  return (
    <section className="bg-secondary/30 py-16">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="text-primary text-sm font-semibold tracking-wider uppercase">{t('popularDest.exploreWorld', { defaultValue: 'EXPLORE THE WORLD' })}</span>
          <h2 className="text-3xl font-extrabold mt-2 mb-4 gradient-text">{t('popularDest.title', { defaultValue: 'Popular Destinations' })}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">{t('popularDest.subtitle', { defaultValue: 'Discover the most visited places around the world and start planning your next adventure' })}</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {destinations.slice(0, INITIAL_COUNT).map((d, i) => (
            <DestinationCard
              key={d.id}
              city={d.city}
              country={d.country}
              image={d.image}
              description={i18n.language === 'ar' && d.description_ar ? d.description_ar : d.description}
              delay={i}
              rating={d.rating}
              bestSeason={d.best_season}
              highlights={d.highlights}
            />
          ))}
        </div>

        <div className="mt-12 text-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/destinations')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
          >
            {t('popularDest.viewAll', { defaultValue: 'View All Destinations' })}
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </div>
    </section>
  );
};

export default PopularDestinations;
