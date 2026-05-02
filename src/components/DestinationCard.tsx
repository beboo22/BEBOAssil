import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { MapPin, CalendarDays, Star, Sun, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

interface DestinationCardProps {
  city: string;
  country: string;
  image: string;
  description: string;
  delay?: number;
  rating?: number;
  bestSeason?: string;
  highlights?: string[];
}

const DestinationCard = ({ city, country, image, description, delay = 0, rating, bestSeason, highlights }: DestinationCardProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  const handlePlanTrip = () => {
    navigate(`/planner?destination=${encodeURIComponent(`${city}, ${country}`)}`);
  };

  const handleQuickBook = () => {
    navigate(`/bookings?to=${encodeURIComponent(city)}&tab=flights`);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: delay * 0.08 }}
      className="bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-border group"
    >
      <div className="relative h-48 overflow-hidden">
        <img
          src={image}
          alt={`${city}, ${country}`}
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        
        {/* Rating badge */}
        {rating && (
          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <Star size={10} className="fill-yellow-400 text-yellow-400" />
            {rating}
          </div>
        )}
        
        <div className="absolute bottom-4 left-4 text-white">
          <div className="flex items-center mb-1">
            <MapPin size={14} className="mr-1" />
            <span className="text-sm font-medium">{country}</span>
          </div>
          <h3 className="text-xl font-bold">{city}</h3>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <p className="text-muted-foreground text-sm line-clamp-2">{description}</p>
        
        {/* Highlights */}
        {highlights && highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {highlights.slice(0, 3).map((h) => (
              <Badge key={h} variant="secondary" className="text-[10px] font-normal">
                {h}
              </Badge>
            ))}
            {highlights.length > 3 && (
              <Badge variant="outline" className="text-[10px] font-normal">
                +{highlights.length - 3}
              </Badge>
            )}
          </div>
        )}
        
        {/* Best season */}
        {bestSeason && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sun size={12} className="text-primary" />
            <span>{t('popularDest.bestTime')}:</span>
            <span className="font-medium text-foreground">{bestSeason}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={handlePlanTrip}
          >
            <Sparkles size={12} />
            {t('popularDest.planTrip', { defaultValue: 'Plan Trip' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={handleQuickBook}
          >
            <CalendarDays size={12} />
            {t('popularDest.bookNow', { defaultValue: 'Book Now' })}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default DestinationCard;
