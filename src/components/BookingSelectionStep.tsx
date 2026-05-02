import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plane, Hotel, Check, ExternalLink, Star, Clock, ArrowRight, Loader2, Car } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { travelpayoutsService, FlightResult, HotelResult, CarResult } from '@/services/api/travelpayoutsService';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import HotelImageCarousel from './booking/HotelImageCarousel';

interface BookingSelectionStepProps {
  itinerary: any;
  onSelectFlight: (flight: FlightResult) => void;
  onSelectHotel: (hotel: HotelResult) => void;
  onSelectCar?: (car: CarResult) => void;
  onSkip: () => void;
  wantFlight: boolean;
  wantHotel: boolean;
  wantCar?: boolean;
}

const cityIataMap: Record<string, string> = {
  'jeddah': 'JED', 'dubai': 'DXB', 'cairo': 'CAI', 'riyadh': 'RUH',
  'abu dhabi': 'AUH', 'doha': 'DOH', 'paris': 'CDG', 'london': 'LHR',
  'istanbul': 'IST', 'rome': 'FCO', 'barcelona': 'BCN', 'amsterdam': 'AMS',
  'tokyo': 'NRT', 'new york': 'JFK', 'los angeles': 'LAX', 'bangkok': 'BKK',
  'singapore': 'SIN', 'kuala lumpur': 'KUL', 'madrid': 'MAD', 'berlin': 'BER',
  'miami': 'MIA', 'sydney': 'SYD', 'seoul': 'ICN', 'hong kong': 'HKG',
  'الرياض': 'RUH', 'جدة': 'JED', 'دبي': 'DXB', 'القاهرة': 'CAI',
  'اسطنبول': 'IST', 'لندن': 'LHR', 'باريس': 'CDG',
};

function extractIata(city: string): string {
  if (!city) return '';
  const clean = city.toLowerCase().split(',')[0].trim();
  return cityIataMap[clean] || city.split(',')[0].trim().substring(0, 3).toUpperCase();
}

