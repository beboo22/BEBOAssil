import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plane, Hotel, Star, ExternalLink, MapPin, Clock, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useCurrency } from "@/hooks/useCurrency";

interface SelectedHotel {
  city: string;
  name: string;
  type?: string;
  stars?: number;
  rating?: number;
  reviews?: number;
  pricePerNight?: number;
  totalPrice?: number;
  currency?: string;
  image?: string | null;
  amenities?: string[];
  checkInDate?: string;
  checkOutDate?: string;
  bookingUrl?: string;
}

interface SelectedFlight {
  from: string;
  to: string;
  fromCode?: string;
  toCode?: string;
  date?: string;
  airline?: string;
  airlineLogo?: string;
  flightNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: string | number;
  stops?: number;
  price?: number;
  currency?: string;
  travelClass?: string;
  bookingUrl?: string;
}

interface Props {
  selectedHotels?: SelectedHotel[];
  selectedFlights?: SelectedFlight[];
}

const nightsBetween = (ci?: string, co?: string): number => {
  if (!ci || !co) return 1;
  const a = new Date(ci).getTime();
  const b = new Date(co).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  const n = Math.round((b - a) / 86400000);
  return Math.max(1, n);
};

const SelectedTripBookings = ({ selectedHotels, selectedFlights }: Props) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { formatPrice, convertPrice } = useCurrency();

  const hasHotels = Array.isArray(selectedHotels) && selectedHotels.length > 0;
  const hasFlights = Array.isArray(selectedFlights) && selectedFlights.length > 0;
  if (!hasHotels && !hasFlights) return null;

  const hotelsTotal = (selectedHotels || []).reduce((sum, h) => {
    const nights = nightsBetween(h.checkInDate, h.checkOutDate);
    const total = h.totalPrice && h.totalPrice > 0 ? h.totalPrice : (h.pricePerNight || 0) * nights;
    return sum + convertPrice(total, h.currency || "USD");
  }, 0);

  const flightsTotal = (selectedFlights || []).reduce(
    (sum, f) => sum + convertPrice(f.price || 0, f.currency || "USD"),
    0,
  );

  const grandTotal = hotelsTotal + flightsTotal;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Card className="p-4 mt-4 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-primary" />
          <h3 className="font-bold text-sm text-foreground">
            {isAr ? "اختياراتك المقترحة (طيران وفنادق)" : "Your Suggested Bookings (Flights & Hotels)"}
          </h3>
          <Badge variant="outline" className="text-[9px] ml-auto">
            {isAr ? "محدّث تلقائياً" : "Auto-picked"}
          </Badge>
        </div>

        {/* Flights */}
        {hasFlights && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Plane size={12} />
              {isAr ? "الرحلات" : "Flights"} ({selectedFlights!.length})
            </div>
            {selectedFlights!.map((f, idx) => (
              <div
                key={`flight-${idx}`}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-sky-900 flex items-center justify-center shrink-0 overflow-hidden border border-border">
                    {f.airlineLogo ? (
                      <img
                        src={f.airlineLogo}
                        alt={f.airline}
                        className="w-7 h-7 object-contain"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <Plane size={14} className="text-sky-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {f.airline || (isAr ? "رحلة" : "Flight")}{" "}
                      {f.flightNumber ? `· ${f.flightNumber}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {(f.fromCode || f.from)} → {(f.toCode || f.to)}
                      {f.date ? ` · ${f.date}` : ""}
                      {typeof f.stops === "number"
                        ? f.stops === 0
                          ? isAr ? " · مباشر" : " · Direct"
                          : ` · ${f.stops} ${isAr ? "توقف" : "stops"}`
                        : ""}
                    </p>
                    {(f.departureTime || f.duration) && (
                      <p className="text-[9px] text-muted-foreground">
                        {f.departureTime || ""}
                        {f.duration ? ` · ${f.duration}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {f.price ? (
                    <span className="font-bold text-sm">
                      {formatPrice(f.price, f.currency || "USD")}
                    </span>
                  ) : null}
                  {f.bookingUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={() => window.open(f.bookingUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink size={10} />
                      {isAr ? "احجز" : "Book"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hotels */}
        {hasHotels && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Hotel size={12} />
              {isAr ? "الفنادق" : "Hotels"} ({selectedHotels!.length})
            </div>
            {selectedHotels!.map((h, idx) => {
              const nights = nightsBetween(h.checkInDate, h.checkOutDate);
              const total = h.totalPrice && h.totalPrice > 0 ? h.totalPrice : (h.pricePerNight || 0) * nights;
              return (
                <div
                  key={`hotel-${idx}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border">
                      {h.image ? (
                        <img
                          src={h.image}
                          alt={h.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                        />
                      ) : (
                        <div className="w-full h-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Hotel size={16} className="text-violet-600" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{h.name}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <MapPin size={9} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground truncate">{h.city}</span>
                        {h.stars ? (
                          <span className="flex items-center">
                            {Array.from({ length: Math.min(h.stars, 5) }).map((_, i) => (
                              <Star key={i} size={8} className="fill-amber-400 text-amber-400" />
                            ))}
                          </span>
                        ) : null}
                        {h.rating ? (
                          <span className="text-[9px] text-muted-foreground">· {h.rating.toFixed(1)}</span>
                        ) : null}
                      </div>
                      <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <Clock size={8} />
                        {nights} {isAr ? "ليلة" : nights === 1 ? "night" : "nights"}
                        {h.pricePerNight ? ` · ${formatPrice(h.pricePerNight, h.currency || "USD")}/${isAr ? "ليلة" : "night"}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {total > 0 && (
                      <span className="font-bold text-sm">
                        {formatPrice(total, h.currency || "USD")}
                      </span>
                    )}
                    {h.bookingUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] gap-1 px-2"
                        onClick={() => window.open(h.bookingUrl, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink size={10} />
                        {isAr ? "احجز" : "Book"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Grand total in user currency */}
        {grandTotal > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "إجمالي تقديري (طيران + فنادق)" : "Estimated Total (Flights + Hotels)"}
            </span>
            <span className="text-lg font-black text-primary">{formatPrice(grandTotal)}</span>
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          {isAr
            ? "* الأسعار تقريبية ومن مزودين خارجيين، قد تتغير عند الحجز. يتم التحويل تلقائياً لعملتك المختارة."
            : "* Prices are estimates from external providers and may change at booking. Auto-converted to your selected currency."}
        </p>
      </Card>
    </motion.div>
  );
};

export default SelectedTripBookings;
