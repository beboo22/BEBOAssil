import { motion } from "framer-motion";
import { Globe, Clock, MapPin, Star, Calendar, Users, Shield, Zap } from "lucide-react";
import { useTranslation } from 'react-i18next';

const Features = () => {
  const { t } = useTranslation();

  const features = [
    { icon: <Zap className="w-6 h-6" />, title: t('features.aiAdvanced'), description: t('features.aiAdvancedDesc') },
    { icon: <MapPin className="w-6 h-6" />, title: t('features.realPlaces'), description: t('features.realPlacesDesc') },
    { icon: <Globe className="w-6 h-6" />, title: t('features.globalCoverage'), description: t('features.globalCoverageDesc') },
    { icon: <Calendar className="w-6 h-6" />, title: t('features.flexPlanning'), description: t('features.flexPlanningDesc') },
    { icon: <Star className="w-6 h-6" />, title: t('features.personalPrefs'), description: t('features.personalPrefsDesc') },
    { icon: <Users className="w-6 h-6" />, title: t('features.groupTrips'), description: t('features.groupTripsDesc') },
    { icon: <Shield className="w-6 h-6" />, title: t('features.secureBooking'), description: t('features.secureBookingDesc') },
    { icon: <Clock className="w-6 h-6" />, title: t('features.liveUpdates'), description: t('features.liveUpdatesDesc') },
  ];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
          <span className="text-primary text-sm font-semibold tracking-wider uppercase">{t('features.sectionLabel')}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-2 mb-4 gradient-text">{t('features.title')}</h2>
          <p className="text-muted-foreground max-w-3xl mx-auto text-lg">{t('features.subtitle')}</p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feature, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: index * 0.07 }} whileHover={{ y: -6 }} className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 mb-4 rounded-xl flex items-center justify-center text-primary-foreground" style={{ background: 'var(--gradient-primary)' }}>
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-2 text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