const BookingSelectionStep = ({
  itinerary,
  onSelectFlight,
  onSelectHotel,
  onSelectCar,
  onSkip,
  wantFlight,
  wantHotel,
  wantCar = false,
}: BookingSelectionStepProps) => {
  const { t } = useTranslation();
  const [flights, setFlights] = useState<FlightResult[]>([]);
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [cars, setCars] = useState<CarResult[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingCars, setLoadingCars] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelResult | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarResult | null>(null);
  const [flightDeepLink, setFlightDeepLink] = useState('');
  const [hotelDeepLink, setHotelDeepLink] = useState('');
  const [carFallbackUrl, setCarFallbackUrl] = useState('');

  const startDate = itinerary.startDate ? new Date(itinerary.startDate) : new Date();
  const endDate = itinerary.endDate ? new Date(itinerary.endDate) : addDays(startDate, itinerary.duration || 3);

  // CRITICAL: Strip "City A → City B" chains from destination
  const splitChain = (raw: string): string[] =>
    String(raw || "").split(/\s*(?:→|->|—|–|\||\/| to | إلى )\s*/i).map(s => s.trim()).filter(Boolean);
  const rawDestination: string = itinerary.destination || "";
  const destinationChainFromString = splitChain(rawDestination);
  const primaryDestination = destinationChainFromString[0] || rawDestination;

  const destIata = itinerary.travelMetadata?.destinationIATA || extractIata(primaryDestination);
  const origIata = itinerary.travelMetadata?.originIATA || extractIata(itinerary.departureCity || '');

  // User booking preferences (apartment / villa / etc + budget)
  const prefAccommodationType: string = String(
    itinerary.tripDetails?.accommodationType || itinerary.accommodationType || "any"
  ).toLowerCase();
  const prefMaxBudgetPerNight: number = Number(
    itinerary.tripDetails?.maxBudgetPerNight || itinerary.maxBudgetPerNight || 0
  );
  const prefMinStars: number = Number(
    itinerary.tripDetails?.hotelStarRating || itinerary.hotelStarRating || 0
  );

  // Detect multi-city legs from any source (cities array OR destination chain string)
  const cityChainArr: any[] =
    itinerary.cities ||
    itinerary.citiesVisited ||
    itinerary.tripDetails?.cities ||
    [];
  let cityNames: string[] = Array.isArray(cityChainArr)
    ? cityChainArr.map((c: any) => (typeof c === "string" ? c : c?.city || c?.name)).filter(Boolean)
    : [];
  if (cityNames.length < 2 && destinationChainFromString.length >= 2) {
    cityNames = destinationChainFromString;
  }
  const isMultiCity = cityNames.length >= 2;

  useEffect(() => {
    // FLIGHTS: search per-leg in multi-city, otherwise single origin->destination
    if (wantFlight) {
      setLoadingFlights(true);
      (async () => {
        try {
          const allFlights: FlightResult[] = [];
          let firstDeepLink = "";

          if (isMultiCity) {
            const chain = origIata
              ? [itinerary.departureCity || "", ...cityNames]
              : cityNames;
            for (let i = 0; i < chain.length - 1; i++) {
              const fromIata = extractIata(chain[i]);
              const toIata = extractIata(chain[i + 1]);
              if (!fromIata || !toIata || fromIata === toIata) continue;
              try {
                const legDate = format(addDays(startDate, Math.floor(i * (itinerary.duration || 3) / Math.max(chain.length - 1, 1))), 'yyyy-MM-dd');
                const res = await travelpayoutsService.searchFlights({
                  origin: fromIata, destination: toIata, departDate: legDate, adults: 1,
                });
                res.flights.slice(0, 3).forEach(f => allFlights.push({ ...f, origin: fromIata, destination: toIata } as any));
                if (!firstDeepLink && res.deepLink) firstDeepLink = res.deepLink;
              } catch (legErr) {
                console.warn(`[BookingSelection] Flight leg ${i} failed:`, legErr);
              }
            }
          } else if (origIata && destIata) {
            const res = await travelpayoutsService.searchFlights({
              origin: origIata, destination: destIata,
              departDate: format(startDate, 'yyyy-MM-dd'),
              returnDate: format(endDate, 'yyyy-MM-dd'),
              adults: 1,
            });
            allFlights.push(...res.flights.slice(0, 6));
            firstDeepLink = res.deepLink;
          }
          setFlights(allFlights);
          setFlightDeepLink(firstDeepLink);
        } catch (err) {
          console.error('Flight search error:', err);
        } finally {
          setLoadingFlights(false);
        }
      })();
    }

    // HOTELS: per-city in multi-city; respect accommodation type & budget
    if (wantHotel) {
      setLoadingHotels(true);
      (async () => {
        try {
          const allHotels: HotelResult[] = [];
          let firstDeepLink = "";
          const targetCities = isMultiCity
            ? cityNames
            : [primaryDestination?.split(',')[0] || ""];

          // Local filters mirroring user preferences
          const matchType = (h: HotelResult) => {
            if (prefAccommodationType === "any") return true;
            const t = String((h as any).type || (h as any).property_type || "").toLowerCase();
            if (prefAccommodationType === "hotel") {
              return !t.includes("apartment") && !t.includes("hostel") && !t.includes("villa");
            }
            return t.includes(prefAccommodationType);
          };
          const matchBudget = (h: HotelResult) => {
            if (!prefMaxBudgetPerNight) return true;
            const p = Number(h.price) || 0;
            return p === 0 || p <= prefMaxBudgetPerNight;
          };
          const matchStars = (h: HotelResult) => {
            if (!prefMinStars) return true;
            const s = Number(h.stars) || 0;
            return s === 0 || s >= prefMinStars;
          };

          for (const cityRaw of targetCities) {
            const cityName = String(cityRaw || "").split(',')[0].trim();
            if (!cityName) continue;
            try {
              const res = await travelpayoutsService.searchHotels({
                iata: extractIata(cityName),
                city: cityName,
                checkIn: format(startDate, 'yyyy-MM-dd'),
                checkOut: format(endDate, 'yyyy-MM-dd'),
                adults: 2,
              });
              const filtered = res.hotels.filter(h => matchType(h) && matchBudget(h) && matchStars(h));
              const finalSet = filtered.length > 0 ? filtered : res.hotels;
              const tagged = finalSet.slice(0, isMultiCity ? 4 : 6).map(h => ({
                ...h,
                location: cityName, // ALWAYS the single city — never "A → B"
                type: (h as any).type || prefAccommodationType,
              } as HotelResult));
              allHotels.push(...tagged);
              if (!firstDeepLink && res.deepLink) firstDeepLink = res.deepLink;
            } catch (cityErr) {
              console.warn(`[BookingSelection] Hotel search failed for ${cityName}:`, cityErr);
            }
          }
          setHotels(allHotels);
          setHotelDeepLink(firstDeepLink);
        } catch (err) {
          console.error('Hotel search error:', err);
        } finally {
          setLoadingHotels(false);
        }
      })();
    }

    if (wantCar) {
      setLoadingCars(true);
      const cityName = (isMultiCity ? cityNames[0] : primaryDestination)?.split(',')[0] || '';
      travelpayoutsService.searchCars({
        city: cityName,
        pickupDate: format(startDate, 'yyyy-MM-dd'),
        dropoffDate: format(endDate, 'yyyy-MM-dd'),
      }).then(res => {
        setCars(res.cars.slice(0, 6));
        setCarFallbackUrl(res.fallbackUrl);
      }).catch(err => {
        console.error('Car search error:', err);
      }).finally(() => setLoadingCars(false));
    }
  }, []);

  const handleConfirm = () => {
    if (selectedFlight) onSelectFlight(selectedFlight);
    if (selectedHotel) onSelectHotel(selectedHotel);
    if (selectedCar && onSelectCar) onSelectCar(selectedCar);
    // Navigate even if nothing selected (skip behavior)
    onSkip();
  };

  const isLoading = loadingFlights || loadingHotels || loadingCars;
  const hasSelections = selectedFlight || selectedHotel || selectedCar;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t('booking.selectBookings', { defaultValue: 'اختر حجوزاتك' })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('booking.selectBookingsDesc', { defaultValue: 'اختر رحلتك وفندقك وسيتم ضبط الخطة تلقائياً حسب اختيارك' })}
        </p>
      </div>

      {/* Flight Results */}
      {wantFlight && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Plane size={20} className="text-primary" />
            {t('booking.availableFlights', { defaultValue: 'الرحلات المتاحة' })}
            <span className="text-xs text-muted-foreground">({origIata} → {destIata})</span>
          </h3>
          {loadingFlights ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : flights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {flights.map((flight, idx) => {
                const isSelected = selectedFlight === flight;
                const departTime = flight.departure_at ? new Date(flight.departure_at) : null;
                return (
                  <Card key={idx}
                    className={`p-4 cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:border-primary/30'}`}
                    onClick={() => setSelectedFlight(isSelected ? null : flight)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Plane size={16} className="text-primary" />
                        <span className="font-semibold text-foreground">{flight.airline}</span>
                        {flight.flight_number && <Badge variant="outline" className="text-[10px]">{flight.flight_number}</Badge>}
                      </div>
                      {isSelected && <Check size={18} className="text-primary" />}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Clock size={12} />{departTime ? format(departTime, 'HH:mm') : '--:--'}</span>
                      <ArrowRight size={12} />
                      <span>{flight.transfers === 0 ? t('booking.direct', { defaultValue: 'مباشر' }) : `${flight.transfers} ${t('booking.stops', { defaultValue: 'توقف' })}`}</span>
                      {flight.duration > 0 && <span className="text-xs">({Math.floor(flight.duration / 60)}h {flight.duration % 60}m)</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">${flight.price}</span>
                      {flight.link && (
                        <Button size="sm" variant="outline" className="text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); window.open(flight.link, '_blank'); }}>
                          <ExternalLink size={12} /> {t('booking.bookNow', { defaultValue: 'احجز' })}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground mb-3">{t('booking.noFlightsFound', { defaultValue: 'لم نجد رحلات. يمكنك البحث يدوياً:' })}</p>
              {flightDeepLink && (
                <Button variant="outline" onClick={() => window.open(flightDeepLink, '_blank')} className="gap-2">
                  <ExternalLink size={14} /> {t('booking.searchManually', { defaultValue: 'البحث على Aviasales' })}
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Hotel Results */}
      {wantHotel && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Hotel size={20} className="text-primary" />
            {t('booking.availableHotels', { defaultValue: 'الفنادق المتاحة' })}
          </h3>
          {loadingHotels ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : hotels.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {hotels.map((hotel, idx) => {
                const isSelected = selectedHotel === hotel;
                return (
                  <Card key={idx}
                    className={`overflow-hidden cursor-pointer transition-all hover:shadow-md group ${isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
                    onClick={() => setSelectedHotel(isSelected ? null : hotel)}>
                    <div className="relative h-32 bg-muted">
                      <HotelImageCarousel
                        images={(hotel as any).images?.length ? (hotel as any).images : (hotel.image ? [hotel.image] : [])}
                        alt={hotel.hotelName}
                        fallbackQuery={hotel.hotelName}
                      />
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-20 bg-primary text-primary-foreground rounded-full p-1"><Check size={14} /></div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="font-semibold text-foreground text-sm truncate">{hotel.hotelName}</h4>
                      {hotel.location && (
                        <Badge variant="outline" className="text-[10px] mt-1 mb-1">📍 {hotel.location}</Badge>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: hotel.stars || 0 }).map((_, i) => (
                          <Star key={i} size={12} className="text-amber-500 fill-amber-500" />
                        ))}
                        {hotel.rating && <Badge variant="secondary" className="text-[10px] ml-1">{hotel.rating}</Badge>}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold text-primary">${hotel.price}<span className="text-xs text-muted-foreground font-normal">/{t('booking.night', { defaultValue: 'ليلة' })}</span></span>
                        {hotel.link && (
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); window.open(hotel.link, '_blank'); }}>
                            <ExternalLink size={12} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground mb-3">{t('booking.noHotelsFound', { defaultValue: 'لم نجد فنادق. يمكنك البحث يدوياً:' })}</p>
              {hotelDeepLink && (
                <Button variant="outline" onClick={() => window.open(hotelDeepLink, '_blank')} className="gap-2">
                  <ExternalLink size={14} /> {t('booking.searchManually', { defaultValue: 'البحث على Hotellook' })}
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Car Rental Results */}
      {wantCar && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Car size={20} className="text-primary" />
            {t('booking.availableCars', { defaultValue: 'السيارات المتاحة' })}
          </h3>
          {loadingCars ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : cars.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {cars.map((car, idx) => {
                const isSelected = selectedCar === car;
                return (
                  <Card key={idx}
                    className={`overflow-hidden cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
                    onClick={() => setSelectedCar(isSelected ? null : car)}>
                    {car.image && (
                      <div className="relative h-28 bg-muted">
                        <img src={car.image} alt={car.name} className="w-full h-full object-contain p-2"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1"><Check size={14} /></div>
                        )}
                      </div>
                    )}
                    <div className="p-3">
                      <h4 className="font-semibold text-foreground text-sm truncate">{car.name}</h4>
                      {car.type && <Badge variant="secondary" className="text-[10px] mt-1">{car.type}</Badge>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold text-primary">${car.price}<span className="text-xs text-muted-foreground font-normal">/{t('booking.day', { defaultValue: 'يوم' })}</span></span>
                        {car.link && (
                          <Button size="sm" variant="outline" className="text-xs gap-1"
                            onClick={(e) => { e.stopPropagation(); window.open(car.link, '_blank'); }}>
                            <ExternalLink size={12} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground mb-3">{t('booking.noCarsFound', { defaultValue: 'لم نجد سيارات. يمكنك البحث يدوياً:' })}</p>
              {carFallbackUrl && (
                <Button variant="outline" onClick={() => window.open(carFallbackUrl, '_blank')} className="gap-2">
                  <ExternalLink size={14} /> {t('booking.searchManually', { defaultValue: 'البحث يدوياً' })}
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <Button
          onClick={handleConfirm}
          disabled={isLoading}
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8"
          size="lg"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={18} />}
          {hasSelections
            ? t('booking.confirmAndGenerate', { defaultValue: 'تأكيد وإنشاء الخطة' })
            : t('booking.generateWithoutBooking', { defaultValue: 'إنشاء الخطة' })}
        </Button>
        <Button variant="outline" onClick={onSkip} size="lg">
          {t('booking.skipBookings', { defaultValue: 'تخطي - إنشاء بدون حجوزات' })}
        </Button>
      </div>
    </motion.div>
  );
};

export default BookingSelectionStep;
