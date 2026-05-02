import { useState, useEffect, useRef, useCallback } from "react";
import TravelpayoutsWidget from "@/components/TravelpayoutsWidget";
import TravelpayoutsWL from "@/components/booking/TravelpayoutsWL";
import { getTripHotelUrl } from "@/utils/bookingUtils";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Hotel, Globe, Loader2, Calendar as CalendarIcon, Users, Star, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import CitySearch from "@/components/CitySearch";
import { useCurrency } from "@/hooks/useCurrency";

const TP_CURRENCIES = ["USD","EUR","GBP","CAD","AUD","RUB","CNY","JPY","KRW","INR","BRL","THB","MYR","SGD","HKD","IDR","PHP","NZD","CHF","SEK","NOK","DKK","PLN","CZK","HUF","MXN","ZAR","AED","SAR","TRY","EGP","KWD","BHD","QAR","OMR"];

const IATA_DISPLAY_MAP: Record<string, { ar: string; en: string }> = {
  RUH: { ar: "الرياض، السعودية", en: "Riyadh, Saudi Arabia" },
  DXB: { ar: "دبي، الإمارات", en: "Dubai, UAE" },
  JED: { ar: "جدة، السعودية", en: "Jeddah, Saudi Arabia" },
  CAI: { ar: "القاهرة، مصر", en: "Cairo, Egypt" },
  IST: { ar: "إسطنبول، تركيا", en: "Istanbul, Turkey" },
};

const CITY_TO_IATA_MAP: Record<string, string> = {
  "الرياض": "RUH",
  "riyadh": "RUH",
  "دبي": "DXB",
  "dubai": "DXB",
  "جدة": "JED",
  "jeddah": "JED",
  "القاهرة": "CAI",
  "cairo": "CAI",
  "إسطنبول": "IST",
  "اسطنبول": "IST",
  "istanbul": "IST",
};

