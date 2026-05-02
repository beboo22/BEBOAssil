import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, Star, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface FeaturedAdventure {
  id: string;
  title: string;
  location: string;
  image: string;
  category: string;
  rating: number;
  gradient: string;
}

const FEATURED: FeaturedAdventure[] = [
  { id: 'f1', title: 'Santorini Sunset Experience', location: 'Greece', image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=900', category: 'BEACH', rating: 4.9, gradient: 'from-orange-500/70 to-pink-600/70' },
  { id: 'f2', title: 'Swiss Alps Hiking Trail', location: 'Switzerland', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900', category: 'MOUNTAIN', rating: 4.8, gradient: 'from-emerald-500/70 to-teal-700/70' },
  { id: 'f3', title: 'Tokyo Night Adventure', location: 'Japan', image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900', category: 'CITY', rating: 4.7, gradient: 'from-violet-500/70 to-purple-700/70' },
  { id: 'f4', title: 'Desert Safari Under Stars', location: 'UAE', image: 'https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=900', category: 'DESERT', rating: 4.9, gradient: 'from-amber-500/70 to-orange-700/70' },
  { id: 'f5', title: 'Maldives Diving Paradise', location: 'Maldives', image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=900', category: 'DIVING', rating: 5.0, gradient: 'from-cyan-500/70 to-blue-700/70' },
];

interface Props {
  onExplore?: (adventure: FeaturedAdventure) => void;
}

export const FeaturedAdventures: React.FC<Props> = ({ onExplore }) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrent(p => (p + 1) % FEATURED.length), 5000);
    return () => clearInterval(timer);
  }, []);

  const adv = FEATURED[current];

  return (
    <div className="relative rounded-2xl overflow-hidden h-52 md:h-64 group">
      <AnimatePresence mode="wait">
        <motion.div
          key={adv.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          <img src={adv.image} alt={adv.title} className="w-full h-full object-cover" />
          <div className={`absolute inset-0 bg-gradient-to-t ${adv.gradient}`} />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        <div className="flex items-center gap-2 mb-1">
          <Badge className="bg-white/20 backdrop-blur-sm text-white border-0 text-[10px] uppercase font-bold">{adv.category}</Badge>
          <div className="flex items-center gap-1 text-yellow-300 text-xs">
            <Star className="w-3 h-3 fill-current" />{adv.rating}
          </div>
        </div>
        <h3 className="text-white font-bold text-lg leading-tight">{adv.title}</h3>
        <div className="flex items-center gap-1 text-white/70 text-xs mt-0.5">
          <MapPin className="w-3 h-3" />{adv.location}
        </div>
        <Button size="sm" className="mt-2 h-7 text-xs rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 gap-1"
          onClick={() => {
            onExplore?.(adv);
            // Navigate to planner with destination pre-filled
            const params = new URLSearchParams({ destination: `${adv.title}, ${adv.location}` });
            if (adv.category) params.set('tripType', adv.category.toLowerCase());
            navigate(`/planner?${params.toString()}`);
          }}>
          {isArabic ? 'استكشف' : 'Explore'} <ArrowRight className="w-3 h-3" />
        </Button>
      </div>

      {/* Nav arrows */}
      <button onClick={() => setCurrent(p => (p - 1 + FEATURED.length) % FEATURED.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <ChevronLeft className="w-4 h-4 text-white" />
      </button>
      <button onClick={() => setCurrent(p => (p + 1) % FEATURED.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <ChevronRight className="w-4 h-4 text-white" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 right-4 z-10 flex gap-1">
        {FEATURED.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-white w-4' : 'bg-white/40'}`} />
        ))}
      </div>
    </div>
  );
};
