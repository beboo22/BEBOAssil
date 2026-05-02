import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, MapPin, Palmtree, Mountain, Building2, Ship, Landmark, Sparkles, Heart, Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface TripTemplate {
  id: string;
  icon: any;
  label: string;
  labelAr: string;
  country?: string;
  region?: string;
  cities: { city: string; days: number }[];
  duration: number;
  type: 'country-tour' | 'region-tour';
  gradient: string;
  emoji: string;
  isCustom?: boolean;
}

const BUILT_IN_TEMPLATES: TripTemplate[] = [
  {
    id: 'gulf-tour', icon: Building2, label: 'Gulf Tour', labelAr: 'جولة الخليج العربي',
    region: 'Gulf',
    cities: [{ city: 'Dubai', days: 3 }, { city: 'Abu Dhabi', days: 2 }, { city: 'Doha', days: 2 }, { city: 'Manama', days: 1 }, { city: 'Muscat', days: 2 }],
    duration: 12, type: 'region-tour', gradient: 'from-amber-500 to-orange-600', emoji: '🏙️',
  },
  {
    id: 'classic-europe', icon: Landmark, label: 'Classic Europe', labelAr: 'جولة أوروبا الكلاسيكية',
    region: 'Europe',
    cities: [{ city: 'Paris', days: 3 }, { city: 'Rome', days: 3 }, { city: 'Barcelona', days: 2 }, { city: 'London', days: 3 }],
    duration: 14, type: 'region-tour', gradient: 'from-blue-500 to-indigo-600', emoji: '🏰',
  },
  {
    id: 'turkey-tour', icon: Globe, label: 'Discover Turkey', labelAr: 'اكتشف تركيا',
    country: 'Turkey',
    cities: [{ city: 'Istanbul', days: 3 }, { city: 'Cappadocia', days: 2 }, { city: 'Antalya', days: 2 }, { city: 'Bodrum', days: 2 }],
    duration: 10, type: 'country-tour', gradient: 'from-red-500 to-rose-600', emoji: '🇹🇷',
  },
  {
    id: 'saudi-tour', icon: Mountain, label: 'Discover Saudi Arabia', labelAr: 'اكتشف السعودية',
    country: 'Saudi Arabia',
    cities: [{ city: 'Riyadh', days: 2 }, { city: 'Jeddah', days: 2 }, { city: 'AlUla', days: 2 }, { city: 'NEOM', days: 2 }, { city: 'Abha', days: 2 }],
    duration: 12, type: 'country-tour', gradient: 'from-emerald-500 to-green-600', emoji: '🇸🇦',
  },
  {
    id: 'southeast-asia', icon: Palmtree, label: 'Southeast Asia', labelAr: 'جنوب شرق آسيا',
    region: 'Southeast Asia',
    cities: [{ city: 'Bangkok', days: 3 }, { city: 'Bali', days: 3 }, { city: 'Singapore', days: 2 }, { city: 'Kuala Lumpur', days: 2 }],
    duration: 12, type: 'region-tour', gradient: 'from-teal-500 to-cyan-600', emoji: '🌴',
  },
  {
    id: 'egypt-tour', icon: Landmark, label: 'Discover Egypt', labelAr: 'اكتشف مصر',
    country: 'Egypt',
    cities: [{ city: 'Cairo', days: 3 }, { city: 'Luxor', days: 2 }, { city: 'Aswan', days: 2 }, { city: 'Hurghada', days: 2 }],
    duration: 10, type: 'country-tour', gradient: 'from-yellow-500 to-amber-600', emoji: '🇪🇬',
  },
  {
    id: 'usa-highlights', icon: Building2, label: 'USA Highlights', labelAr: 'أبرز معالم أمريكا',
    country: 'United States',
    cities: [{ city: 'New York', days: 3 }, { city: 'Los Angeles', days: 2 }, { city: 'Miami', days: 2 }, { city: 'Las Vegas', days: 2 }],
    duration: 12, type: 'country-tour', gradient: 'from-violet-500 to-purple-600', emoji: '🇺🇸',
  },
  {
    id: 'mediterranean-cruise', icon: Ship, label: 'Mediterranean', labelAr: 'جولة البحر المتوسط',
    region: 'Mediterranean',
    cities: [{ city: 'Athens', days: 2 }, { city: 'Santorini', days: 2 }, { city: 'Dubrovnik', days: 2 }, { city: 'Amalfi Coast', days: 2 }],
    duration: 10, type: 'region-tour', gradient: 'from-sky-500 to-blue-600', emoji: '⛵',
  },
  // New templates
  {
    id: 'japan-tour', icon: Landmark, label: 'Discover Japan', labelAr: 'اكتشف اليابان',
    country: 'Japan',
    cities: [{ city: 'Tokyo', days: 3 }, { city: 'Kyoto', days: 2 }, { city: 'Osaka', days: 2 }, { city: 'Hiroshima', days: 1 }, { city: 'Hakone', days: 1 }],
    duration: 11, type: 'country-tour', gradient: 'from-rose-400 to-red-600', emoji: '🇯🇵',
  },
  {
    id: 'morocco-tour', icon: Globe, label: 'Discover Morocco', labelAr: 'اكتشف المغرب',
    country: 'Morocco',
    cities: [{ city: 'Marrakech', days: 3 }, { city: 'Fes', days: 2 }, { city: 'Chefchaouen', days: 1 }, { city: 'Sahara Desert', days: 2 }, { city: 'Casablanca', days: 1 }],
    duration: 10, type: 'country-tour', gradient: 'from-orange-400 to-red-500', emoji: '🇲🇦',
  },
  {
    id: 'latin-america', icon: Palmtree, label: 'Latin America', labelAr: 'أمريكا اللاتينية',
    region: 'Latin America',
    cities: [{ city: 'Mexico City', days: 3 }, { city: 'Cancún', days: 2 }, { city: 'Bogotá', days: 2 }, { city: 'Lima', days: 2 }, { city: 'Buenos Aires', days: 3 }],
    duration: 14, type: 'region-tour', gradient: 'from-lime-500 to-green-600', emoji: '🌎',
  },
  {
    id: 'india-tour', icon: Landmark, label: 'Discover India', labelAr: 'اكتشف الهند',
    country: 'India',
    cities: [{ city: 'Delhi', days: 2 }, { city: 'Agra', days: 1 }, { city: 'Jaipur', days: 2 }, { city: 'Goa', days: 3 }, { city: 'Mumbai', days: 2 }],
    duration: 12, type: 'country-tour', gradient: 'from-orange-500 to-yellow-500', emoji: '🇮🇳',
  },
  {
    id: 'uk-ireland', icon: Landmark, label: 'UK & Ireland', labelAr: 'بريطانيا وأيرلندا',
    region: 'UK & Ireland',
    cities: [{ city: 'London', days: 3 }, { city: 'Edinburgh', days: 2 }, { city: 'Dublin', days: 2 }, { city: 'Liverpool', days: 1 }],
    duration: 10, type: 'region-tour', gradient: 'from-slate-500 to-blue-700', emoji: '🇬🇧',
  },
  {
    id: 'south-korea', icon: Building2, label: 'Discover South Korea', labelAr: 'اكتشف كوريا الجنوبية',
    country: 'South Korea',
    cities: [{ city: 'Seoul', days: 3 }, { city: 'Busan', days: 2 }, { city: 'Jeju Island', days: 2 }, { city: 'Gyeongju', days: 1 }],
    duration: 9, type: 'country-tour', gradient: 'from-blue-400 to-indigo-500', emoji: '🇰🇷',
  },
  {
    id: 'scandinavia', icon: Mountain, label: 'Scandinavia', labelAr: 'الدول الاسكندنافية',
    region: 'Scandinavia',
    cities: [{ city: 'Copenhagen', days: 2 }, { city: 'Stockholm', days: 2 }, { city: 'Oslo', days: 2 }, { city: 'Bergen', days: 2 }],
    duration: 10, type: 'region-tour', gradient: 'from-cyan-400 to-blue-500', emoji: '❄️',
  },
];

