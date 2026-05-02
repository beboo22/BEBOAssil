
import React from 'react';
import { TransferResult } from '@/services/api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bus, Users, Luggage, ExternalLink, ShieldCheck } from 'lucide-react';
import { useCurrency } from "@/hooks/useCurrency";

interface TransferCardProps {
  transfer: TransferResult;
}

const TransferCard: React.FC<TransferCardProps> = ({ transfer }) => {
  const { formatPrice } = useCurrency();

  return (
    <Card className="overflow-hidden bg-[#1F2937] border-gray-800 hover:border-[#22C55E]/50 transition-all h-full flex flex-col shadow-xl rounded-2xl group">
      <div className="h-44 bg-gray-800 relative overflow-hidden">
        {transfer.image ? (
          <img 
            src={transfer.image} 
            alt={transfer.name} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Bus className="h-16 w-16 text-gray-700" />
          </div>
        )}
        <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
          <span className="text-[10px] font-bold text-white uppercase">{transfer.type}</span>
        </div>
        <div className="absolute top-3 right-3">
          <Badge className="bg-[#22C55E] text-white border-none font-bold">
            {transfer.vendor}
          </Badge>
        </div>
      </div>

      <CardContent className="pt-5 flex-grow flex flex-col px-5 pb-5">
        <h3 className="font-bold text-lg text-white leading-tight mb-3 group-hover:text-[#22C55E] transition-colors">{transfer.name}</h3>
        
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center text-xs text-gray-400">
            <Users className="h-3 w-3 mr-2 text-[#22C55E]" />
            <span>حتى {transfer.passengers || 4} مسافرين</span>
          </div>
          <div className="flex items-center text-xs text-gray-400">
            <Luggage className="h-3 w-3 mr-2 text-[#22C55E]" />
            <span>حتى {transfer.luggage || 3} حقائب</span>
          </div>
          <div className="flex items-center text-xs text-[#22C55E]">
            <ShieldCheck className="h-3 w-3 mr-2" />
            <span>إلغاء مجاني • استقبال في المطار</span>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-gray-800/50 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">سعر الرحلة</p>
            <p className="text-2xl font-black text-white">{formatPrice(transfer.price)}</p>
          </div>
          <Button 
            size="sm" 
            onClick={() => window.open(transfer.link, '_blank')}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold rounded-xl px-4 h-10 shadow-lg"
          >
            احجز الآن <ExternalLink size={12} className="ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransferCard;
