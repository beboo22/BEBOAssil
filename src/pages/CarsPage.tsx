import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getTripCarUrl, getTripTransferUrl } from "@/utils/bookingUtils";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Car, Globe, Loader2, Calendar as CalendarIcon, MapPin, Shield, CreditCard, Bus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import CitySearch from "@/components/CitySearch";
import { useCurrency } from "@/hooks/useCurrency";
import TravelpayoutsWidget from "@/components/TravelpayoutsWidget";

const CITY_TO_IATA_MAP: Record<string, string> = {
  "الرياض": "RUH", "riyadh": "RUH",
  "دبي": "DXB", "dubai": "DXB",
  "جدة": "JED", "jeddah": "JED",
  "القاهرة": "CAI", "cairo": "CAI",
  "إسطنبول": "IST", "اسطنبول": "IST", "istanbul": "IST",
  "لندن": "LHR", "london": "LHR",
  "باريس": "CDG", "paris": "CDG",
  "نيويورك": "JFK", "new york": "JFK",
  "طوكيو": "NRT", "tokyo": "NRT",
  "كوالالمبور": "KUL", "kuala lumpur": "KUL",
  "بانكوك": "BKK", "bangkok": "BKK",
  "سنغافورة": "SIN", "singapore": "SIN",
  "روما": "FCO", "rome": "FCO",
  "برشلونة": "BCN", "barcelona": "BCN",
  "أمستردام": "AMS", "amsterdam": "AMS",
  "المدينة المنورة": "MED", "medina": "MED",
  "الدمام": "DMM", "dammam": "DMM",
  "مسقط": "MCT", "muscat": "MCT",
  "الدوحة": "DOH", "doha": "DOH",
  "البحرين": "BAH", "bahrain": "BAH",
  "الكويت": "KWI", "kuwait": "KWI",
};

const TP_CURRENCIES = ["USD","EUR","GBP","CAD","AUD","RUB","CNY","JPY","KRW","INR","BRL","THB","MYR","SGD","HKD","IDR","PHP","NZD","CHF","SEK","NOK","DKK","PLN","CZK","HUF","MXN","ZAR","AED","SAR","TRY","EGP","KWD","BHD","QAR","OMR"];

