
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, PlaneLanding, Clock, DollarSign, Loader2, Users, LandPlot } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CitySearch from "./CitySearch";
import { getActivityImage, getActivityMapLink, normalizeWebsiteUrl } from "@/utils/activityHelpers";
import { useCurrency } from "@/hooks/useCurrency";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/hooks/useAuth";
import { buildBookingsRoute } from "@/utils/bookingsRouting";
import { enforceDailyItemLimit } from "@/utils/enforceDailyItemLimit";
import { getFriendlyGenerationError } from "@/lib/generationErrors";

interface PlanningParams {
  options?: {
    itinerary: boolean;
    flight: boolean;
    carRental: boolean;
    hotel: boolean;
  };
  departureCity?: string;
  destinationCity?: string;
  carType?: string | null;
  hotelCategory?: string | null;
  estimatedCost?: number;
  duration?: number;
  totalBudget?: number;
  mealPreferences?: any;
  quickTripType?: string | null;
  interests?: string[];
  transport?: string;
  additionalPreferences?: string;
  specialRequests?: string;
  startDate?: string;
  activitiesPerDay?: number;
  totalDailyItemsTarget?: number;
}

interface TripPlannerProps {
  initialPlanningParams?: PlanningParams | null;
}

const interestOptions = [
  { value: "culture", label: "Culture & History" },
  { value: "nature", label: "Nature & Outdoors" },
  { value: "food", label: "Food & Cuisine" },
  { value: "adventure", label: "Adventure & Sports" },
  { value: "shopping", label: "Shopping" },
  { value: "nightlife", label: "Nightlife" },
  { value: "relaxation", label: "Relaxation & Wellness" },
  { value: "family", label: "Family-Friendly" },
  { value: "art", label: "Art & Museums" },
  { value: "local", label: "Local Experiences" },
];

