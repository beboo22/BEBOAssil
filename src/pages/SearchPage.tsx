import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plane, Hotel, Car, Bus, Search, Filter, Loader2, Globe, MapPin, Calendar as CalendarIcon, Users, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import CitySearch from "@/components/CitySearch";
import { useCurrency } from "@/hooks/useCurrency";

const TP_SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "RUB", "CNY", "JPY", "KRW", "INR", "BRL", "THB", "MYR", "SGD", "HKD", "IDR", "PHP", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "MXN", "ZAR", "AED", "SAR", "TRY", "EGP", "KWD", "BHD", "QAR", "OMR"];
const SEARCH_PREFILL_STORAGE_KEY = "search-prefill-state";

const IATA_DISPLAY_MAP: Record<string, { ar: string; en: string }> = {
  RUH: { ar: "الرياض، السعودية", en: "Riyadh, Saudi Arabia" },
  DXB: { ar: "دبي، الإمارات", en: "Dubai, UAE" },
  JED: { ar: "جدة، السعودية", en: "Jeddah, Saudi Arabia" },
  CAI: { ar: "القاهرة، مصر", en: "Cairo, Egypt" },
  IST: { ar: "إسطنبول، تركيا", en: "Istanbul, Turkey" },
  DOH: { ar: "الدوحة، قطر", en: "Doha, Qatar" },
  AUH: { ar: "أبوظبي، الإمارات", en: "Abu Dhabi, UAE" },
  LHR: { ar: "لندن، المملكة المتحدة", en: "London, UK" },
  CDG: { ar: "باريس، فرنسا", en: "Paris, France" },
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
  "الدوحة": "DOH",
  "doha": "DOH",
  "أبوظبي": "AUH",
  "ابوظبي": "AUH",
  "abu dhabi": "AUH",
  "لندن": "LHR",
  "london": "LHR",
  "باريس": "CDG",
  "paris": "CDG",
};

