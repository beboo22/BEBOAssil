import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

const AnimatedNumber = ({ end, suffix = "", formatter }: { end: number; suffix?: string; formatter: Intl.NumberFormat }) => {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView({ threshold: 0.3, triggerOnce: true });

  useEffect(() => {
    if (!inView) return;
    let start: number;
    const animate = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / 2000, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 4)) * end));
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [inView, end]);

  return <span ref={ref}>{formatter.format(count)}{suffix}</span>;
};

const Stats = () => {
  const { t, i18n } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language || "en-US", { numberingSystem: "latn" }),
    [i18n.language]
  );

  const isArabic = i18n.language?.startsWith("ar");
  const [realStats, setRealStats] = useState({ cities: 33500, countries: 210, events: 108, promotions: 4 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [citiesRes, countriesRes, eventsRes, promotionsRes, destinationsRes] = await Promise.all([
          supabase.from("world_cities").select("*", { count: "exact", head: true }),
          supabase.from("world_cities").select("country_code", { head: false }).not("country_code", "is", null),
          supabase.from("global_events").select("*", { count: "exact", head: true }),
          supabase.from("promotions").select("*", { count: "exact", head: true }),
          supabase.from("destinations").select("*", { count: "exact", head: true }).eq("is_active", true),
        ]);

        const uniqueCountries = new Set(
          (countriesRes.data || []).map((r: any) => r.country_code).filter(Boolean)
        );

        setRealStats({
          cities: Math.max(citiesRes.count || 0, 30000),
          countries: Math.max(uniqueCountries.size, 195),
          events: Math.max(eventsRes.count || 0, (destinationsRes.count || 0), 100),
          promotions: Math.max(promotionsRes.count || 0, 4),
        });
      } catch (e) {
        console.warn("Stats fetch error:", e);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    { number: realStats.cities, label: isArabic ? "مدينة حول العالم" : "World Cities", suffix: "+" },
    { number: realStats.countries, label: isArabic ? "دولة مدعومة" : "Countries Supported", suffix: "+" },
    { number: realStats.events, label: isArabic ? "فعالية عالمية" : "Global Events", suffix: "+" },
    { number: realStats.promotions, label: isArabic ? "عرض حصري" : "Exclusive Offers", suffix: "+" },
  ];

  return (
    <section className="py-20 relative overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
      </div>
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
              className="text-center"
            >
              <div className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-2 tracking-tight tabular-nums drop-shadow-sm">
                <AnimatedNumber end={stat.number} suffix={stat.suffix} formatter={numberFormatter} />
              </div>
              <div className="text-white/80 text-sm md:text-base font-medium uppercase tracking-wide">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