const CUSTOM_TEMPLATES_KEY = 'custom_trip_templates';

const getStoredTemplates = (): TripTemplate[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveStoredTemplates = (templates: TripTemplate[]) => {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
};

const CUSTOM_GRADIENTS = [
  'from-fuchsia-500 to-pink-600',
  'from-cyan-500 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-indigo-400 to-purple-500',
  'from-emerald-400 to-green-500',
  'from-rose-400 to-red-500',
];

interface TripTemplatesProps {
  onSelect: (template: TripTemplate) => void;
}

const TripTemplates = ({ onSelect }: TripTemplatesProps) => {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language?.startsWith('ar');
  const [showAll, setShowAll] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<TripTemplate[]>(getStoredTemplates());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newCities, setNewCities] = useState<{ city: string; days: number }[]>([{ city: '', days: 2 }]);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];
  const displayedTemplates = showAll ? allTemplates : allTemplates.slice(0, 8);

  const handleCreateTemplate = () => {
    if (!newName.trim() || newCities.filter(c => c.city.trim()).length === 0) {
      toast.error(isAr ? 'أدخل اسم القالب ومدينة واحدة على الأقل' : 'Enter template name and at least one city');
      return;
    }
    const validCities = newCities.filter(c => c.city.trim());
    const totalDays = validCities.reduce((s, c) => s + c.days, 0);
    const newTemplate: TripTemplate = {
      id: `custom-${Date.now()}`,
      icon: Heart,
      label: newName.trim(),
      labelAr: newName.trim(),
      country: newCountry.trim() || undefined,
      region: !newCountry.trim() ? newName.trim() : undefined,
      cities: validCities,
      duration: totalDays,
      type: newCountry.trim() ? 'country-tour' : 'region-tour',
      gradient: CUSTOM_GRADIENTS[customTemplates.length % CUSTOM_GRADIENTS.length],
      emoji: '✈️',
      isCustom: true,
    };
    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    saveStoredTemplates(updated);
    setShowCreateForm(false);
    setNewName('');
    setNewCountry('');
    setNewCities([{ city: '', days: 2 }]);
    toast.success(isAr ? 'تم حفظ القالب بنجاح!' : 'Template saved!');
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    saveStoredTemplates(updated);
    toast.success(isAr ? 'تم حذف القالب' : 'Template deleted');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {isAr ? 'قوالب رحلات جاهزة' : 'Ready Trip Templates'}
          </h3>
          <span className="text-xs text-muted-foreground">
            ({allTemplates.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus size={14} className="mr-1" />
            {isAr ? 'قالب مخصص' : 'Custom'}
          </Button>
        </div>
      </div>

      {/* Create custom template form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-muted/50 rounded-xl p-3 space-y-2 border border-border"
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder={isAr ? 'اسم القالب' : 'Template name'}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder={isAr ? 'الدولة (اختياري)' : 'Country (optional)'}
                value={newCountry}
                onChange={e => setNewCountry(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              {newCities.map((c, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input
                    placeholder={isAr ? `مدينة ${i + 1}` : `City ${i + 1}`}
                    value={c.city}
                    onChange={e => {
                      const updated = [...newCities];
                      updated[i].city = e.target.value;
                      setNewCities(updated);
                    }}
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={c.days}
                    onChange={e => {
                      const updated = [...newCities];
                      updated[i].days = parseInt(e.target.value) || 1;
                      setNewCities(updated);
                    }}
                    className="h-7 text-xs w-14"
                  />
                  <span className="text-[10px] text-muted-foreground">{isAr ? 'يوم' : 'days'}</span>
                  {newCities.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewCities(newCities.filter((_, j) => j !== i))}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setNewCities([...newCities, { city: '', days: 2 }])}>
                <Plus size={10} className="mr-1" /> {isAr ? 'مدينة' : 'City'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-7 text-xs" onClick={handleCreateTemplate}>
                <Save size={12} className="mr-1" /> {isAr ? 'حفظ' : 'Save'}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCreateForm(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {displayedTemplates.map((tmpl, idx) => {
          const Icon = tmpl.icon || Globe;
          return (
            <motion.div key={tmpl.id} className="relative group">
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onSelect(tmpl)}
                className={cn(
                  'w-full relative overflow-hidden rounded-xl p-3 text-white text-start transition-shadow hover:shadow-lg',
                  `bg-gradient-to-br ${tmpl.gradient}`
                )}
              >
                <div className="absolute top-1 end-1 text-2xl opacity-30">{tmpl.emoji}</div>
                <Icon size={18} className="mb-1.5 opacity-90" />
                <p className="text-xs font-bold leading-tight truncate">
                  {isAr ? tmpl.labelAr : tmpl.label}
                </p>
                <p className="text-[10px] opacity-75 mt-0.5">
                  {tmpl.cities.length} {isAr ? 'مدن' : 'cities'} · {tmpl.duration} {isAr ? 'يوم' : 'days'}
                </p>
              </motion.button>
              {tmpl.isCustom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(tmpl.id); }}
                  className="absolute -top-1 -end-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {allTemplates.length > 8 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? (isAr ? 'عرض أقل' : 'Show less')
            : (isAr ? `عرض الكل (${allTemplates.length})` : `Show all (${allTemplates.length})`)}
          {showAll ? <ChevronUp size={12} className="ml-1" /> : <ChevronDown size={12} className="ml-1" />}
        </Button>
      )}
    </div>
  );
};

export default TripTemplates;