const HotelPage = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();

  const normalizeLocationDisplay = (value: string | null) => {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (/^[A-Za-z]{3}$/.test(trimmed)) {
      const iata = trimmed.toUpperCase();
      const mapped = IATA_DISPLAY_MAP[iata];
      if (mapped) return isAr ? mapped.ar : mapped.en;
      return iata;
    }

    return trimmed;
  };

  const resolveIata = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();

    const cityPart = trimmed.split(/[،,]/)[0].trim();
    const base = cityPart.toLowerCase();
    return CITY_TO_IATA_MAP[base] || cityPart.slice(0, 3).toUpperCase();
  };

  const [destination, setDestination] = useState(normalizeLocationDisplay(searchParams.get("destination")));
  const [checkIn, setCheckIn] = useState<Date | undefined>(searchParams.get("check_in") ? new Date(searchParams.get("check_in")!) : undefined);
  const [checkOut, setCheckOut] = useState<Date | undefined>(searchParams.get("check_out") ? new Date(searchParams.get("check_out")!) : undefined);
  const [guests, setGuests] = useState(searchParams.get("guests") || searchParams.get("passengers") || "2");
  const [isWLLoaded, setIsWLLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDestination(normalizeLocationDisplay(searchParams.get("destination")));
    setCheckIn(searchParams.get("check_in") ? new Date(searchParams.get("check_in")!) : (searchParams.get("depart_date") ? new Date(searchParams.get("depart_date")!) : undefined));
    setCheckOut(searchParams.get("check_out") ? new Date(searchParams.get("check_out")!) : (searchParams.get("return_date") ? new Date(searchParams.get("return_date")!) : undefined));
    setGuests(searchParams.get("guests") || searchParams.get("passengers") || "2");
  }, [searchParams]);

  const loadWidget = useCallback(() => {
    // Switching to Trip.com for hotels
    setIsWLLoaded(true);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadWidget, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const s = document.querySelector('script[data-tpwl-hotel="true"]');
      if (s) s.remove();
    };
  }, [loadWidget]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 py-10">
        <div className="max-w-5xl mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
              <Hotel size={16} />
              {isAr ? "بحث الفنادق" : "Hotel Search"}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {isAr ? "ابحث عن أفضل الفنادق" : "Find the Best Hotels"}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {isAr ? "قارن أسعار أكثر من 2 مليون فندق حول العالم" : "Compare prices from 2M+ hotels worldwide"}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-20">
        <Card className="p-4 mb-6 border-border shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "الوجهة" : "Destination"}</Label>
              <CitySearch onSelect={setDestination} placeholder={isAr ? "المدينة أو الفندق" : "City or hotel"} initialValue={destination} />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "تسجيل الوصول" : "Check-in"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !checkIn && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {checkIn ? format(checkIn, "MMM dd") : (isAr ? "تاريخ" : "Date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={checkIn} onSelect={setCheckIn} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "تسجيل المغادرة" : "Check-out"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !checkOut && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {checkOut ? format(checkOut, "MMM dd") : (isAr ? "تاريخ" : "Date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={checkOut} onSelect={setCheckOut} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "النزلاء" : "Guests"}</Label>
              <Select value={guests} onValueChange={setGuests}>
                <SelectTrigger className="h-9 text-xs">
                  <Users size={12} className="mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {isAr ? "نزيل" : n === 1 ? "guest" : "guests"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1"><Star size={10} />{isAr ? "أفضل الأسعار" : "Best Prices"}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><MapPin size={10} />{isAr ? "إلغاء مجاني" : "Free Cancellation"}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Globe size={10} />{isAr ? "+2M فندق" : "2M+ Hotels"}</Badge>
          </div>
        </Card>

        <Card className="p-4 md:p-6 border-border shadow-sm overflow-hidden">
          {/* Travelpayouts Hotel Search Widget */}
          <TravelpayoutsWidget
            scriptUrl={`https://tpscr.com/content?currency=${(currency || "USD").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111`}
            containerId="tp-hotel-main-search"
            minHeight={500}
            loadTimeout={15000}
          />

          {/* Trip.com external booking link */}
          {destination && (
            <div className="mt-4 text-center">
              <a
                href={getTripHotelUrl(destination, checkIn ? format(checkIn, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"), checkOut ? format(checkOut, "yyyy-MM-dd") : format(addDays(new Date(), 3), "yyyy-MM-dd"), guests)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <Globe size={14} />
                  {isAr ? "ابحث أيضاً على Trip.com ↗" : "Also search on Trip.com ↗"}
                </Button>
              </a>
            </div>
          )}
        </Card>

        {/* Travelpayouts Hotel Widgets */}
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            🏨 {isAr ? "عروض فنادق من Travelpayouts" : "Hotel Deals from Travelpayouts"}
          </h2>
          <TravelpayoutsWidget
            scriptUrl={`https://tpscr.com/content?currency=USD&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&powered_by=true&show_logo=true&limit=10&bg_color=%23FFFFFF&font_color=%234a4a4a&stars_color=%23dcdcdc&stars_active_color=%23f8bb15&dots_color=%238c8c8c&loader_color=%23ffb300&arrows_color=%238c8c8c&autoscroll=false&autoscroll_delay=5000&promo_id=2948&campaign_id=1`}
            containerId="tp-hotel-reviews"
            minHeight={300}
            loadTimeout={15000}
          />
        </div>

        {/* Trip.com Hotel Widgets */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            🏨 {isAr ? "عروض فنادق إضافية" : "More Hotel Deals"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
              <iframe
                src="https://www.trip.com/partners/ad/S14625543?Allianceid=7384441&SID=279474539&trip_sub1="
                style={{ width: "100%", height: 320, border: "none" }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Trip.com Hotels"
                loading="lazy"
              />
            </div>
            <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
              <iframe
                src="https://www.trip.com/partners/ad/DB14625242?Allianceid=7384441&SID=279474539&trip_sub1="
                style={{ width: "100%", height: 250, border: "none" }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Trip.com Hotel Deals"
                loading="lazy"
              />
            </div>
          </div>
          <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
            <iframe
              src="https://www.trip.com/partners/ad/DB14625277?Allianceid=7384441&SID=279474539&trip_sub1="
              style={{ width: "100%", height: 250, border: "none" }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
              title="Trip.com Hotel Offers"
              loading="lazy"
            />
          </div>
          {/* Direct booking links */}
          <div className="flex flex-wrap gap-2">
            <a href="https://www.trip.com/hotels/w/home?Allianceid=7384441&SID=279474539&trip_sub1=&trip_sub3=D14625669" target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1">
                <Hotel size={12} /> {isAr ? "جميع الفنادق" : "All Hotels"}
              </Badge>
            </a>
            <a href="https://www.trip.com/things-to-do/?Allianceid=7384441&SID=279474539&trip_sub1=&trip_sub3=D14625669" target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1">
                <MapPin size={12} /> {isAr ? "أنشطة وتجارب" : "Activities"}
              </Badge>
            </a>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { title: isAr ? "أفضل سعر مضمون" : "Best Price Guarantee", desc: isAr ? "نضمن لك أقل سعر" : "We guarantee the lowest price" },
            { title: isAr ? "إلغاء مجاني" : "Free Cancellation", desc: isAr ? "إلغاء مجاني لمعظم الفنادق" : "Free cancellation on most hotels" },
            { title: isAr ? "تقييمات حقيقية" : "Real Reviews", desc: isAr ? "آراء من ملايين المسافرين" : "Reviews from millions of travelers" },
          ].map((item, i) => (
            <Card key={i} className="p-3 text-center border-border">
              <h3 className="text-xs font-semibold text-foreground">{item.title}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HotelPage;
