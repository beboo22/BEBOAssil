import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plane, MapPin, Sparkles } from "lucide-react";
import { useTranslation } from 'react-i18next';

const HeroSection = () => {
  const [loaded, setLoaded] = useState(false);
  const { t } = useTranslation();
  useEffect(() => { setLoaded(true); }, []);

  return (
    <section className="relative overflow-hidden pt-4 pb-12 sm:pt-10 sm:pb-16" style={{ background: 'var(--gradient-hero)' }}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-[10%] w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-[15%] w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute top-32 right-[20%] hidden lg:block">
          <Plane className="w-12 h-12 text-white/20 rotate-[-30deg]" />
        </motion.div>
      </div>
      <div className="container mx-auto px-4 z-10 relative">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: loaded ? 1 : 0, y: loaded ? 0 : -20 }} transition={{ duration: 0.8 }} className="text-center max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 text-sm font-medium px-4 py-2 rounded-full mb-6 border border-white/10">
            <Sparkles size={14} className="text-accent" />
            {t('hero.badge')}
          </motion.div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-5 tracking-tight text-white leading-[1.1]">
            {t('hero.title')}
            <span className="block text-accent mt-1">{t('hero.titleAccent')}</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed mb-8">
            {t('hero.subtitle')}
          </p>
          <motion.a href="#plan-trip" whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-8 py-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 text-lg">
            <MapPin size={20} />
            {t('hero.cta')}
          </motion.a>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
