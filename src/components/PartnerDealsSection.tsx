import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hotel, Car, Home, Ticket, Star, MapPin, ExternalLink, Phone, MessageCircle, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface PartnerDealsSectionProps {
  city: string;
  country?: string;
}

interface PartnerListing {
  id: string;
  listing_type: string;
  title: string;
  title_ar: string | null;
  description: string;
  city: string;
  country: string;
  price: number;
  original_price: number | null;
  currency: string;
  media_urls: string[];
  booking_url: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  amenities: string[];
  rating: number;
  is_featured: boolean;
  partner_name: string | null;
  address: string | null;
}

const PartnerDealsSection = ({ city, country }: PartnerDealsSectionProps) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const navigate = useNavigate();
  const [deals, setDeals] = useState<PartnerListing[]>([]);

  useEffect(() => {
    if (!city) return;
    const fetchDeals = async () => {
      const cityNorm = city.toLowerCase().trim();
      const { data } = await supabase
        .from("partner_listings")
        .select("*")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .limit(6);
      
      if (data) {
        // Filter by city match (case-insensitive)
        const filtered = data.filter((d: any) =>
          d.city.toLowerCase().includes(cityNorm) ||
          cityNorm.includes(d.city.toLowerCase()) ||
          (country && d.country.toLowerCase().includes(country.toLowerCase()))
        );
        setDeals(filtered as any);
      }
    };
    fetchDeals();
  }, [city, country]);

  if (deals.length === 0) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "hotel": return <Hotel size={14} />;
      case "car_rental": return <Car size={14} />;
      case "apartment": return <Home size={14} />;
      default: return <Ticket size={14} />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      hotel: { en: "Hotel", ar: "فندق" },
      car_rental: { en: "Car Rental", ar: "تأجير سيارة" },
      apartment: { en: "Apartment", ar: "شقة" },
      activity: { en: "Activity", ar: "فعالية" },
    };
    return isAr ? labels[type]?.ar || type : labels[type]?.en || type;
  };

  return (
    <div className="mt-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Star className="text-yellow-500" size={18} />
          {isAr ? `عروض حصرية في ${city}` : `Exclusive Deals in ${city}`}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => navigate("/store")} className="text-xs text-primary">
          {isAr ? "عرض الكل" : "View All"} →
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {deals.map((deal, idx) => (
          <motion.div key={deal.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <Card className="overflow-hidden hover:shadow-lg transition-all group">
              {deal.media_urls?.[0] && (
                <div className="relative h-28 overflow-hidden">
                  <img src={deal.media_urls[0]} alt={deal.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <Badge className="absolute top-2 start-2 text-[10px] gap-1">
                    {getTypeIcon(deal.listing_type)} {getTypeLabel(deal.listing_type)}
                  </Badge>
                  {deal.is_featured && (
                    <Badge className="absolute top-2 end-2 bg-yellow-500 text-[10px]">⭐ {isAr ? "مميز" : "Featured"}</Badge>
                  )}
                </div>
              )}
              <div className="p-3">
                <h4 className="font-bold text-sm line-clamp-1">{isAr && deal.title_ar ? deal.title_ar : deal.title}</h4>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin size={10} /> {deal.city}, {deal.country}
                </p>
                {deal.rating > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={10} className="text-yellow-500 fill-yellow-500" />
                    <span className="text-[11px] font-medium">{deal.rating}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <span className="font-bold text-primary text-sm">{deal.price} {deal.currency}</span>
                    {deal.original_price && deal.original_price > deal.price && (
                      <span className="text-[10px] line-through text-muted-foreground ms-1">{deal.original_price}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {deal.booking_url && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => window.open(deal.booking_url!, "_blank")}>
                        <ExternalLink size={10} />
                      </Button>
                    )}
                    {deal.contact_whatsapp && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => window.open(`https://wa.me/${deal.contact_whatsapp}`, "_blank")}>
                        <MessageCircle size={10} />
                      </Button>
                    )}
                    <Button size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={() => navigate("/store")}>
                      <ShoppingCart size={10} /> {isAr ? "احجز" : "Book"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PartnerDealsSection;
