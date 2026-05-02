import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Zap, Calendar, MapPin, Navigation, Shuffle, Heart, Globe, Map } from 'lucide-react';
import { cn } from '@/lib/utils';

export type QuickTripType = 'short' | 'weekend' | 'in-city' | 'nearby' | 'random' | 'free' | 'country-tour' | 'region-tour';

interface QuickTripTypesProps {
  selected: QuickTripType | null;
  onSelect: (type: QuickTripType | null) => void;
}

const QuickTripTypes = ({ selected, onSelect }: QuickTripTypesProps) => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');

  const types: { id: QuickTripType; icon: any; label: string; color: string }[] = [
    { id: 'short', icon: Zap, label: t('quickTrip.short'), color: 'text-amber-500' },
    { id: 'weekend', icon: Calendar, label: t('quickTrip.weekend'), color: 'text-blue-500' },
    { id: 'in-city', icon: MapPin, label: t('quickTrip.inCity'), color: 'text-emerald-500' },
    { id: 'nearby', icon: Navigation, label: t('quickTrip.nearby'), color: 'text-violet-500' },
    { id: 'country-tour', icon: Globe, label: isAr ? 'جولة في دولة' : 'Country Tour', color: 'text-orange-500' },
    { id: 'region-tour', icon: Map, label: isAr ? 'جولة في منطقة/قارة' : 'Region Tour', color: 'text-cyan-500' },
    { id: 'random', icon: Shuffle, label: t('quickTrip.random'), color: 'text-rose-500' },
    { id: 'free', icon: Heart, label: t('quickTrip.free'), color: 'text-teal-500' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        {t('quickTrip.title')}
      </h3>
      <div className="flex flex-wrap gap-2">
        {types.map(({ id, icon: Icon, label, color }) => (
          <motion.button
            key={id}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(selected === id ? null : id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all',
              selected === id
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border hover:border-primary/40 bg-card text-foreground'
            )}
          >
            <Icon
              size={16}
              className={selected === id ? 'text-primary' : color}
            />
            <span>{label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default QuickTripTypes;
