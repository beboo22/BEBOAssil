
import React from 'react';
import { CarResult } from '@/services/api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Car, Fuel, Users, Gauge, ExternalLink } from 'lucide-react';
import { useCurrency } from "@/hooks/useCurrency";

interface CarCardProps {
  car: CarResult;
}

const CarCard: React.FC<CarCardProps> = ({ car }) => {
  const { formatPrice } = useCurrency();

  return (
    <Card className="overflow-hidden bg-[#1F2937] border-gray-800 hover:border-[#22C55E]/50 transition-all h-full flex flex-col shadow-xl rounded-2xl group">
      <div className="h-48 bg-gray-800 relative overflow-hidden">
        {car.image ? (
          <img 
            src={car.image} 
            alt={car.name} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Car className="h-16 w-16 text-gray-700" />
          </div>
        )}
        <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
          <span className="text-[10px] font-bold text-white uppercase">{car.type}</span>
        </div>
        <Badge className="absolute top-3 right-3 bg-[#22C55E] text-white border-none font-bold">
          {car.vendor}
        </Badge>
      </div>

      <CardContent className="pt-5 flex-grow flex flex-col px-5 pb-5">
        <h3 className="font-bold text-lg text-white leading-tight mb-3 group-hover:text-[#22C55E] transition-colors">{car.name}</h3>
        
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex items-center text-xs text-gray-400">
            <Users className="h-3 w-3 mr-2 text-[#22C55E]" />
            <span>{car.seats || 5} مقاعد</span>
          </div>
          <div className="flex items-center text-xs text-gray-400">
            <Gauge className="h-3 w-3 mr-2 text-[#22C55E]" />
            <span>{car.transmission || 'Automatic'}</span>
          </div>
          <div className="flex items-center text-xs text-gray-400">
            <Fuel className="h-3 w-3 mr-2 text-[#22C55E]" />
            <span>{car.fuel || 'Petrol'}</span>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-gray-800/50 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">السعر / يوم</p>
            <p className="text-2xl font-black text-white">{formatPrice(car.price)}</p>
          </div>
          <Button 
            size="sm" 
            onClick={() => window.open(car.link, '_blank')}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold rounded-xl px-4 h-10 shadow-lg"
          >
            احجز الآن <ExternalLink size={12} className="ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CarCard;
