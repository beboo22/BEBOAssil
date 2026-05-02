import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plane, Hotel, Car, ExternalLink, CheckCircle2, Clock, DollarSign, AlertCircle, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useCurrency } from "@/hooks/useCurrency";

interface BookingCostSummaryProps {
  bookingSelections?: {
    flight?: { status: string; details?: string; data?: any };
    hotel?: { status: string; details?: string; data?: any };
    car?: { status: string; details?: string; data?: any };
  };
  duration?: number;
}

const BookingCostSummary = ({ bookingSelections, duration = 1 }: BookingCostSummaryProps) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { formatPrice, convertPrice } = useCurrency();

  if (!bookingSelections) return null;

  const { flight, hotel, car } = bookingSelections;
  const hasAny = flight?.data || hotel?.data || car?.data;
  if (!hasAny) return null;

  const flightData = flight?.data;
  const hotelData = hotel?.data;
  const carData = car?.data;

  const flightCurrency = flightData?.currency || 'USD';
  const hotelCurrency = hotelData?.currency || 'USD';
  const carCurrency = carData?.currency || 'USD';

  const flightCost = flightData?.price || 0;
  const hotelCost = (hotelData?.price || 0) * (duration || 1);
  const carCost = (carData?.price || 0) * (duration || 1);
  
  // Convert all to user's preferred currency for total
  const totalConverted = convertPrice(flightCost, flightCurrency) + convertPrice(hotelCost, hotelCurrency) + convertPrice(carCost, carCurrency);

  const airlineLogo = flightData?.airline ? `https://pics.avs.io/60/60/${flightData.airline}.png` : "";

  const StatusBadge = ({ status }: { status?: string }) => {
    if (status === "booked") return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 text-[10px] gap-0.5">
        <CheckCircle2 size={10} /> {isAr ? "مؤكد" : "Confirmed"}
      </Badge>
    );
    if (status === "selected") return (
      <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 text-[10px] gap-0.5">
        <Clock size={10} /> {isAr ? "غير مؤكد" : "Pending"}
      </Badge>
    );
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="max-w-full min-w-0 overflow-hidden">
      <Card className="p-3 sm:p-4 border-primary/20 bg-gradient-to-r from-primary/5 via-background to-accent/5 max-w-full overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={18} className="text-primary" />
          <h3 className="font-bold text-sm text-foreground">
            {isAr ? "ملخص تكاليف الحجوزات" : "Booking Cost Summary"}
          </h3>
        </div>

        <div className="space-y-2.5">
          {/* Flight */}
          {flightData && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-sky-50/50 dark:bg-sky-950/20">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-sky-900 flex items-center justify-center shrink-0 overflow-hidden border border-border shadow-sm">
                  {airlineLogo ? (
                    <img src={airlineLogo} alt={flightData.airline} className="w-8 h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Plane size={16} className="text-sky-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {flightData.airline} {flightData.flight_number}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {flightData.origin} → {flightData.destination}
                    {flightData.transfers === 0 ? (isAr ? " • مباشر" : " • Direct") : ` • ${flightData.transfers} ${isAr ? "توقف" : "stops"}`}
                  </p>
                  {flightData.departure_at && (
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(flightData.departure_at).toLocaleDateString()} • {new Date(flightData.departure_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={flight?.status} />
                <span className="font-bold text-sm text-foreground">{formatPrice(flightCost, flightCurrency)}</span>
              </div>
            </div>
          )}

          {/* Hotel */}
          {hotelData && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-violet-50/50 dark:bg-violet-950/20">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border shadow-sm">
                  {hotelData.image ? (
                    <img src={hotelData.image} alt={hotelData.hotelName} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  ) : (
                    <div className="w-full h-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                      <Hotel size={16} className="text-violet-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{hotelData.hotelName}</p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(hotelData.stars || 0, 5) }).map((_, i) => (
                      <Star key={i} size={8} className="fill-amber-400 text-amber-400" />
                    ))}
                    {hotelData.rating > 0 && <span className="text-[9px] text-muted-foreground ml-0.5">{hotelData.rating}/10</span>}
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    {duration} {isAr ? "ليالي" : "nights"} × {formatPrice(hotelData.price, hotelCurrency)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={hotel?.status} />
                <div className="text-right">
                  <span className="font-bold text-sm text-foreground">{formatPrice(hotelCost, hotelCurrency)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Car */}
          {carData && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-teal-50/50 dark:bg-teal-950/20">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border shadow-sm">
                  {carData.image ? (
                    <img src={carData.image} alt={carData.name} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  ) : (
                    <div className="w-full h-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center">
                      <Car size={16} className="text-teal-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{carData.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {carData.vendor} • {carData.className || carData.type}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {duration} {isAr ? "أيام" : "days"} × {formatPrice(carData.price, carCurrency)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={car?.status} />
                <div className="text-right">
                  <span className="font-bold text-sm text-foreground">{formatPrice(carCost, carCurrency)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* Total */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-foreground text-sm sm:text-base">{isAr ? "الإجمالي التقديري" : "Estimated Total"}</span>
          <span className="text-lg sm:text-xl font-black text-primary break-all">{formatPrice(totalConverted)}</span>
        </div>

        {/* Pending booking warning */}
        {(flight?.status === "selected" || hotel?.status === "selected" || car?.status === "selected") && (
          <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-700 dark:text-amber-400">
              {isAr
                ? "بعض الحجوزات لم تُؤكد بعد. اضغط أدناه لإكمال الحجز."
                : "Some bookings are pending. Click below to complete booking."}
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {flight?.status === "selected" && flightData?.link && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => window.open(flightData.link, "_blank")}>
                    <Plane size={10} /> {isAr ? "حجز الطيران" : "Book Flight"}
                  </Button>
                )}
                {hotel?.status === "selected" && hotelData?.link && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => window.open(hotelData.link, "_blank")}>
                    <Hotel size={10} /> {isAr ? "حجز الفندق" : "Book Hotel"}
                  </Button>
                )}
                {car?.status === "selected" && carData?.link && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => window.open(carData.link, "_blank")}>
                    <Car size={10} /> {isAr ? "حجز السيارة" : "Book Car"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
};

export default BookingCostSummary;