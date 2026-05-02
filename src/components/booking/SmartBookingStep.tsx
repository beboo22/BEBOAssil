import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plane, Hotel, Car, Bus, MapPin, Check, ChevronRight,
  ExternalLink, Bookmark, SkipForward, Loader2, Sparkles, Bell,
  Star, Clock, ArrowRight, Users, Fuel, Settings2, Search, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { savePendingBooking, createBookingReminder, requestPushPermission } from "@/utils/bookingReminders";
import { useCurrency } from "@/hooks/useCurrency";
import { getTripFlightUrl, getTripHotelUrl, getTripCarUrl, getTripTransferUrl } from "@/utils/bookingUtils";

export interface BookingSelection {
  flight?: { status: "selected" | "booked" | "skipped"; details?: string; data?: any };
  hotel?: { status: "selected" | "booked" | "skipped"; details?: string; data?: any };
  car?: { status: "selected" | "booked" | "skipped"; details?: string; data?: any };
  transfer?: { status: "selected" | "booked" | "skipped"; details?: string };
  activities?: { status: "selected" | "booked" | "skipped"; details?: string };
}

export interface CityLeg {
  city: string;
  transport: string;
  days: number;
}

interface SmartBookingStepProps {
  destination: string;
  departureCity: string;
  startDate: Date;
  endDate: Date;
  travelers: number;
  wantFlight: boolean;
  wantHotel: boolean;
  wantCar: boolean;
  flightTripType?: "round" | "oneway";
  cityLegs?: CityLeg[];
  onComplete: (selections: BookingSelection) => void;
  onSkipAll: () => void;
}

interface FlightResult {
  airline: string;
  flight_number: string;
  departure_at: string;
  return_at?: string;
  price: number;
  currency: string;
  transfers: number;
  duration: number;
  duration_to: number;
  duration_back?: number;
  origin: string;
  destination: string;
  link: string;
}

interface HotelResult {
  hotelId: number;
  hotelName: string;
  stars: number;
  price: number;
  priceMin: number;
  currency: string;
  location: string;
  link: string;
  image: string;
  rating: number;
  reviews: number;
}

interface CarResult {
  id: string;
  name: string;
  type: string;
  className: string;
  price: number;
  currency: string;
  image: string;
  vendor: string;
  link: string;
  transmission: string;
  seats: number;
  fuel: string;
  features: string[];
}

