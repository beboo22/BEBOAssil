import { useState, useEffect, useRef, useCallback } from "react";
import TravelpayoutsWidget from "@/components/TravelpayoutsWidget";
import TravelpayoutsWL from "@/components/booking/TravelpayoutsWL";
import { getTripFlightUrl } from "@/utils/bookingUtils";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plane, Globe, Loader2, Calendar as CalendarIcon, Users, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
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

const FlightPage = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();

  const normalizeTripType = (raw: string | null): "round" | "oneway" => {
    if (!raw) return "round";
    const value = raw.toLowerCase();
    return value === "oneway" || value === "one_way" || value === "one-way" || value === "one way" ? "oneway" : "round";
  };

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

  const parseDateParam = (raw: string | null): Date | undefined => {
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const pickFirstParam = (params: URLSearchParams, keys: string[]): string | null => {
    for (const key of keys) {
      const value = params.get(key);
      if (value !== null) return value.trim();
    }
    return null;
  };

  const hasFlightPrefill = (params: URLSearchParams) => {
    const keys = ["origin", "from", "departure", "destination", "to", "depart_date", "return_date", "passengers", "adults", "class", "trip_type"];
    return keys.some((key) => params.has(key));
  };

  const initialOrigin = normalizeLocationDisplay(pickFirstParam(searchParams, ["origin", "from", "departure"]));
  const initialDestination = normalizeLocationDisplay(pickFirstParam(searchParams, ["destination", "to"]));
  const initialDepartDate = parseDateParam(pickFirstParam(searchParams, ["depart_date"]));
  const initialReturnDate = parseDateParam(pickFirstParam(searchParams, ["return_date"]));
  const initialPassengers = pickFirstParam(searchParams, ["passengers", "adults"]) || "1";
  const initialTripClass = pickFirstParam(searchParams, ["class"]) || "economy";
  const initialTripType = normalizeTripType(pickFirstParam(searchParams, ["trip_type"]));

  // Auto-fill from URL params
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [departDate, setDepartDate] = useState<Date | undefined>(initialDepartDate);
  const [returnDate, setReturnDate] = useState<Date | undefined>(initialReturnDate);
  const [passengers, setPassengers] = useState(initialPassengers);
  const [tripClass, setTripClass] = useState(initialTripClass);
  const [tripType, setTripType] = useState<"round" | "oneway">(initialTripType);
  const [isWLLoaded, setIsWLLoaded] = useState(false);
  const [segments, setSegments] = useState<{ origin: string, destination: string, date: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const segmentsParam = searchParams.get("segments");
    if (segmentsParam) {
      // Format: ORIG-DEST|YYYY-MM-DD,ORIG2-DEST2|YYYY-MM-DD
      const parts = segmentsParam.split(",");
      const parsed = parts.map(p => {
        const [route, date] = p.split("|");
        const [orig, dest] = route.split("-");
        return { origin: orig, destination: dest, date };
      });
      setSegments(parsed);
    } else {
      setSegments([]);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!hasFlightPrefill(searchParams)) return;

    const nextOrigin = pickFirstParam(searchParams, ["origin", "from", "departure"]);
    const nextDestination = pickFirstParam(searchParams, ["destination", "to"]);
    const nextDepartDate = pickFirstParam(searchParams, ["depart_date"]);
    const nextReturnDate = pickFirstParam(searchParams, ["return_date"]);
    const nextPassengers = pickFirstParam(searchParams, ["passengers", "adults"]);
    const nextClass = pickFirstParam(searchParams, ["class"]);
    const nextTripType = pickFirstParam(searchParams, ["trip_type"]);

    if (nextOrigin !== null) setOrigin(normalizeLocationDisplay(nextOrigin));
    if (nextDestination !== null) setDestination(normalizeLocationDisplay(nextDestination));
    if (nextDepartDate !== null) setDepartDate(parseDateParam(nextDepartDate));
    if (nextReturnDate !== null) setReturnDate(parseDateParam(nextReturnDate));
    if (nextPassengers !== null) setPassengers(nextPassengers || "1");
    if (nextClass !== null) setTripClass(nextClass || "economy");
    if (nextTripType !== null) setTripType(normalizeTripType(nextTripType));
  }, [searchParams]);

  const loadWidget = useCallback(() => {
    // We will now use Trip.com instead of Travelpayouts White Label
    setIsWLLoaded(true);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadWidget, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const s = document.querySelector('script[data-tpwl-flight="true"]');
      if (s) s.remove();
    };
  }, [loadWidget]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 py-10">
        <div className="max-w-5xl mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
              <Plane size={16} />
              {isAr ? "بحث رحلات الطيران" : "Flight Search"}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {isAr ? "ابحث عن أفضل رحلات الطيران" : "Find the Best Flights"}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {isAr ? "قارن أسعار أكثر من 700 شركة طيران واحجز بأفضل سعر" : "Compare prices from 700+ airlines and book at the best price"}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-20">
        {/* Search Filters */}
        <Card className="p-4 mb-6 border-border shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "من" : "From"}</Label>
              <CitySearch onSelect={setOrigin} placeholder={isAr ? "مدينة المغادرة" : "Departure city"} initialValue={origin} />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "إلى" : "To"}</Label>
              <CitySearch onSelect={setDestination} placeholder={isAr ? "الوجهة" : "Destination"} initialValue={destination} />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "المغادرة" : "Depart"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !departDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {departDate ? format(departDate, "MMM dd") : (isAr ? "تاريخ" : "Date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={departDate} onSelect={setDepartDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "العودة / نهاية الرحلة" : "Return / End Date"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !returnDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {returnDate ? format(returnDate, "MMM dd") : (isAr ? "تاريخ" : "Date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={returnDate} onSelect={setReturnDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center bg-muted border border-border rounded-lg p-0.5">
              <button onClick={() => setTripType("round")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all", tripType === "round" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {isAr ? "ذهاب وعودة" : "Round Trip"}
              </button>
              <button onClick={() => setTripType("oneway")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all", tripType === "oneway" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {isAr ? "ذهاب فقط" : "One Way"}
              </button>
            </div>

            <Select value={passengers} onValueChange={setPassengers}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <Users size={12} className="mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {isAr ? "مسافر" : n === 1 ? "traveler" : "travelers"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tripClass} onValueChange={setTripClass}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SlidersHorizontal size={12} className="mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="economy">{isAr ? "اقتصادي" : "Economy"}</SelectItem>
                <SelectItem value="business">{isAr ? "أعمال" : "Business"}</SelectItem>
                <SelectItem value="first">{isAr ? "أولى" : "First Class"}</SelectItem>
              </SelectContent>
            </Select>

            <Badge variant="outline" className="text-[10px] gap-1">
              <Globe size={10} />
              {isAr ? "+700 شركة طيران" : "700+ Airlines"}
            </Badge>
          </div>
        </Card>

        {/* WL Widget */}
        <Card className="p-4 md:p-6 border-border shadow-sm overflow-hidden">
          {/* Travelpayouts WL Metasearch - actually works in-page */}
          <TravelpayoutsWL
            origin={origin ? resolveIata(origin) : undefined}
            destination={destination ? resolveIata(destination) : undefined}
            departDate={departDate ? format(departDate, "yyyy-MM-dd") : undefined}
            returnDate={returnDate ? format(returnDate, "yyyy-MM-dd") : undefined}
            adults={parseInt(passengers) || 1}
            tripType={segments.length >= 2 ? "multicity" : tripType}
            segments={segments.length >= 2 ? segments.map(s => ({ origin: s.origin, destination: s.destination, date: s.date })) : undefined}
          />

          {/* Multi-segment external links */}
          {segments.length > 0 && (
            <div className="mt-4 space-y-2">
              {segments.map((seg, idx) => (
                <a
                  key={idx}
                  href={getTripFlightUrl(seg.origin, seg.destination, seg.date, "oneway")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <Plane className="text-primary" size={16} />
                  <span className="font-medium text-foreground text-sm">
                    {isAr ? `المسار ${idx + 1}:` : `Segment ${idx + 1}:`} {seg.origin} → {seg.destination}
                  </span>
                  <Badge variant="outline" className="ml-auto text-xs">{seg.date}</Badge>
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    {isAr ? "احجز الآن ↗" : "Book Now ↗"}
                  </Badge>
                </a>
              ))}
            </div>
          )}

          {/* Trip.com external booking link */}
          {(origin || destination) && (
            <div className="mt-4 text-center">
              <a
                href={getTripFlightUrl(origin, destination, departDate ? format(departDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"), tripType, returnDate ? format(returnDate, "yyyy-MM-dd") : undefined)}
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

        {/* Travelpayouts Flight Deals Widgets */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            ✈️ {isAr ? "عروض رحلات إضافية" : "More Flight Deals"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TravelpayoutsWidget
              scriptUrl={`https://tpscr.com/content?currency=${(currency || "USD").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=3411`}
              containerId="tp-flight-deals"
              minHeight={350}
              loadTimeout={15000}
            />
            <TravelpayoutsWidget
              scriptUrl={`https://tpscr.com/content?currency=${(currency || "USD").toLowerCase()}&trs=477988&shmarker=688262&powered_by=true&locale=${isAr ? "ar" : "en"}&show_header=true&limit=3&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=4478`}
              containerId="tp-flight-calendar"
              minHeight={350}
              loadTimeout={15000}
            />
          </div>
          {/* Flight search with hotels */}
          <TravelpayoutsWidget
            scriptUrl={`https://tpscr.com/content?currency=${(currency || "USD").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111`}
            containerId="tp-flight-hotels"
            minHeight={400}
            loadTimeout={15000}
          />
        </div>

        {/* Feature Cards */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { title: isAr ? "مقارنة أسعار" : "Price Compare", desc: isAr ? "نقارن من مئات المزودين" : "From hundreds of providers" },
            { title: isAr ? "رحلات مباشرة" : "Direct Flights", desc: isAr ? "فلتر للرحلات بدون توقف" : "Filter non-stop flights" },
            { title: isAr ? "حجز آمن" : "Secure Booking", desc: isAr ? "حجز مباشر بأفضل سعر" : "Book directly at best price" },
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

export default FlightPage;