const SearchPage = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();
  const searchQuery = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(searchQuery), [searchQuery]);

  const normalizeTripType = (raw: string | null): "round" | "oneway" => {
    if (!raw) return "round";
    const value = raw.toLowerCase();
    return value === "oneway" || value === "one_way" || value === "one-way" || value === "one way" ? "oneway" : "round";
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

  const hasSearchPrefill = (params: URLSearchParams) => {
    const keys = ["tab", "origin", "from", "departure", "destination", "to", "depart_date", "check_in", "pickup_date", "return_date", "check_out", "dropoff_date", "passengers", "guests", "adults", "class", "trip_type"];
    return keys.some((key) => params.has(key));
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

  const parseFlightSearchCode = (raw: string | null) => {
    if (!raw) return null;
    const value = raw.trim().toUpperCase();
    const match = value.match(/^([A-Z]{3})(\d{2})(\d{2})([A-Z]{3})(?:(\d{2})(\d{2}))?(\d{1,2})?$/);
    if (!match) return null;

    const now = new Date();
    const buildDate = (dayStr?: string, monthStr?: string) => {
      if (!dayStr || !monthStr) return undefined;
      const day = Number(dayStr);
      const month = Number(monthStr);
      if (!day || !month) return undefined;
      let year = now.getFullYear();
      if (month < now.getMonth() + 1) year += 1;
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    };

    const depart = buildDate(match[2], match[3]);
    const ret = buildDate(match[5], match[6]);

    return {
      origin: match[1],
      destination: match[4],
      departDate: depart,
      returnDate: ret,
      tripType: ret ? "round" : "oneway" as "round" | "oneway",
      passengers: match[7] || "1",
    };
  };

  const initialOrigin = normalizeLocationDisplay(pickFirstParam(params, ["origin", "from", "departure"]));
  const initialDestination = normalizeLocationDisplay(pickFirstParam(params, ["destination", "to"]));
  const initialDepartDate = parseDateParam(pickFirstParam(params, ["depart_date", "check_in", "pickup_date"]));
  const initialReturnDate = parseDateParam(pickFirstParam(params, ["return_date", "check_out", "dropoff_date"]));
  const initialPassengers = pickFirstParam(params, ["passengers", "guests", "adults"]) || "1";
  const initialTripClass = pickFirstParam(params, ["class"]) || "economy";
  const initialTripType = normalizeTripType(pickFirstParam(params, ["trip_type"]));

  const [activeTab, setActiveTab] = useState(params.get("tab") || "flights");
  const [isWLLoaded, setIsWLLoaded] = useState(false);
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [departDate, setDepartDate] = useState<Date | undefined>(initialDepartDate);
  const [returnDate, setReturnDate] = useState<Date | undefined>(initialReturnDate);
  const [passengers, setPassengers] = useState(initialPassengers);
  const [tripClass, setTripClass] = useState(initialTripClass);
  const [tripType, setTripType] = useState<"round" | "oneway">(initialTripType);

  useEffect(() => {
    const hasPrefill = hasSearchPrefill(params);

    if (!hasPrefill) {
      const parsedCode = parseFlightSearchCode(params.get("flightSearch"));
      if (parsedCode) {
        setOrigin(normalizeLocationDisplay(parsedCode.origin));
        setDestination(normalizeLocationDisplay(parsedCode.destination));
        setDepartDate(parsedCode.departDate);
        setReturnDate(parsedCode.returnDate);
        setPassengers(parsedCode.passengers);
        setTripType(parsedCode.tripType);
        return;
      }

      try {
        const rawStored = sessionStorage.getItem(SEARCH_PREFILL_STORAGE_KEY);
        if (!rawStored) return;
        const stored = JSON.parse(rawStored) as {
          activeTab?: string;
          origin?: string;
          destination?: string;
          departDate?: string;
          returnDate?: string;
          passengers?: string;
          tripClass?: string;
          tripType?: "round" | "oneway";
        };

        if (stored.activeTab) setActiveTab(stored.activeTab);
        if (stored.origin) setOrigin(normalizeLocationDisplay(stored.origin));
        if (stored.destination) setDestination(normalizeLocationDisplay(stored.destination));
        if (stored.departDate) setDepartDate(parseDateParam(stored.departDate));
        if (stored.returnDate) setReturnDate(parseDateParam(stored.returnDate));
        if (stored.passengers) setPassengers(stored.passengers);
        if (stored.tripClass) setTripClass(stored.tripClass);
        if (stored.tripType) setTripType(stored.tripType);
      } catch {
        // ignore invalid cached payload
      }
      return;
    }

    const tab = params.get("tab");
    if (tab) setActiveTab(tab);

    const nextOrigin = pickFirstParam(params, ["origin", "from", "departure"]);
    const nextDestination = pickFirstParam(params, ["destination", "to"]);
    const nextDepartDateRaw = pickFirstParam(params, ["depart_date", "check_in", "pickup_date"]);
    const nextReturnDateRaw = pickFirstParam(params, ["return_date", "check_out", "dropoff_date"]);
    const nextPassengers = pickFirstParam(params, ["passengers", "guests", "adults"]);
    const nextClass = pickFirstParam(params, ["class"]);
    const nextTripType = pickFirstParam(params, ["trip_type"]);

    if (nextOrigin !== null) setOrigin(normalizeLocationDisplay(nextOrigin));
    if (nextDestination !== null) setDestination(normalizeLocationDisplay(nextDestination));
    if (nextDepartDateRaw !== null) setDepartDate(parseDateParam(nextDepartDateRaw));
    if (nextReturnDateRaw !== null) setReturnDate(parseDateParam(nextReturnDateRaw));
    if (nextPassengers !== null) setPassengers(nextPassengers || "1");
    if (nextClass !== null) setTripClass(nextClass || "economy");
    if (nextTripType !== null) setTripType(normalizeTripType(nextTripType));

    try {
      sessionStorage.setItem(SEARCH_PREFILL_STORAGE_KEY, JSON.stringify({
        activeTab: tab || activeTab,
        origin: nextOrigin ?? origin,
        destination: nextDestination ?? destination,
        departDate: nextDepartDateRaw ?? (departDate ? format(departDate, "yyyy-MM-dd") : undefined),
        returnDate: nextReturnDateRaw ?? (returnDate ? format(returnDate, "yyyy-MM-dd") : undefined),
        passengers: nextPassengers ?? passengers,
        tripClass: nextClass ?? tripClass,
        tripType: nextTripType ? normalizeTripType(nextTripType) : tripType,
      }));
    } catch {
      // ignore storage failure
    }
  }, [searchQuery, isAr]);

  const queryCurrency = useMemo(() => pickFirstParam(params, ["currency", "cur"]), [params]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build WL config for iframe isolation
  const wlSrcDoc = useMemo(() => {
    const tripClassCode = tripClass === "business" ? "C" : tripClass === "first" ? "F" : "Y";
    const normalizedCurrency = (queryCurrency || currency || (isAr ? "SAR" : "USD")).toUpperCase();
    const tpCurrency = (TP_SUPPORTED_CURRENCIES.includes(normalizedCurrency) ? normalizedCurrency : "USD").toLowerCase();
    const tpLocale = isAr ? "ar" : "en";
    const originIata = resolveIata(origin);
    const destinationIata = resolveIata(destination);

    const config: Record<string, any> = {
      wl_id: 3357,
      locale: tpLocale,
      currency: tpCurrency,
      default_tab: activeTab,
      trip_class: tripClassCode,
      adults: Number(passengers) || 1,
      one_way: tripType === "oneway",
    };

    if (originIata) config.origin = originIata;
    if (destinationIata) config.destination = destinationIata;
    if (departDate) config.depart_date = format(departDate, "yyyy-MM-dd");
    if (tripType === "round" && returnDate) config.return_date = format(returnDate, "yyyy-MM-dd");

    return `<!DOCTYPE html>
<html lang="${tpLocale}" dir="${tpLocale === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:transparent;overflow-x:hidden}
    body>div,body>iframe,body>section{width:100%!important}
  </style>
</head>
<body>
  <div id="tpwl-search"></div>
  <div id="tpwl-tickets"></div>
  <script>window.__tpwl_config = ${JSON.stringify(config)};<\/script>
  <script async type="module" src="https://tpscr.com/wl_web/main.js?wl_id=3357"><\/script>
</body>
</html>`;
  }, [activeTab, origin, destination, departDate, returnDate, passengers, tripClass, tripType, isAr, currency, queryCurrency]);

  const [wlKey, setWlKey] = useState(0);
  const wlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced widget reload via key change
  useEffect(() => {
    if (wlTimerRef.current) clearTimeout(wlTimerRef.current);
    setIsWLLoaded(false);
    wlTimerRef.current = setTimeout(() => {
      setWlKey(k => k + 1);
    }, 600);
    return () => { if (wlTimerRef.current) clearTimeout(wlTimerRef.current); };
  }, [wlSrcDoc]);

  const tabs = [
    { id: "flights", label: isAr ? "طيران" : "Flights", icon: Plane },
    { id: "hotels", label: isAr ? "فنادق" : "Hotels", icon: Hotel },
    { id: "cars", label: isAr ? "سيارات" : "Cars", icon: Car },
    { id: "transfers", label: isAr ? "نقل" : "Transfers", icon: Bus },
  ];

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 py-10">
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
              <Globe size={16} />
              {isAr ? "محرك بحث متكامل" : "All-in-One Search Engine"}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {isAr ? "ابحث، قارن، واحجز" : "Search, Compare & Book"}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {isAr ? "ابحث عن أفضل العروض على الطيران والفنادق وإيجار السيارات وخدمات النقل" : "Find the best deals on flights, hotels, car rentals & transfers"}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-6 relative z-20">
        {/* Quick Filter Bar */}
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
              <button
                onClick={() => setTripType("round")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all", tripType === "round" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {isAr ? "ذهاب وعودة" : "Round Trip"}
              </button>
              <button
                onClick={() => setTripType("oneway")}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-all", tripType === "oneway" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
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
              <Filter size={10} />
              {isAr ? "نتائج حية" : "Live Results"}
            </Badge>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 bg-muted/30 p-1 rounded-xl h-auto">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <tab.icon size={20} className="text-primary" />
                    <h2 className="text-lg font-bold text-foreground">
                      {tab.id === "flights" && (isAr ? "بحث رحلات الطيران" : "Flight Search")}
                      {tab.id === "hotels" && (isAr ? "بحث الفنادق" : "Hotel Search")}
                      {tab.id === "cars" && (isAr ? "إيجار السيارات" : "Car Rental")}
                      {tab.id === "transfers" && (isAr ? "خدمات النقل" : "Transfer Services")}
                    </h2>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {isAr ? "مدعوم من Travelpayouts" : "Powered by Travelpayouts"}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap mb-4">
                  {tab.id === "flights" && (
                    <>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "مقارنة أسعار" : "Price Comparison"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "رحلات مباشرة" : "Direct Flights"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "+700 شركة طيران" : "700+ Airlines"}</Badge>
                    </>
                  )}
                  {tab.id === "hotels" && (
                    <>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "أفضل الأسعار" : "Best Prices"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "إلغاء مجاني" : "Free Cancellation"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "+2M فندق" : "2M+ Hotels"}</Badge>
                    </>
                  )}
                  {tab.id === "cars" && (
                    <>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "بدون بطاقة ائتمان" : "No Credit Card"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "تأمين شامل" : "Full Insurance"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "+900 شركة" : "900+ Providers"}</Badge>
                    </>
                  )}
                  {tab.id === "transfers" && (
                    <>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "حجز فوري" : "Instant Booking"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "سائق خاص" : "Private Driver"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isAr ? "نقل المطار" : "Airport Transfer"}</Badge>
                    </>
                  )}
                </div>
              </motion.div>
            </TabsContent>
          ))}
        </Tabs>

        {/* WL Widget - iframe isolated to prevent React DOM conflicts */}
        <Card className="mt-6 border-border shadow-sm overflow-hidden">
          {!isWLLoaded && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="animate-spin text-primary" size={40} />
              <p className="text-muted-foreground font-medium">
                {isAr ? "جاري تحميل محرك البحث..." : "Loading search engine..."}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr ? "يتم تحميل النتائج من أكثر من 700 مزود خدمة" : "Loading results from 700+ providers"}
              </p>
            </div>
          )}
          <iframe
            key={wlKey}
            srcDoc={wlSrcDoc}
            onLoad={() => setTimeout(() => setIsWLLoaded(true), 2500)}
            style={{ width: "100%", minHeight: 600, height: isWLLoaded ? "auto" : 600, border: "none", display: "block" }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation allow-modals"
            title="Travelpayouts Search"
          />
        </Card>

        {/* Bottom Info */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Search, title: isAr ? "بحث شامل" : "Comprehensive", desc: isAr ? "نقارن الأسعار من مئات المزودين" : "We compare prices from hundreds of providers" },
            { icon: Filter, title: isAr ? "فلاتر متقدمة" : "Smart Filters", desc: isAr ? "فلتر حسب السعر والتقييم والمزيد" : "Filter by price, rating & more" },
            { icon: Globe, title: isAr ? "تغطية عالمية" : "Global Coverage", desc: isAr ? "رحلات وفنادق في كل مكان" : "Flights & hotels everywhere" },
            { icon: MapPin, title: isAr ? "حجز مباشر" : "Direct Booking", desc: isAr ? "احجز مباشرة بأفضل سعر" : "Book directly at the best price" },
          ].map((item, i) => (
            <Card key={i} className="p-3 text-center border-border">
              <item.icon className="mx-auto text-primary mb-2" size={20} />
              <h3 className="text-xs font-semibold text-foreground">{item.title}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