const SmartBookingStep = ({
  destination, departureCity, startDate, endDate, travelers,
  wantFlight, wantHotel, wantCar, flightTripType = "round", cityLegs = [], onComplete, onSkipAll,
}: SmartBookingStepProps) => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { currency: preferredCurrency, formatPrice } = useCurrency();
  const [selections, setSelections] = useState<BookingSelection>({});
  const [activeTab, setActiveTab] = useState(wantFlight ? "flights" : wantHotel ? "hotels" : "cars");

  // Multi-city flight segments
  interface FlightSegment {
    from: string;
    fromIata: string;
    to: string;
    toIata: string;
    date: string;
    flights: FlightResult[];
    loading: boolean;
    selectedFlight: FlightResult | null;
  }
  const [flightSegments, setFlightSegments] = useState<FlightSegment[]>([]);

  // Search states
  const [flights, setFlights] = useState<FlightResult[]>([]);
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [cars, setCars] = useState<CarResult[]>([]);
  const [flightDeepLink, setFlightDeepLink] = useState("");
  const [hotelDeepLink, setHotelDeepLink] = useState("");

  const [loadingFlights, setLoadingFlights] = useState(false);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingCars, setLoadingCars] = useState(false);

  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelResult | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarResult | null>(null);

  // IATA code mapping for better API results
  const cityIataMap: Record<string, string> = {
    'jeddah': 'JED', 'dubai': 'DXB', 'cairo': 'CAI', 'riyadh': 'RUH',
    'abu dhabi': 'AUH', 'doha': 'DOH', 'paris': 'CDG', 'london': 'LHR',
    'istanbul': 'IST', 'rome': 'FCO', 'barcelona': 'BCN', 'amsterdam': 'AMS',
    'tokyo': 'NRT', 'new york': 'JFK', 'los angeles': 'LAX', 'bangkok': 'BKK',
    'singapore': 'SIN', 'kuala lumpur': 'KUL', 'madrid': 'MAD', 'berlin': 'BER',
    'miami': 'MIA', 'sydney': 'SYD', 'seoul': 'ICN', 'hong kong': 'HKG',
    'muscat': 'MCT', 'amman': 'AMM', 'beirut': 'BEY', 'casablanca': 'CMN',
    'الرياض': 'RUH', 'جدة': 'JED', 'دبي': 'DXB', 'القاهرة': 'CAI',
    'اسطنبول': 'IST', 'لندن': 'LHR', 'باريس': 'CDG', 'الدوحة': 'DOH',
    'أبوظبي': 'AUH', 'مسقط': 'MCT', 'عمان': 'AMM', 'بيروت': 'BEY',
  };
  const resolveIata = (city: string) => {
    if (!city) return "";
    const cityPart = city.split(/[،,]/)[0].trim();
    const clean = cityPart.toLowerCase();
    return cityIataMap[clean] || cityPart.substring(0, 3).toUpperCase();
  };

  // For multi-city trips, use the first city leg as the effective destination
  const effectiveDestination = (cityLegs.length > 0 && !destination) ? cityLegs[0]?.city || "" : destination;
  const destCity = effectiveDestination?.split(",")[0]?.trim() || effectiveDestination;
  const depCity = departureCity?.split(",")[0]?.trim() || departureCity;
  const destIata = resolveIata(effectiveDestination);
  const depIata = resolveIata(departureCity);
  const checkIn = format(startDate, "yyyy-MM-dd");
  const checkOut = format(endDate, "yyyy-MM-dd");

  // Prices now come pre-converted from the edge function in the user's currency.
  // So we pass the SAME currency to formatPrice to avoid double-conversion.
  const displayPrice = (amount: number, sourceCurrency?: string) => {
    // If sourceCurrency matches user's preferred currency, no conversion needed
    const sc = (sourceCurrency || "USD").toUpperCase();
    return formatPrice(amount || 0, sc);
  };

  // Build multi-city flight segments
  const isMultiCity = cityLegs.length > 0;
  
  const buildFlightSegments = (): { from: string; fromIata: string; to: string; toIata: string; date: string }[] => {
    if (!isMultiCity) return [];
    const segments: { from: string; fromIata: string; to: string; toIata: string; date: string }[] = [];
    // First segment: departure → first destination
    let currentDate = new Date(startDate);
    segments.push({
      from: departureCity, fromIata: depIata,
      to: effectiveDestination, toIata: destIata,
      date: format(currentDate, "yyyy-MM-dd"),
    });
    // Middle segments: each city → next city (only for flight transport)
    let prevCity = effectiveDestination;
    let prevIata = destIata;
    for (const leg of cityLegs) {
      // Add days for previous city
      const daysInPrev = segments.length === 1 
        ? Math.max(1, Math.floor((leg.days || 2))) 
        : (leg.days || 2);
      currentDate = new Date(currentDate.getTime() + daysInPrev * 24 * 60 * 60 * 1000);
      
      if (leg.transport === 'flight' && leg.city) {
        const legIata = resolveIata(leg.city);
        segments.push({
          from: prevCity, fromIata: prevIata,
          to: leg.city, toIata: legIata,
          date: format(currentDate, "yyyy-MM-dd"),
        });
        prevCity = leg.city;
        prevIata = legIata;
      } else if (leg.city) {
        prevCity = leg.city;
        prevIata = resolveIata(leg.city);
      }
    }
    // Return segment: last city → departure (if round trip)
    if (flightTripType === "round") {
      currentDate = new Date(endDate);
      segments.push({
        from: prevCity, fromIata: prevIata,
        to: departureCity, toIata: depIata,
        date: format(currentDate, "yyyy-MM-dd"),
      });
    }
    return segments;
  };

  // Auto-search on mount
  useEffect(() => {
    if (wantFlight) {
      if (isMultiCity) {
        searchMultiCityFlights();
      } else {
        searchFlights();
      }
    }
    if (wantHotel) searchHotels();
    if (wantCar) searchCars();
  }, []);

  const searchMultiCityFlights = async () => {
    const segments = buildFlightSegments();
    if (segments.length === 0) { searchFlights(); return; }
    
    setLoadingFlights(true);
    const initialSegments: FlightSegment[] = segments.map(s => ({
      ...s, flights: [], loading: true, selectedFlight: null,
    }));
    setFlightSegments(initialSegments);

    // Search all segments in parallel
    const results = await Promise.allSettled(
      segments.filter(seg => seg.fromIata && seg.toIata).map(async (seg) => {
        try {
          const { data, error } = await supabase.functions.invoke("travelpayouts", {
            body: {
              type: "flights",
              origin: seg.fromIata,
              destination: seg.toIata,
              departDate: seg.date,
              adults: travelers,
              currency: (preferredCurrency || "USD").toUpperCase(),
            },
          });
          if (error) throw error;
          return { segKey: `${seg.fromIata}-${seg.toIata}`, flights: data?.flights || [] };
        } catch { return { segKey: `${seg.fromIata}-${seg.toIata}`, flights: [] }; }
      })
    );

    const validSegments = segments.filter(seg => seg.fromIata && seg.toIata);
    const updatedSegments: FlightSegment[] = segments.map((seg) => {
      const idx = validSegments.findIndex(vs => vs.fromIata === seg.fromIata && vs.toIata === seg.toIata && vs.date === seg.date);
      const resultFlights = idx >= 0 && results[idx]?.status === 'fulfilled' 
        ? (results[idx] as PromiseFulfilledResult<{ segKey: string; flights: FlightResult[] }>).value.flights 
        : [];
      return { ...seg, flights: resultFlights, loading: false, selectedFlight: null };
    });
    setFlightSegments(updatedSegments);
    // Also set first segment flights as main flights for compatibility
    if (updatedSegments[0]?.flights?.length) {
      setFlights(updatedSegments[0].flights);
    }
    setLoadingFlights(false);
  };

  const searchFlights = async () => {
    if (!depIata || !destIata) {
      console.warn("Flight search skipped: missing origin or destination IATA code", { depIata, destIata });
      setLoadingFlights(false);
      return;
    }
    setLoadingFlights(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelpayouts", {
        body: {
          type: "flights",
          origin: depIata,
          destination: destIata,
          departDate: checkIn,
          returnDate: flightTripType === "round" ? checkOut : undefined,
          adults: travelers,
          currency: (preferredCurrency || "USD").toUpperCase(),
        },
      });
      if (error) throw error;
      if (data?.flights) setFlights(data.flights);
      if (data?.deepLink) setFlightDeepLink(data.deepLink);
    } catch (err) {
      console.error("Flight search error:", err);
    } finally {
      setLoadingFlights(false);
    }
  };

  const searchHotels = async () => {
    setLoadingHotels(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelpayouts", {
        body: {
          type: "hotels",
          iata: destIata,
          city: destCity,
          checkIn, checkOut, adults: travelers, currency: (preferredCurrency || "USD").toUpperCase(),
        },
      });
      if (error) throw error;
      if (data?.hotels) setHotels(data.hotels);
      if (data?.deepLink) setHotelDeepLink(data.deepLink);
    } catch (err) {
      console.error("Hotel search error:", err);
    } finally {
      setLoadingHotels(false);
    }
  };

  const searchCars = async () => {
    setLoadingCars(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelpayouts", {
        body: {
          type: "cars",
          city: destCity,
          pickupDate: checkIn,
          dropoffDate: checkOut,
          currency: (preferredCurrency || "USD").toUpperCase(),
          locale: isAr ? "ar" : "en",
        },
      });
      if (error) throw error;
      if (data?.cars) setCars(data.cars);
    } catch (err) {
      console.error("Car search error:", err);
    } finally {
      setLoadingCars(false);
    }
  };

  const handleSelectFlight = async (flight: FlightResult) => {
    setSelectedFlight(flight);
    setSelections(prev => ({
      ...prev,
      flight: {
        status: "selected",
        details: `${flight.airline} ${flight.flight_number} - ${displayPrice(flight.price, flight.currency)}`,
        data: flight,
      },
    }));
    toast.success(isAr ? "✅ تم اختيار الرحلة" : "✅ Flight selected");
  };

  const handleSelectHotel = async (hotel: HotelResult) => {
    setSelectedHotel(hotel);
    setSelections(prev => ({
      ...prev,
      hotel: {
        status: "selected",
        details: `${hotel.hotelName} - ${displayPrice(hotel.price, hotel.currency)}`,
        data: hotel,
      },
    }));
    toast.success(isAr ? "✅ تم اختيار الفندق" : "✅ Hotel selected");
  };

  const handleSelectCar = async (car: CarResult) => {
    setSelectedCar(car);
    setSelections(prev => ({
      ...prev,
      car: {
        status: "selected",
        details: `${car.name} - ${displayPrice(car.price, car.currency)}/${isAr ? "يوم" : "day"}`,
        data: car,
      },
    }));
    toast.success(isAr ? "✅ تم اختيار السيارة" : "✅ Car selected");
  };

  const handleBookNow = (link: string, category: keyof BookingSelection) => {
    window.open(link, "_blank");
    setSelections(prev => ({
      ...prev,
      [category]: { ...prev[category], status: "booked" },
    }));
    toast.success(isAr ? "🔗 تم فتح صفحة الحجز" : "🔗 Booking page opened");
  };

  const handleSaveForLater = async (category: keyof BookingSelection) => {
    await requestPushPermission();
    savePendingBooking({
      category,
      status: "selected",
      destination: destCity,
      travelDate: checkIn,
      savedAt: new Date().toISOString(),
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await createBookingReminder(user.id, category, destCity, checkIn, isAr);
    }
    toast.success(isAr ? "📌 تم الحفظ مع تذكير" : "📌 Saved with reminder");
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const tabs = useMemo(() => {
    const t: { id: string; label: string; icon: any; count: number }[] = [];
    if (wantFlight) t.push({ id: "flights", label: isAr ? "رحلات" : "Flights", icon: Plane, count: flights.length });
    if (wantHotel) t.push({ id: "hotels", label: isAr ? "فنادق" : "Hotels", icon: Hotel, count: hotels.length });
    if (wantCar) t.push({ id: "cars", label: isAr ? "سيارات" : "Cars", icon: Car, count: cars.length });
    t.push({ id: "metasearch", label: isAr ? "بحث متقدم" : "Full Search", icon: Search, count: 0 });
    return t;
  }, [wantFlight, wantHotel, wantCar, isAr, flights.length, hotels.length, cars.length]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="text-primary" size={24} />
          <h2 className="text-2xl font-bold text-foreground">
            {isAr ? "اختر حجوزاتك" : "Choose Your Bookings"}
          </h2>
        </div>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          {isAr
            ? `نتائج حية من شركاء السفر لرحلتك إلى ${destCity}. اختر الأنسب لك.`
            : `Live results from travel partners for your trip to ${destCity}. Pick what suits you.`}
        </p>
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground flex-wrap">
          {isMultiCity ? (
            <>
              <Badge variant="outline" className="gap-1">
                <MapPin size={10} /> {depIata} → {destIata}
                {flightSegments.filter(s => s.fromIata !== depIata || s.toIata !== destIata).map((s, i) => (
                  <span key={i}> → {s.toIata}</span>
                ))}
              </Badge>
            </>
          ) : (
            <Badge variant="outline" className="gap-1"><MapPin size={10} /> {depIata} → {destIata}</Badge>
          )}
          <Badge variant="outline">{checkIn} → {checkOut}</Badge>
          <Badge variant="outline">{travelers} {isAr ? "مسافر" : "travelers"}</Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex gap-1 bg-muted/30 p-1 rounded-xl">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 text-xs sm:text-sm flex-1">
              <tab.icon size={14} />
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && <Badge variant="secondary" className="text-[9px] px-1">{tab.count}</Badge>}
              {selections[tab.id.slice(0, -1) as keyof BookingSelection]?.status && (
                <Check size={12} className="text-green-500 shrink-0" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Flights */}
        {wantFlight && (
          <TabsContent value="flights" className="space-y-3 mt-4">
            {loadingFlights ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="animate-spin text-primary" size={32} />
                <p className="text-sm text-muted-foreground">{isAr ? "جارٍ البحث عن رحلات..." : "Searching flights..."}</p>
              </div>
            ) : isMultiCity && flightSegments.length > 0 ? (
              /* Multi-city segments view */
              <div className="space-y-6">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ {isAr ? "الأسعار تقريبية وقد تختلف عند الحجز الفعلي" : "Prices are approximate and may vary at actual booking"}
                </p>
                {flightSegments.map((segment, segIdx) => (
                  <div key={segIdx} className="space-y-2">
                    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <Plane size={14} className="text-primary" />
                      <span className="text-sm font-semibold text-foreground">
                        {isAr ? `المسار ${segIdx + 1}:` : `Segment ${segIdx + 1}:`} {segment.fromIata} → {segment.toIata}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{segment.date}</Badge>
                      {segment.selectedFlight && <Check size={14} className="text-green-500 ml-auto" />}
                    </div>
                    {segment.loading ? (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 className="animate-spin text-primary" size={16} />
                        <span className="text-xs text-muted-foreground">{isAr ? "جارٍ البحث..." : "Searching..."}</span>
                      </div>
                    ) : segment.flights.length === 0 ? (
                      <Card className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">{isAr ? "لا توجد رحلات لهذا المسار" : "No flights for this segment"}</p>
                      </Card>
                    ) : (
                      segment.flights.slice(0, 5).map((flight, i) => (
                        <FlightCard
                          key={i}
                          flight={flight}
                          isSelected={segment.selectedFlight?.flight_number === flight.flight_number}
                          onSelect={() => {
                            // Update segment selection
                            setFlightSegments(prev => prev.map((s, idx) => 
                              idx === segIdx ? { ...s, selectedFlight: flight } : s
                            ));
                            // Update main selection with all selected segments
                            const allSelected = flightSegments.map((s, idx) => 
                              idx === segIdx ? flight : s.selectedFlight
                            ).filter(Boolean);
                            if (allSelected.length > 0) {
                              handleSelectFlight(allSelected[0]!);
                            }
                          }}
                          onBook={() => handleBookNow(flight.link, "flight")}
                          onSave={() => handleSaveForLater("flight")}
                          formatDuration={formatDuration}
                          formatPriceLabel={displayPrice}
                          isAr={isAr}
                        />
                      ))
                    )}
                  </div>
                ))}
                {/* Multi-city total */}
                {flightSegments.some(s => s.selectedFlight) && (
                  <Card className="p-3 border-primary/30 bg-primary/5">
                    <h4 className="text-xs font-semibold mb-2">{isAr ? "✈️ ملخص رحلات الطيران" : "✈️ Flight Summary"}</h4>
                    {flightSegments.filter(s => s.selectedFlight).map((s, i) => (
                      <div key={i} className="flex justify-between text-xs py-1">
                        <span>{s.fromIata} → {s.toIata} ({s.selectedFlight!.airline})</span>
                        <span className="font-bold">{displayPrice(s.selectedFlight!.price, s.selectedFlight!.currency)}</span>
                      </div>
                    ))}
                    <div className="border-t border-border mt-1 pt-1 flex justify-between text-xs font-bold">
                      <span>{isAr ? "إجمالي الطيران" : "Total Flights"}</span>
                      <span className="text-primary">
                        {displayPrice(
                          flightSegments.filter(s => s.selectedFlight).reduce((sum, s) => sum + (s.selectedFlight?.price || 0), 0),
                          preferredCurrency
                        )}
                      </span>
                    </div>
                  </Card>
                )}
              </div>
            ) : flights.length === 0 ? (
              <Card className="p-6 text-center">
                {flightDeepLink && (
                  <Button onClick={() => window.open(flightDeepLink, "_blank")} variant="outline" className="gap-2">
                    <ExternalLink size={14} /> {isAr ? "بحث متقدم" : "Advanced Search"}
                  </Button>
                )}
              </Card>
            ) : (
              <>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ {isAr ? "الأسعار تقريبية وقد تختلف عند الحجز الفعلي" : "Prices are approximate and may vary at actual booking"}
                </p>
                {flights.slice(0, 10).map((flight, i) => (
                  <FlightCard
                    key={i}
                    flight={flight}
                    isSelected={selectedFlight?.flight_number === flight.flight_number}
                    onSelect={() => handleSelectFlight(flight)}
                    onBook={() => handleBookNow(flight.link, "flight")}
                    onSave={() => handleSaveForLater("flight")}
                    formatDuration={formatDuration}
                    formatPriceLabel={displayPrice}
                    isAr={isAr}
                  />
                ))}
                {flightDeepLink && (
                  <Button onClick={() => window.open(flightDeepLink, "_blank")} variant="outline" className="w-full gap-2">
                    <ExternalLink size={14} /> {isAr ? "عرض المزيد من الرحلات" : "View More Flights"}
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* Hotels */}
        {wantHotel && (
          <TabsContent value="hotels" className="space-y-3 mt-4">
            {loadingHotels ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="animate-spin text-primary" size={32} />
                <p className="text-sm text-muted-foreground">{isAr ? "جارٍ البحث عن فنادق..." : "Searching hotels..."}</p>
              </div>
            ) : hotels.length === 0 ? (
              <Card className="p-6 text-center">
                {hotelDeepLink && (
                  <Button onClick={() => window.open(hotelDeepLink, "_blank")} variant="outline" className="gap-2">
                    <ExternalLink size={14} /> {isAr ? "بحث في Hotellook" : "Search on Hotellook"}
                  </Button>
                )}
              </Card>
            ) : (
              <>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ {isAr ? "الأسعار تقريبية وقد تختلف عند الحجز الفعلي" : "Prices are approximate and may vary at actual booking"}
                </p>
                {hotels.slice(0, 10).map((hotel, i) => (
                  <HotelCard
                    key={i}
                    hotel={hotel}
                    isSelected={selectedHotel?.hotelId === hotel.hotelId}
                    onSelect={() => handleSelectHotel(hotel)}
                    onBook={() => handleBookNow(hotel.link, "hotel")}
                    onSave={() => handleSaveForLater("hotel")}
                    formatPriceLabel={displayPrice}
                    isAr={isAr}
                  />
                ))}
                {hotelDeepLink && (
                  <Button onClick={() => window.open(hotelDeepLink, "_blank")} variant="outline" className="w-full gap-2">
                    <ExternalLink size={14} /> {isAr ? "عرض المزيد" : "View More Hotels"}
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* Cars */}
        {wantCar && (
          <TabsContent value="cars" className="space-y-3 mt-4">
            {loadingCars ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="animate-spin text-primary" size={32} />
                <p className="text-sm text-muted-foreground">{isAr ? "جارٍ البحث عن سيارات..." : "Searching cars..."}</p>
              </div>
            ) : cars.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground">{isAr ? "لا توجد سيارات متاحة" : "No cars available"}</p>
              </Card>
            ) : (
              <>
                {cars.map((car, i) => (
                  <CarResultCard
                    key={i}
                    car={car}
                    isSelected={selectedCar?.id === car.id}
                    onSelect={() => handleSelectCar(car)}
                    onBook={() => handleBookNow(car.link, "car")}
                    onSave={() => handleSaveForLater("car")}
                    formatPriceLabel={displayPrice}
                    isAr={isAr}
                  />
                ))}
              </>
            )}
          </TabsContent>
        )}

        {/* White Label Metasearch */}
        <TabsContent value="metasearch" className="mt-4">
          <div className="text-center mb-3">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  if (wantFlight) searchFlights();
                  if (wantHotel) searchHotels();
                  if (wantCar) searchCars();
                  toast.success(isAr ? "🔄 تمت إعادة المزامنة" : "🔄 Synced successfully");
                }}
              >
                <RefreshCw size={12} />
                {isAr ? "إعادة مزامنة" : "Re-sync"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "محرك بحث متكامل مع حجز مباشر - ابحث وقارن واحجز في مكان واحد"
                : "Full search engine with direct booking - search, compare & book in one place"}
            </p>
          </div>
          {/* Travelpayouts White Label (WL 3357) - proper iframe isolation */}
          <TpWLWidget
            origin={depIata}
            destination={destIata}
            departDate={checkIn}
            returnDate={flightTripType === "round" ? checkOut : undefined}
            adults={travelers}
            locale={isAr ? "ar" : "en"}
            currency={(preferredCurrency || "usd").toLowerCase()}
          />
          {/* Additional widgets */}
          <div className="space-y-4 mt-4">
            {/* Trip.com Hotels */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Hotel size={14} className="text-primary" />
                {isAr ? "فنادق Trip.com" : "Trip.com Hotels"}
              </h3>
              <div className="w-full overflow-hidden rounded-lg border border-border/50">
                <iframe
                  src={getTripHotelUrl(destination, checkIn, checkOut, String(travelers))}
                  style={{ width: "100%", height: 400, border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                  title="Trip.com Hotels"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Trip.com Flights */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Plane size={14} className="text-primary" />
                {isAr ? "طيران Trip.com" : "Trip.com Flights"}
              </h3>
              <div className="w-full overflow-hidden rounded-lg border border-border/50">
                <iframe
                  src={getTripFlightUrl(departureCity, destination, checkIn, flightTripType, flightTripType === "round" ? checkOut : undefined)}
                  style={{ width: "100%", height: 400, border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                  title="Trip.com Flights"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Trip.com Car Rental */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Car size={14} className="text-primary" />
                {isAr ? "إيجار سيارات Trip.com" : "Trip.com Car Rental"}
              </h3>
              <div className="w-full overflow-hidden rounded-lg border border-border/50">
                <iframe
                  src={getTripCarUrl(destination, checkIn, checkOut)}
                  style={{ width: "100%", height: 400, border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                  title="Trip.com Car Rental"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Trip.com Airport Transfers */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Bus size={14} className="text-primary" />
                {isAr ? "توصيل المطار" : "Airport Transfers"}
              </h3>
              <div className="w-full overflow-hidden rounded-lg border border-border/50">
                <iframe
                  src={getTripTransferUrl(destination, checkIn)}
                  style={{ width: "100%", height: 400, border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                  title="Trip.com Airport Transfers"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Travelpayouts Hotel Widget */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Hotel size={14} className="text-primary" />
                {isAr ? "بحث الفنادق" : "Hotel Search"}
              </h3>
              <TpWidget
                scriptUrl={`https://tpscr.com/content?currency=${(preferredCurrency || "usd").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=4478`}
                minHeight={250}
              />
            </div>

            {/* Travelpayouts Car Rental Widget */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Car size={14} className="text-primary" />
                {isAr ? "إيجار السيارات" : "Car Rental"}
              </h3>
              <TpWidget
                scriptUrl={`https://tpscr.com/content?currency=${(preferredCurrency || "usd").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&powered_by=true&color_button=%2300A991&color_focused=%2300A991&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541`}
                minHeight={250}
              />
            </div>

            {/* Travelpayouts Transfer Widget */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Bus size={14} className="text-primary" />
                {isAr ? "خدمات النقل والتوصيل" : "Transfer Services"}
              </h3>
              <TpWidget
                scriptUrl={`https://tpscr.com/content?currency=${(preferredCurrency || "usd").toLowerCase()}&trs=477988&shmarker=688262&locale=${isAr ? "ar" : "en"}&powered_by=true&transfer_options_limit=10&transfer_options=MCR&disable_currency_selector=true&hide_form_extras=true&hide_external_links=true&campaign_id=1&promo_id=3879`}
                minHeight={250}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Selected Summary */}
      {(selectedFlight || selectedHotel || selectedCar) && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <h3 className="font-semibold text-sm mb-2">{isAr ? "📋 ملخص اختياراتك" : "📋 Your Selections"}</h3>
          <div className="space-y-1.5 text-xs">
            {selectedFlight && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1"><Plane size={12} /> {selectedFlight.airline} {selectedFlight.flight_number}</span>
                <span className="font-bold">{displayPrice(selectedFlight.price, selectedFlight.currency)}</span>
              </div>
            )}
            {selectedHotel && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1"><Hotel size={12} /> {selectedHotel.hotelName}</span>
                <span className="font-bold">{displayPrice(selectedHotel.price, selectedHotel.currency)}</span>
              </div>
            )}
            {selectedCar && (
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1"><Car size={12} /> {selectedCar.name}</span>
                <span className="font-bold">{displayPrice(selectedCar.price, selectedCar.currency)}/{isAr ? "يوم" : "day"}</span>
              </div>
            )}
            <div className="border-t border-border pt-1 flex justify-between font-bold">
              <span>{isAr ? "الإجمالي التقديري" : "Estimated Total"}</span>
              <span className="text-primary">
                {displayPrice((selectedFlight?.price || 0) + (selectedHotel?.price || 0) + (selectedCar?.price || 0), preferredCurrency)}
              </span>
            </div>
            <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ {isAr ? "الأسعار تقريبية وقد تختلف" : "Prices are approximate"}
            </p>
          </div>
        </Card>
      )}

      {/* Bottom Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 border-t border-border">
        <Button onClick={() => onComplete(selections)} size="lg" className="gap-2 px-8">
          <Check size={18} />
          {isAr ? "تأكيد وإنشاء الخطة" : "Confirm & Generate Plan"}
        </Button>
        <Button variant="outline" onClick={onSkipAll} size="lg" className="gap-2">
          <SkipForward size={16} />
          {isAr ? "تخطي - إنشاء الخطة مباشرة" : "Skip - Generate Plan Directly"}
        </Button>
      </div>
    </motion.div>
  );
};

// ─── Flight Card ─────────────────────────────────────────────────────────────
function FlightCard({ flight, isSelected, onSelect, onBook, onSave, formatDuration, formatPriceLabel, isAr }: {
  flight: FlightResult; isSelected: boolean; onSelect: () => void;
  onBook: () => void; onSave: () => void; formatDuration: (m: number) => string;
  formatPriceLabel: (amount: number, sourceCurrency?: string) => string;
  isAr?: boolean;
}) {
  const depTime = flight.departure_at ? new Date(flight.departure_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const airlineLogo = flight.airline ? `https://pics.avs.io/80/80/${flight.airline}.png` : "";
  return (
    <Card className={`p-3 transition-all cursor-pointer hover:shadow-md ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}`}>
      <div className="flex items-center gap-3" onClick={onSelect}>
        {/* Airline Logo */}
        <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden border border-border">
          {airlineLogo ? (
            <img src={airlineLogo} alt={flight.airline} className="w-10 h-10 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <Plane size={16} className={`text-muted-foreground ${airlineLogo ? 'hidden' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold">{flight.airline}</span>
            <span className="text-[10px] text-muted-foreground">{flight.flight_number}</span>
            {flight.transfers === 0 && <Badge className="text-[9px] bg-green-500/90 text-white">{isAr ? "مباشر" : "Direct"}</Badge>}
            {flight.transfers > 0 && <Badge variant="secondary" className="text-[9px]">{flight.transfers} {isAr ? "توقف" : "stop"}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{flight.origin}</span>
            <div className="flex-1 flex items-center gap-1 max-w-[80px]">
              <div className="h-px flex-1 bg-muted-foreground/30" />
              <Plane size={10} className="text-muted-foreground rotate-45" />
              <div className="h-px flex-1 bg-muted-foreground/30" />
            </div>
            <span className="font-medium">{flight.destination}</span>
            {depTime && depTime !== "00:00" && <span className="text-muted-foreground text-[10px]">• {depTime}</span>}
            {(!depTime || depTime === "00:00") && <span className="text-muted-foreground text-[10px] italic">• {isAr ? 'تحقق من الوقت' : 'Verify time'}</span>}
          </div>
          {flight.duration_to > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock size={9} /> {formatDuration(flight.duration_to)}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-primary">{formatPriceLabel(flight.price, flight.currency)}</p>
          <p className="text-[10px] text-muted-foreground">{flight.currency}</p>
        </div>
      </div>
      {isSelected && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex gap-2 mt-2 pt-2 border-t border-border">
          <Button size="sm" className="flex-1 gap-1 text-xs" onClick={onBook}>
            <ExternalLink size={12} /> {isAr ? "احجز الآن" : "Book Now"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={onSave}>
            <Bookmark size={12} /> {isAr ? "حفظ لاحقاً" : "Save for Later"}
          </Button>
        </motion.div>
      )}
    </Card>
  );
}

// ─── Hotel Card ──────────────────────────────────────────────────────────────
function HotelCard({ hotel, isSelected, onSelect, onBook, onSave, formatPriceLabel, isAr }: {
  hotel: HotelResult; isSelected: boolean; onSelect: () => void;
  onBook: () => void; onSave: () => void;
  formatPriceLabel: (amount: number, sourceCurrency?: string) => string;
  isAr?: boolean;
}) {
  return (
    <Card className={`overflow-hidden transition-all cursor-pointer hover:shadow-md ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}`}>
      <div className="flex" onClick={onSelect}>
        <div className="relative w-28 h-28 sm:w-36 sm:h-32 shrink-0">
          <img
            src={hotel.image}
            alt={hotel.hotelName}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
          />
          {hotel.rating > 0 && (
            <div className="absolute top-1.5 left-1.5 bg-primary/90 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              {hotel.rating}/10
            </div>
          )}
        </div>
        <div className="p-3 flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{hotel.hotelName}</h4>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: hotel.stars }).map((_, i) => (
              <Star key={i} size={10} className="fill-amber-400 text-amber-400" />
            ))}
          </div>
          {hotel.location && <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1"><MapPin size={9} />{hotel.location}</p>}
          {hotel.reviews > 0 && <p className="text-[9px] text-muted-foreground">{hotel.reviews} {isAr ? "تقييم" : "reviews"}</p>}
          <div className="flex items-end justify-between mt-1">
            <div>
              <p className="text-lg font-bold text-primary">{formatPriceLabel(hotel.price, hotel.currency)}</p>
              <p className="text-[10px] text-muted-foreground">{isAr ? "لليلة" : "/night"}</p>
            </div>
          </div>
        </div>
      </div>
      {isSelected && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex gap-2 px-3 pb-3">
          <Button size="sm" className="flex-1 gap-1 text-xs" onClick={onBook}>
            <ExternalLink size={12} /> {isAr ? "احجز الآن" : "Book Now"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={onSave}>
            <Bookmark size={12} /> {isAr ? "حفظ لاحقاً" : "Save for Later"}
          </Button>
        </motion.div>
      )}
    </Card>
  );
}

// ─── Car Card ────────────────────────────────────────────────────────────────
function CarResultCard({ car, isSelected, onSelect, onBook, onSave, formatPriceLabel, isAr }: {
  car: CarResult; isSelected: boolean; onSelect: () => void;
  onBook: () => void; onSave: () => void;
  formatPriceLabel: (amount: number, sourceCurrency?: string) => string;
  isAr?: boolean;
}) {
  return (
    <Card className={`overflow-hidden transition-all cursor-pointer hover:shadow-md ${isSelected ? "ring-2 ring-primary border-primary" : "border-border"}`}>
      <div className="flex" onClick={onSelect}>
        <div className="relative w-28 h-28 sm:w-36 sm:h-32 shrink-0">
          <img
            src={car.image}
            alt={car.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
          />
          <div className="absolute bottom-1 left-1 bg-background/80 backdrop-blur-sm text-[9px] font-medium px-1.5 py-0.5 rounded">
            {car.vendor}
          </div>
        </div>
        <div className="p-3 flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{car.name}</h4>
          <Badge variant="outline" className="text-[9px] mt-0.5">{car.className}</Badge>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1.5 flex-wrap">
            <span className="flex items-center gap-0.5"><Settings2 size={9} /> {car.transmission}</span>
            <span className="flex items-center gap-0.5"><Users size={9} /> {car.seats}</span>
            <span className="flex items-center gap-0.5"><Fuel size={9} /> {car.fuel}</span>
          </div>
          {car.features && car.features.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {car.features.slice(0, 2).map((f, i) => (
                <Badge key={i} variant="secondary" className="text-[8px] px-1 py-0">{f}</Badge>
              ))}
            </div>
          )}
          <p className="text-lg font-bold text-primary mt-1">{formatPriceLabel(car.price, car.currency)}<span className="text-[10px] font-normal text-muted-foreground">/{isAr ? "يوم" : "day"}</span></p>
        </div>
      </div>
      {isSelected && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex gap-2 px-3 pb-3">
          <Button size="sm" className="flex-1 gap-1 text-xs" onClick={onBook}>
            <ExternalLink size={12} /> {isAr ? "احجز الآن" : "Book Now"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={onSave}>
            <Bookmark size={12} /> {isAr ? "حفظ لاحقاً" : "Save for Later"}
          </Button>
        </motion.div>
      )}
    </Card>
  );
}

export default SmartBookingStep;

// ─── Travelpayouts Content Widget (iframe-isolated) ─────────────────────────
function TpWidget({ scriptUrl, minHeight = 250 }: { scriptUrl: string; minHeight?: number }) {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState(0);

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:transparent;overflow-x:hidden}body>div,body>iframe,body>section{width:100%!important}</style>
</head><body><script async src="${scriptUrl}" charset="utf-8"><\/script></body></html>`, [scriptUrl]);

  useEffect(() => { setKey(k => k + 1); setLoaded(false); }, [scriptUrl]);

  return (
    <div className="w-full overflow-hidden rounded-lg relative" style={{ minHeight }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      )}
      <iframe
        key={key}
        srcDoc={srcDoc}
        onLoad={() => setTimeout(() => setLoaded(true), 1500)}
        style={{ width: "100%", minHeight, height: loaded ? "auto" : minHeight, border: "none", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
        title="Travel Widget"
        loading="lazy"
      />
    </div>
  );
}

// ─── Travelpayouts White Label Widget (WL 3357) ─────────────────────────────
function TpWLWidget({ origin, destination, departDate, returnDate, adults, locale, currency }: {
  origin: string; destination: string; departDate: string; returnDate?: string;
  adults?: number; locale: string; currency: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState(0);

  const configJson = useMemo(() => JSON.stringify({
    wl_id: 3357,
    locale: locale || "en",
    currency: currency || "usd",
    one_way: !returnDate,
    origin, destination,
    depart_date: departDate,
    ...(returnDate && { return_date: returnDate }),
    ...(adults && { adults }),
  }), [origin, destination, departDate, returnDate, adults, locale, currency]);

  const srcDoc = useMemo(() => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:transparent;overflow-x:hidden}</style>
</head><body>
<div id="tpwl-search"></div>
<div id="tpwl-tickets"></div>
<script>window.__tpwl_config=${configJson};<\/script>
<script async type="module" src="https://tpscr.com/wl_web/main.js?wl_id=3357"><\/script>
</body></html>`, [configJson]);

  useEffect(() => { setKey(k => k + 1); setLoaded(false); }, [configJson]);

  return (
    <div className="w-full overflow-hidden rounded-lg relative" style={{ minHeight: 400 }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
          <Loader2 className="animate-spin text-primary" size={24} />
          <span className="ml-2 text-sm text-muted-foreground">
            {locale === "ar" ? "جارٍ تحميل محرك البحث..." : "Loading search engine..."}
          </span>
        </div>
      )}
      <iframe
        key={key}
        srcDoc={srcDoc}
        onLoad={() => setTimeout(() => setLoaded(true), 2000)}
        style={{ width: "100%", minHeight: 400, height: loaded ? 800 : 400, border: "none", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
        title="Travelpayouts Metasearch"
      />
    </div>
  );
}
