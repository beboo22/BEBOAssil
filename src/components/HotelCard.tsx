
import React from 'react';
import { HotelResult } from '@/services/api/types';
import { MapPin, Hotel, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from "@/hooks/useCurrency";

interface HotelCardProps {
  hotel: HotelResult;
}

const HotelCard: React.FC<HotelCardProps> = ({ hotel }) => {
  const { formatPrice } = useCurrency();
  
  const displayPrice = (amount: number) => {
    if (!amount || amount <= 0) return "—";
    return formatPrice(amount);
  };

  const handleViewDeal = () => {
    // Check if URL exists and is valid
    if (hotel.url) {
      // Ensure URL has proper http/https protocol
      let bookingUrl = hotel.url;
      if (!bookingUrl.startsWith('http')) {
        bookingUrl = `https://${bookingUrl}`;
      }
      
      // Open in new tab with security attributes
      window.open(bookingUrl, '_blank', 'noopener,noreferrer');
    } else {
      console.error('No valid booking URL available for this hotel');
      // Could add a toast notification here for better UX
    }
  };

  return (
    <Card className="overflow-hidden bg-[#1F2937] border-gray-800 hover:border-[#22C55E]/50 transition-all h-full flex flex-col shadow-xl rounded-2xl group">
      <div className="h-52 bg-gray-800 relative overflow-hidden">
        {hotel.imageUrl ? (
          <img 
            src={hotel.imageUrl} 
            alt={hotel.name} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Hotel className="h-16 w-16 text-gray-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F2937] via-transparent to-transparent opacity-60" />
        
        {hotel.starRating && hotel.starRating > 0 && (
          <div className="absolute top-3 left-3 flex gap-0.5 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
            {Array.from({length: hotel.starRating}).map((_, i) => (
              <Star key={i} size={10} className="fill-[#FACC15] text-[#FACC15]" />
            ))}
          </div>
        )}
        
        <Badge className="absolute top-3 right-3 bg-[#22C55E] text-white border-none font-bold">
          VIP DEAL
        </Badge>
      </div>

      <CardContent className="pt-5 flex-grow flex flex-col px-5 pb-5">
        <div className="mb-3">
          <h3 className="font-bold text-lg text-white leading-tight mb-1 group-hover:text-[#22C55E] transition-colors line-clamp-1">{hotel.name}</h3>
          <div className="flex items-center text-xs text-gray-400">
            <MapPin className="h-3 w-3 mr-1 text-[#22C55E]" />
            <span className="truncate">{hotel.address || hotel.location}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-[#22C55E]/10 text-[#22C55E] px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">
            {hotel.rating || "8.5"} Excellent
          </div>
          {hotel.reviewCount > 0 && (
            <span className="text-[10px] text-gray-500 font-medium">{hotel.reviewCount} reviews</span>
          )}
        </div>

        {hotel.amenities && hotel.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {hotel.amenities.slice(0, 3).map((amenity, index) => (
              <span key={index} className="text-[10px] bg-gray-800/50 text-gray-300 px-2 py-1 rounded-md border border-gray-700/50">
                {amenity}
              </span>
            ))}
          </div>
        )}
        
        <div className="mt-auto pt-4 border-t border-gray-800/50 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Price / Night</p>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-black text-white">
                {displayPrice(hotel.price)}
              </p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={handleViewDeal}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold rounded-xl px-4 h-10 shadow-lg shadow-green-900/20"
          >
            View Deal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const HotelCardSkeleton = () => {
  return (
    <Card className="overflow-hidden h-full">
      <Skeleton className="h-48 w-full" />
      <CardContent className="pt-4">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-1/2 mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardContent>
    </Card>
  );
};

export default HotelCard;