const CarsPage = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();

  const [pickupLocation, setPickupLocation] = useState(searchParams.get("destination") || searchParams.get("pickup") || "");
  const [pickupDate, setPickupDate] = useState<Date | undefined>(
    searchParams.get("pickup_date") ? new Date(searchParams.get("pickup_date")!) 
    : searchParams.get("depart_date") ? new Date(searchParams.get("depart_date")!) 
    : undefined
  );
  const [dropoffDate, setDropoffDate] = useState<Date | undefined>(
    searchParams.get("dropoff_date") ? new Date(searchParams.get("dropoff_date")!) 
    : searchParams.get("return_date") ? new Date(searchParams.get("return_date")!) 
    : undefined
  );
  const [activeTab, setActiveTab] = useState(searchParams.get("mode") || "rental");
  const [isWLLoaded, setIsWLLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveIata = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
    const cityPart = trimmed.split(/[،,]/)[0].trim();
    const base = cityPart.toLowerCase();
    return CITY_TO_IATA_MAP[base] || cityPart.slice(0, 3).toUpperCase();
  };

  useEffect(() => {
    setPickupLocation(searchParams.get("destination") || searchParams.get("pickup") || "");
    setPickupDate(searchParams.get("pickup_date") ? new Date(searchParams.get("pickup_date")!) : (searchParams.get("depart_date") ? new Date(searchParams.get("depart_date")!) : undefined));
    setDropoffDate(searchParams.get("dropoff_date") ? new Date(searchParams.get("dropoff_date")!) : (searchParams.get("return_date") ? new Date(searchParams.get("return_date")!) : undefined));
    if (searchParams.get("mode")) setActiveTab(searchParams.get("mode")!);
  }, [searchParams]);

  // Build car rental widget URL
  const buildCarRentalUrl = useCallback(() => {
    const trs = "477988";
    const shmarker = "688262";
    const locale = isAr ? "ar" : "en";
    const cur = (currency || "USD").toUpperCase();
    const tpCur = TP_CURRENCIES.includes(cur) ? cur : "USD";
    
    let url = `https://tpscr.com/content?trs=${trs}&shmarker=${shmarker}&locale=${locale}&powered_by=true&border_radius=5&plain=true&show_logo=true&color_background=%23ffca28&color_button=%2355a539&color_text=%23000000&color_input_text=%23000000&color_button_text=%23ffffff&promo_id=4480&campaign_id=10`;
    
    if (pickupLocation) {
      url += `&pickup_location=${encodeURIComponent(pickupLocation)}`;
    }
    if (pickupDate) {
      url += `&pickup_date=${format(pickupDate, "yyyy-MM-dd")}`;
    }
    if (dropoffDate) {
      url += `&dropoff_date=${format(dropoffDate, "yyyy-MM-dd")}`;
    }
    return url;
  }, [pickupLocation, pickupDate, dropoffDate, isAr, currency]);

  // Build transfer widget URL
  const buildTransferUrl = useCallback(() => {
    const trs = "477988";
    const shmarker = "688262";
    const cur = (currency || "USD").toUpperCase();
    const tpCur = TP_CURRENCIES.includes(cur) ? cur : "USD";
    
    let url = `https://tpscr.com/content?currency=${tpCur}&trs=${trs}&shmarker=${shmarker}&locale=${isAr ? "ar" : "en"}&powered_by=true&transfer_options_limit=10&transfer_options=MCR&disable_currency_selector=true&hide_form_extras=true&hide_external_links=true&bg_color=%23FFFFFF&button_color=%2300A991&button_font_color=%23ffffff&campaign_id=1&promo_id=3879`;
    
    if (pickupLocation) {
      url += `&from_name=${encodeURIComponent(pickupLocation)}`;
    }
    if (pickupDate) {
      url += `&pickup_date=${format(pickupDate, "yyyy-MM-dd")}`;
    }
    return url;
  }, [pickupLocation, pickupDate, isAr, currency]);

  // Build DiscoverCars widget URL
  const buildDiscoverCarsUrl = useCallback(() => {
    const trs = "477988";
    const shmarker = "688262";
    const locale = isAr ? "ar" : "en";
    
    let url = `https://tpscr.com/content?trs=${trs}&shmarker=${shmarker}&locale=${locale}&powered_by=true&width=100&height=100&campaign_id=10&promo_id=2082`;
    
    if (pickupLocation) {
      url += `&pickup_location=${encodeURIComponent(pickupLocation)}`;
    }
    if (pickupDate) {
      url += `&pickup_date=${format(pickupDate, "yyyy-MM-dd")}`;
    }
    if (dropoffDate) {
      url += `&dropoff_date=${format(dropoffDate, "yyyy-MM-dd")}`;
    }
    return url;
  }, [pickupLocation, pickupDate, dropoffDate, isAr]);

  // WL search engine (same as before for deep search)
  const loadWLWidget = useCallback(() => {
    const normalizedCurrency = (currency || "USD").toUpperCase();
    const tpCurrency = (TP_CURRENCIES.includes(normalizedCurrency) ? normalizedCurrency : "USD").toLowerCase();

    const config: Record<string, any> = {
      wl_id: 3357,
      locale: isAr ? "ar" : "en",
      currency: tpCurrency,
      default_tab: "cars",
    };
    if (pickupLocation) config.destination = resolveIata(pickupLocation);
    if (pickupDate) config.depart_date = format(pickupDate, "yyyy-MM-dd");
    if (dropoffDate) config.return_date = format(dropoffDate, "yyyy-MM-dd");

    (window as any).__tpwl_config = config;

    const old = document.querySelector('script[data-tpwl-car="true"]');
    if (old) old.remove();
    const searchEl = document.getElementById("tpwl-search");
    const ticketsEl = document.getElementById("tpwl-tickets");
    if (searchEl) searchEl.innerHTML = "";
    if (ticketsEl) ticketsEl.innerHTML = "";

    setIsWLLoaded(false);
    const script = document.createElement("script");
    script.async = true;
    script.type = "module";
    script.src = `https://tpscr.com/wl_web/main.js?wl_id=3357&t=${Date.now()}`;
    script.dataset.tpwlCar = "true";
    script.onload = () => setTimeout(() => setIsWLLoaded(true), 2000);
    script.onerror = () => setIsWLLoaded(true);
    document.head.appendChild(script);
  }, [pickupLocation, pickupDate, dropoffDate, isAr, currency]);

  useEffect(() => {
    if (activeTab !== "wl") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadWLWidget, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const s = document.querySelector('script[data-tpwl-car="true"]');
      if (s) s.remove();
    };
  }, [loadWLWidget, activeTab]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 py-10">
        <div className="max-w-5xl mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
              <Car size={16} />
              {isAr ? "إيجار السيارات والنقل" : "Car Rental & Transfers"}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {isAr ? "استأجر سيارتك أو احجز نقلك" : "Rent a Car or Book a Transfer"}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {isAr ? "قارن أسعار أكثر من 900 شركة تأجير وخدمات نقل حول العالم" : "Compare prices from 900+ rental companies and transfer services worldwide"}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-20">
        {/* Search Form */}
        <Card className="p-4 mb-6 border-border shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "موقع الاستلام" : "Pickup Location"}</Label>
              <CitySearch onSelect={setPickupLocation} placeholder={isAr ? "المدينة أو المطار" : "City or airport"} initialValue={pickupLocation} />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "تاريخ الاستلام" : "Pickup Date"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !pickupDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {pickupDate ? format(pickupDate, "MMM dd, yyyy") : (isAr ? "اختر التاريخ" : "Select date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={pickupDate} onSelect={setPickupDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">{isAr ? "تاريخ التسليم" : "Drop-off Date"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs h-9", !dropoffDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {dropoffDate ? format(dropoffDate, "MMM dd, yyyy") : (isAr ? "اختر التاريخ" : "Select date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dropoffDate} onSelect={setDropoffDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1"><CreditCard size={10} />{isAr ? "بدون بطاقة ائتمان" : "No Credit Card"}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Shield size={10} />{isAr ? "تأمين شامل" : "Full Insurance"}</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Globe size={10} />{isAr ? "+900 شركة" : "900+ Providers"}</Badge>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="rental" className="gap-1.5 text-xs sm:text-sm">
              <Car size={14} /> {isAr ? "تأجير سيارات" : "Car Rental"}
            </TabsTrigger>
            <TabsTrigger value="transfer" className="gap-1.5 text-xs sm:text-sm">
              <Bus size={14} /> {isAr ? "خدمات النقل" : "Transfers"}
            </TabsTrigger>
            <TabsTrigger value="wl" className="gap-1.5 text-xs sm:text-sm">
              <Globe size={14} /> {isAr ? "بحث متقدم" : "Advanced"}
            </TabsTrigger>
          </TabsList>

          {/* Car Rental Tab */}
          <TabsContent value="rental">
            <Card className="p-4 md:p-6 border-border shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Car className="text-primary" size={20} />
                <h2 className="text-lg font-bold text-foreground">
                  {isAr ? "عروض تأجير السيارات" : "Car Rental Deals"}
                </h2>
              </div>
              {/* Travelpayouts Car Rental Search Widget */}
              <TravelpayoutsWidget
                scriptUrl={buildCarRentalUrl()}
                containerId="tp-car-rental-main"
                minHeight={500}
                loadTimeout={15000}
              />
              {/* DiscoverCars Widget */}
              <div className="mt-4">
                <TravelpayoutsWidget
                  scriptUrl={buildDiscoverCarsUrl()}
                  containerId="tp-discover-cars"
                  minHeight={400}
                  loadTimeout={15000}
                />
              </div>
              {/* Trip.com external link */}
              {pickupLocation && (
                <div className="mt-4 text-center">
                  <a
                    href={getTripCarUrl(pickupLocation, pickupDate ? format(pickupDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"), dropoffDate ? format(dropoffDate, "yyyy-MM-dd") : format(addDays(new Date(), 3), "yyyy-MM-dd"))}
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
          </TabsContent>

          {/* Transfer Tab */}
          <TabsContent value="transfer">
            <Card className="p-4 md:p-6 border-border shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Bus className="text-primary" size={20} />
                <h2 className="text-lg font-bold text-foreground">
                  {isAr ? "خدمات النقل من وإلى المطار" : "Airport Transfer Services"}
                </h2>
              </div>
              {/* Travelpayouts Transfer Widget */}
              <TravelpayoutsWidget
                scriptUrl={buildTransferUrl()}
                containerId="tp-transfer-main"
                minHeight={500}
                loadTimeout={15000}
              />
              {/* Trip.com external link */}
              {pickupLocation && (
                <div className="mt-4 text-center">
                  <a
                    href={getTripTransferUrl(pickupLocation, pickupDate ? format(pickupDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"))}
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
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="wl">
            <Card className="p-4 md:p-6 border-border shadow-sm overflow-hidden">
              <TravelpayoutsWidget
                scriptUrl={`https://tpscr.com/content?currency=${(currency || "USD").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111`}
                containerId="tp-advanced-search"
                minHeight={500}
                loadTimeout={15000}
              />
            </Card>
          </TabsContent>
        </Tabs>

        {/* Travelpayouts Additional Widgets */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            🚗 {isAr ? "عروض إضافية" : "More Deals"}
          </h2>
          
          {/* Insurance Widget */}
          <TravelpayoutsWidget
            scriptUrl="https://tpscr.com/content?currency=USD&trs=477988&shmarker=688262&locale=en&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497"
            containerId="tp-insurance"
            minHeight={300}
            loadTimeout={15000}
            className="rounded-xl border border-border shadow-sm"
          />

          {/* Tours & Activities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TravelpayoutsWidget
              scriptUrl="https://tpscr.com/content?currency=USD&trs=477988&shmarker=688262&language=en&layout=horizontal&cards=4&powered_by=true&campaign_id=89&promo_id=3947"
              containerId="tp-tours-horizontal"
              minHeight={300}
              loadTimeout={15000}
            />
            <TravelpayoutsWidget
              scriptUrl="https://tpscr.com/content?currency=USD&trs=477988&shmarker=688262&product=&language=en&layout=horizontal&powered_by=true&campaign_id=89&promo_id=3948"
              containerId="tp-tours-deals"
              minHeight={300}
              loadTimeout={15000}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
              <iframe
                src="https://www.trip.com/partners/ad/S14625543?Allianceid=7384441&SID=279474539&trip_sub1="
                style={{ width: "100%", height: 320, border: "none" }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Trip.com Cars"
                loading="lazy"
              />
            </div>
            <div className="w-full overflow-hidden rounded-xl border border-border shadow-sm">
              <iframe
                src="https://www.trip.com/partners/ad/DB14625277?Allianceid=7384441&SID=279474539&trip_sub1="
                style={{ width: "100%", height: 250, border: "none" }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Trip.com Transfers"
                loading="lazy"
              />
            </div>
          </div>
          {/* Direct booking links */}
          <div className="flex flex-wrap gap-2">
            <a href="https://www.trip.com/carhire/?Allianceid=7384441&SID=279474539&trip_sub1=&trip_sub3=D14625669" target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1">
                <Car size={12} /> {isAr ? "تأجير سيارات" : "Car Hire"}
              </Badge>
            </a>
            <a href="https://www.trip.com/airport-transfers/index/?Allianceid=7384441&SID=279474539&trip_sub1=&trip_sub3=D14625669" target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1">
                <Bus size={12} /> {isAr ? "نقل المطار" : "Airport Transfers"}
              </Badge>
            </a>
            <a href="https://www.trip.com/trains/eurotrains/?Allianceid=7384441&SID=279474539&trip_sub1=&trip_sub3=D14625669" target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1">
                🚆 {isAr ? "القطارات" : "Trains"}
              </Badge>
            </a>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { title: isAr ? "أسعار تنافسية" : "Competitive Prices", desc: isAr ? "نقارن من مئات الشركات" : "Compare from hundreds of companies" },
            { title: isAr ? "تأمين شامل" : "Full Coverage", desc: isAr ? "تأمين شامل على جميع السيارات" : "Full insurance on all cars" },
            { title: isAr ? "إلغاء مجاني" : "Free Cancellation", desc: isAr ? "إلغاء مجاني حتى 48 ساعة" : "Free cancel up to 48 hours" },
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

export default CarsPage;