const TripPlanner = ({ initialPlanningParams }: TripPlannerProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, formatPrice } = useCurrency();
  const { user } = useAuth();
  const { maxActivitiesPerDay, remainingActivities, maxTotalActivities } = useSubscriptionLimits();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [returnDate, setReturnDate] = useState<Date | undefined>();
  const [duration, setDuration] = useState(3);
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [additionalPreferences, setAdditionalPreferences] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [includesFlights, setIncludesFlights] = useState(false);
  const [includesHotel, setIncludesHotel] = useState(false);
  const [includesCarRental, setIncludesCarRental] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [guestGenerationEnabled, setGuestGenerationEnabled] = useState<boolean | null>(null);
  const [guestTrialLimit, setGuestTrialLimit] = useState(1);

  // Fetch guest generation settings
  useEffect(() => {
    if (user) return; // Only matters for guests
    supabase
      .from("site_settings")
      .select("guest_generation_enabled, guest_trial_limit")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGuestGenerationEnabled((data as any).guest_generation_enabled === true);
          setGuestTrialLimit((data as any).guest_trial_limit ?? 1);
        }
      });
  }, [user]);

  // Check if there's initial data from navigation state or planning parameters
  useEffect(() => {
    // From location state
    if (location.state) {
      if (location.state.destination) {
        setDestination(location.state.destination);
      }
      if (location.state.departDate) {
        setStartDate(new Date(location.state.departDate));
      }
      if (location.state.returnDate) {
        setReturnDate(new Date(location.state.returnDate));
        // Calculate duration if both dates are available
        if (location.state.departDate && location.state.returnDate) {
          const depart = new Date(location.state.departDate);
          const ret = new Date(location.state.returnDate);
          const diffTime = Math.abs(ret.getTime() - depart.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDuration(diffDays);
        }
      }
      if (location.state.travelers) {
        setTravelers(location.state.travelers);
      }
    }

    // From planning parameters
    if (initialPlanningParams) {
      if (initialPlanningParams.departureCity) {
        setDepartureCity(initialPlanningParams.departureCity);
      }
      if (initialPlanningParams.destinationCity) {
        setDestination(initialPlanningParams.destinationCity);
      }
      if (initialPlanningParams.duration) {
        setDuration(initialPlanningParams.duration);
      }
      
      if (initialPlanningParams.options) {
        setIncludesFlights(initialPlanningParams.options.flight);
        setIncludesHotel(initialPlanningParams.options.hotel);
        setIncludesCarRental(initialPlanningParams.options.carRental);
      }

      if (Array.isArray(initialPlanningParams.interests) && initialPlanningParams.interests.length > 0) {
        setSelectedInterests(initialPlanningParams.interests);
      }

      // Prefill special requests / event context (exact event time, venue, etc.)
      const incomingSpecial = initialPlanningParams.additionalPreferences || initialPlanningParams.specialRequests;
      if (incomingSpecial && typeof incomingSpecial === 'string') {
        setAdditionalPreferences(incomingSpecial);
      }

      if (initialPlanningParams.startDate) {
        const parsed = new Date(initialPlanningParams.startDate);
        if (!isNaN(parsed.getTime())) setStartDate(parsed);
      }

      if (initialPlanningParams.transport) {
        setIncludesFlights(initialPlanningParams.transport === "flight");
        setIncludesCarRental(initialPlanningParams.transport === "rental_car" || initialPlanningParams.transport === "personal_car");
      }
      
      if (initialPlanningParams.totalBudget) {
        setBudget(initialPlanningParams.totalBudget.toString());
      } else if (initialPlanningParams.estimatedCost) {
        setEstimatedCost(initialPlanningParams.estimatedCost);
        setBudget(initialPlanningParams.estimatedCost.toString());
      }
    }
  }, [location, initialPlanningParams]);

  const handleInterestChange = (interest: string, checked: boolean) => {
    if (checked) {
      setSelectedInterests(prev => [...prev, interest]);
    } else {
      setSelectedInterests(prev => prev.filter(i => i !== interest));
    }
  };

  const calculateDuration = () => {
    if (startDate && returnDate) {
      const diffTime = Math.abs(returnDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDuration(diffDays);
    }
  };

  const handleReturnDateChange = (date: Date | undefined) => {
    setReturnDate(date);
    if (date && startDate) {
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDuration(diffDays);
    }
  };

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    if (date && returnDate) {
      const diffTime = Math.abs(returnDate.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDuration(diffDays);
    }
  };

  const handleGeneratePlan = async () => {
    if (!destination) {
      toast.error("Please select a destination");
      return;
    }
    
    if (!startDate) {
      toast.error("Please select a start date");
      return;
    }

    // Block guests if admin has disabled guest generation
    if (!user && guestGenerationEnabled === false) {
      toast.error("🔒 هذه الميزة متاحة فقط للمستخدمين المسجلين. يرجى تسجيل الدخول أو إنشاء حساب.", {
        action: { label: "تسجيل الدخول", onClick: () => navigate('/auth') },
        duration: 6000,
      });
      return;
    }

    // Check guest daily limit
    if (!user && guestGenerationEnabled) {
      // Use device fingerprint that survives incognito mode and different browsers
      const { getDeviceFingerprint } = await import('@/utils/deviceFingerprint');
      const guestId = await getDeviceFingerprint();
      try { localStorage.setItem('guest_id', guestId); } catch { /* noop */ }

      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('usage_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('guest_id', guestId)
        .eq('feature', 'planner')
        .gte('used_at', `${today}T00:00:00`);
      if ((count || 0) >= guestTrialLimit) {
        toast.error("🔒 لقد استنفدت الحد المجاني اليومي. سجّل الدخول للمزيد!", {
          action: { label: "تسجيل الدخول", onClick: () => navigate('/auth') },
          duration: 6000,
        });
        return;
      }
    }

    // Check if user has exhausted their total activities quota
    if (remainingActivities !== null && remainingActivities <= 0) {
      toast.error("🚫 لقد استنفدت رصيدك من الفعاليات. يرجى ترقية باقتك.", {
        action: { label: "ترقية", onClick: () => navigate('/pricing') },
        duration: 6000,
      });
      return;
    }

    setIsGenerating(true);
    toast.info("🤖 Generating your personalized trip plan with AI...");
    
    try {
      const selectedMealPreferences = initialPlanningParams?.mealPreferences;
      const selectedCuisineTypes = Array.isArray(selectedMealPreferences?.cuisineTypes)
        ? selectedMealPreferences.cuisineTypes.filter(Boolean)
        : [];
      const selectedTripType = initialPlanningParams?.quickTripType || null;
      const generatedPreferences = [
        additionalPreferences.trim(),
        selectedTripType ? `Trip type: ${selectedTripType}` : "",
        selectedCuisineTypes.length > 0 ? `Preferred cuisines: ${selectedCuisineTypes.join(', ')}` : "",
        selectedMealPreferences
          ? [
              selectedMealPreferences.breakfast && 'breakfast',
              selectedMealPreferences.lunch && 'lunch',
              selectedMealPreferences.dinner && 'dinner',
              selectedMealPreferences.snacks && 'snacks',
            ].filter(Boolean).length > 0
              ? `MANDATORY MEAL REQUIREMENTS (must include these meals EVERY day):\n${[
                  selectedMealPreferences.breakfast && 'breakfast',
                  selectedMealPreferences.lunch && 'lunch',
                  selectedMealPreferences.dinner && 'dinner',
                  selectedMealPreferences.snacks && 'snacks',
                ].filter(Boolean).map((meal: string) => `- ${meal}`).join('\n')}`
              : ""
          : "",
      ].filter(Boolean).join('\n');

      const requestedMealsPerDay = [
        selectedMealPreferences?.breakfast,
        selectedMealPreferences?.lunch,
        selectedMealPreferences?.dinner,
        selectedMealPreferences?.snacks,
      ].filter(Boolean).length;
      const requestedTarget = Math.max(
        1,
        Number(initialPlanningParams?.totalDailyItemsTarget)
          || ((Number(initialPlanningParams?.activitiesPerDay) || 0) + requestedMealsPerDay)
          || Number(maxActivitiesPerDay)
      );

      const { data, error } = await supabase.functions.invoke('generate-trip', {
        body: {
          destination,
          departureCity,
          duration,
          travelers,
          budget,
          interests: selectedInterests,
          additionalPreferences: generatedPreferences,
          startDate: startDate.toISOString().split('T')[0],
          lang: typeof window !== 'undefined' ? (document.documentElement.lang || navigator.language || 'en') : 'en',
          maxActivitiesPerDay: requestedTarget,
          totalDailyItemsTarget: requestedTarget,
          maxTotalActivitiesRemaining: remainingActivities, // null = unlimited
          tripType: selectedTripType || undefined,
          mealPreferences: selectedMealPreferences || undefined,
          cuisineTypes: selectedCuisineTypes.length > 0 ? selectedCuisineTypes : undefined,
        },
      });

      const isArabic = (typeof window !== 'undefined' ? (document.documentElement.lang || navigator.language || 'en') : 'en').startsWith('ar');

      if (error) {
        throw new Error(getFriendlyGenerationError(error.message || "Failed to generate trip", isArabic));
      }

      if (data?.error) {
        throw new Error(getFriendlyGenerationError(data.error, isArabic));
      }

      // Generate a unique ID for this itinerary
      const itineraryId = Math.random().toString(36).substring(2, 10);
      
      // Transform AI response into itinerary format
      const endDate = returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
      
      const itineraryToSave = {
        id: itineraryId,
        destination: data.destination || destination,
        departureCity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        duration,
        days: data.days.map((day: any) => ({
          date: day.date || new Date(startDate.getTime() + (day.dayNumber - 1) * 24 * 60 * 60 * 1000).toISOString(),
          activities: day.activities.map((act: any) => ({
            id: act.id,
            title: act.name,
            name: act.name,
            description: act.description,
            startTime: act.time,
            endTime: calculateEndTime(act.time, act.duration),
            address: act.address,
            // Prefer exact place link (with place_id) returned by the generator
            googleMapsLink: act.googleMapsUrl || act.googleMapsLink || getActivityMapLink(act, data.destination || destination),
            googleMapsUrl: act.googleMapsUrl || act.googleMapsLink,
            googleMapsCoordsUrl: act.googleMapsCoordsUrl,
            place_id: act.place_id || act.placeId,
            imageUrl: getActivityImage(act, data.destination || destination),
            openingHours: act.openingHours,
            isOpen: true,
            cost: act.cost,
            type: act.category,
            category: act.category,
            duration: act.duration,
            phone: act.phone,
            website: normalizeWebsiteUrl(act.website),
            rating: act.rating,
            latitude: act.latitude,
            longitude: act.longitude,
            // Preserve match anchor metadata so the match banner renders inside activity cards
            isMatchAnchor: act.isMatchAnchor,
            matchReason: act.matchReason,
            venue: act.venue,
          })),
        })),
        estimatedTotalCost: data.estimatedTotalCost,
        tips: data.tips,
        includesFlights,
        includesHotel,
        includesCarRental,
        aiGenerated: true,
        tripType: selectedTripType,
        interests: selectedInterests,
        activityPrefs: selectedInterests,
        mealPreferences: selectedMealPreferences,
        cuisinePreferences: selectedCuisineTypes,
        specialRequests: additionalPreferences,
        // Persist the strict per-day target so regeneration uses the original number
        activitiesPerDay: Math.max(0, requestedTarget - requestedMealsPerDay),
        maxActivitiesPerDay: requestedTarget,
        totalDailyItemsTarget: requestedTarget,
      };

      // ── FINAL VALIDATOR ─────────────────────────────────────────────
      // Trim every day to exactly the requested target (meals + attractions).
      const enforced = enforceDailyItemLimit(itineraryToSave.days, requestedTarget, selectedMealPreferences);
      itineraryToSave.days = enforced.days;
      if (enforced.trimmedCount > 0) {
        toast.info(`Plan trimmed to match your target (${requestedTarget}/day) — ${enforced.trimmedCount} extra removed.`);
      }

      localStorage.setItem(`itinerary-${itineraryId}`, JSON.stringify(itineraryToSave));

      if (user) {
        await (supabase as any).from('saved_trips').insert({
          user_id: user.id,
          trip_id: itineraryId,
          destination: itineraryToSave.destination,
          trip_data: itineraryToSave as any,
        });
      }

      // Track total activities generated for quota enforcement
      if (user && maxTotalActivities > 0) {
        const totalActivitiesGenerated = itineraryToSave.days.reduce((sum: number, day: any) => sum + ((day.activities || []).length), 0);

        if (totalActivitiesGenerated > 0) {
          await supabase.from('usage_tracking').insert({
            user_id: user.id,
            feature: 'planner',
            quantity: totalActivitiesGenerated,
          });
          window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
        }
      }

      // Track guest usage (using device fingerprint)
      if (!user) {
        const { getDeviceFingerprint } = await import('@/utils/deviceFingerprint');
        const guestId = await getDeviceFingerprint();
        await supabase.from('usage_tracking').insert({
          guest_id: guestId,
          feature: 'planner',
          quantity: 1,
        });
        window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
      }
      
      const shouldOpenBookings = includesFlights || includesHotel || includesCarRental;
      toast.success("✅ Trip plan generated successfully!");
      setIsGenerating(false);
      navigate(shouldOpenBookings
        ? buildBookingsRoute({
            tab: includesFlights ? "flights" : includesHotel ? "hotels" : "cars",
            from: departureCity,
            to: destination,
            date: startDate,
            returnDate: (includesFlights || includesHotel || includesCarRental) ? endDate : undefined,
            guests: travelers,
            itineraryId,
          })
        : `/itinerary/${itineraryId}`
      );
    } catch (error: any) {
      console.error("Error generating plan:", error);
      toast.error(error.message || "Something went wrong. Please try again.");
      setIsGenerating(false);
    }
  };

  // Helper to calculate end time from start time and duration string
  const calculateEndTime = (startTime: string, durationStr: string): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const durationMatch = durationStr?.match(/(\d+\.?\d*)\s*hour/i);
    const durationHours = durationMatch ? parseFloat(durationMatch[1]) : 1;
    const totalMinutes = hours * 60 + (minutes || 0) + durationHours * 60;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = Math.round(totalMinutes % 60);
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glassmorphism rounded-xl p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Trip Planner</h2>
        <p className="text-gray-600">Let our AI create a personalized trip plan based on your preferences</p>
        {user && remainingActivities !== null && maxTotalActivities > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <LandPlot className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-primary">
              {remainingActivities > 0 
                ? `${remainingActivities} / ${maxTotalActivities} activities remaining`
                : 'Activity quota exhausted — please upgrade'}
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-600 dark:text-amber-400 text-xs">⚠️</span>
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Meals (breakfast, lunch, dinner) count as activities toward your daily & total activity limits.
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="departureCity" className="text-sm font-medium mb-1.5 block">
              Departure City
            </Label>
            <CitySearch 
              onSelect={(city) => setDepartureCity(city)} 
              placeholder="Where are you starting from?"
              initialValue={departureCity}
            />
          </div>
          
          <div>
            <Label htmlFor="destination" className="text-sm font-medium mb-1.5 block">
              Destination
            </Label>
            <CitySearch 
              onSelect={(city) => setDestination(city)} 
              placeholder="Where are you going?"
              initialValue={destination}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <Label htmlFor="startDate" className="text-sm font-medium mb-1.5 block">
              Start Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM dd, yyyy") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={handleStartDateChange}
                  initialFocus
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <Label htmlFor="returnDate" className="text-sm font-medium mb-1.5 block">
              Return Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !returnDate && "text-muted-foreground"
                  )}
                >
                  <LandPlot className="mr-2 h-4 w-4" />
                  {returnDate ? format(returnDate, "MMM dd, yyyy") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={returnDate}
                  onSelect={handleReturnDateChange}
                  initialFocus
                  disabled={(date) => 
                    date < new Date(new Date().setHours(0, 0, 0, 0)) || 
                    (startDate && date < startDate)
                  }
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="duration" className="text-sm font-medium mb-1.5 block">
              Duration (days)
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
              <Input
                id="duration"
                type="number"
                min="1"
                max="30"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="travelers" className="text-sm font-medium mb-1.5 block">
              Number of Travelers
            </Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
              <Input
                id="travelers"
                type="number"
                min="1"
                max="10"
                value={travelers}
                onChange={(e) => setTravelers(parseInt(e.target.value) || 1)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="budget" className="text-sm font-medium mb-1.5 block">
              Budget ({currency})
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
              <Input
                id="budget"
                type="text"
                placeholder="Your trip budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="pl-10 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{currency}</span>
            </div>
          </div>
        </div>

        {/* Estimated Cost Display */}
        {estimatedCost > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-travel-blue mr-2" />
                <span className="font-medium">Estimated Cost from Selection:</span>
              </div>
              <span className="text-xl font-bold text-travel-blue">{formatPrice(estimatedCost)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Based on your selected options</p>
          </div>
        )}

        {/* Selected Options Summary */}
        {(includesFlights || includesHotel || includesCarRental) && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium mb-2">Your Selected Options:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {includesFlights && (
                <div className="flex items-center text-sm">
                  <div className="h-2 w-2 bg-travel-blue rounded-full mr-2"></div>
                  <span>Flight Booking</span>
                </div>
              )}
              {includesHotel && (
                <div className="flex items-center text-sm">
                  <div className="h-2 w-2 bg-travel-blue rounded-full mr-2"></div>
                  <span>Hotel Accommodation</span>
                </div>
              )}
              {includesCarRental && (
                <div className="flex items-center text-sm">
                  <div className="h-2 w-2 bg-travel-blue rounded-full mr-2"></div>
                  <span>Car Rental</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <Label className="text-sm font-medium mb-3 block">
            Interests
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {interestOptions.map((interest) => (
              <div key={interest.value} className="flex items-center space-x-2">
                <Checkbox 
                  id={interest.value} 
                  checked={selectedInterests.includes(interest.value)}
                  onCheckedChange={(checked) => handleInterestChange(interest.value, checked as boolean)}
                />
                <Label htmlFor={interest.value} className="text-sm cursor-pointer">
                  {interest.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="additionalPreferences" className="text-sm font-medium mb-1.5 block">
            Additional Preferences (optional)
          </Label>
          <Input
            id="additionalPreferences"
            placeholder="Tell us more about what you'd like to do on this trip..."
            value={additionalPreferences}
            onChange={(e) => setAdditionalPreferences(e.target.value)}
            className="h-20"
          />
        </div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button 
            onClick={handleGeneratePlan} 
            className="w-full button-travel py-6"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Trip Plan...
              </>
            ) : (
              <>
                <PlaneLanding className="mr-2 h-5 w-5" />
                Generate Trip Plan
              </>
            )}
          </Button>
        </motion.div>
        
        {/* Chatbot Trigger */}
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600 mb-2">Need more personalized assistance?</p>
          <button
            type="button"
            onClick={() => document.dispatchEvent(new CustomEvent('toggleChatbot'))}
            className="text-sm text-travel-blue hover:text-travel-blue-dark underline"
          >
            Chat with our AI travel assistant
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripPlanner;
