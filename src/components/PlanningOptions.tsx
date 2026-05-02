
import { motion } from 'framer-motion';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plane, Car, Hotel, Loader2, Sparkles, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import OptionCard from './planning/OptionCard';
import PlanningFields from './planning/PlanningFields';
import BudgetBreakdown, { buildBudgetItems } from './planning/BudgetBreakdown';
import MealOptions from './planning/MealOptions';
import QuickTripTypes from './planning/QuickTripTypes';
import ChatbotTrigger from './planning/ChatbotTrigger';
import { usePlanningOptions } from './planning/usePlanningOptions';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';
import TripPlanner from './TripPlanner';
import BookingSelectionStep from './BookingSelectionStep';
import { supabase } from "@/integrations/supabase/client";
import { FlightResult, HotelResult, CarResult } from '@/services/api/travelpayoutsService';
import { getActivityImage, getActivityMapLink, normalizeWebsiteUrl } from '@/utils/activityHelpers';
import { buildBookingsRoute } from '@/utils/bookingsRouting';
import { enforceDailyItemLimit } from '@/utils/enforceDailyItemLimit';
import { getFriendlyGenerationError } from '@/lib/generationErrors';

const readFunctionErrorPayload = async (functionError: any): Promise<any | null> => {
  try {
    const response = functionError?.context;
    if (!response || typeof response.clone !== 'function') return null;
    const clone = response.clone();
    try {
      return await clone.json();
    } catch {
      const text = await clone.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }
  } catch {
    return null;
  }
};

interface PlanningOptionsProps {
  onPlanningComplete?: (params: any) => void;
}

const PlanningOptions = ({ onPlanningComplete }: PlanningOptionsProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { 
    options, departureCity, setDepartureCity, destinationCity, setDestinationCity,
    carType, setCarType, hotelCategory, setHotelCategory, totalCost, addToTotalCost,
    toggleOption, isItineraryOnly,
    duration, setDuration, totalBudget, setTotalBudget,
    mealPreferences, updateMealPreferences,
    quickTripType, handleQuickTripSelect,
    costBreakdown,
  } = usePlanningOptions();
  
  const { maxActivitiesPerDay, remainingActivities } = useSubscriptionLimits();
  const [showAdvancedPlanning, setShowAdvancedPlanning] = useState(false);
  const [tripPrompt, setTripPrompt] = useState('');
  const [isGeneratingFromPrompt, setIsGeneratingFromPrompt] = useState(false);
  const [isRecordingPrompt, setIsRecordingPrompt] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [pendingItinerary, setPendingItinerary] = useState<any>(null);
  const [showBookingSelection, setShowBookingSelection] = useState(false);

  const togglePromptRecording = () => {
    if (isRecordingPrompt) {
      recognitionRef.current?.stop();
      setIsRecordingPrompt(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('متصفحك لا يدعم التعرف على الصوت'); return; }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'ar-SA';
    let final = '';
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      setTripPrompt(final + interim);
    };
    recognition.onend = () => setIsRecordingPrompt(false);
    recognition.onerror = () => setIsRecordingPrompt(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecordingPrompt(true);
  };

  const getQuickTripPromptPrefix = () => {
    if (!quickTripType) return '';
    const prefixes: Record<string, string> = {
      short: 'Plan a short 1-2 day trip with light activities and simple meals.',
      weekend: 'Plan a weekend getaway (Friday-Sunday) with a mix of relaxation and exploration.',
      'in-city': 'Plan a day exploring within the city - cafes, parks, local events, hidden gems.',
      nearby: 'Find nearby destinations within 2-3 hours drive with interesting activities.',
      random: 'Surprise me with a random destination that fits the budget, with unique experiences.',
      free: 'Plan a trip focused on FREE activities only - parks, free museums, walking tours, public events.',
    };
    return prefixes[quickTripType] + ' ';
  };

  const handleGenerateFromPrompt = async () => {
    if (!tripPrompt.trim() && !quickTripType) {
      toast.error(t('chatbot.rephraseRequest'));
      return;
    }
    setIsGeneratingFromPrompt(true);
    toast.info(t('wizard.generatingTrip'));

    const mealInfo = [
      mealPreferences.breakfast && 'breakfast',
      mealPreferences.lunch && 'lunch', 
      mealPreferences.dinner && 'dinner',
      mealPreferences.snacks && 'snacks',
    ].filter(Boolean);

    // Build structured meal requirements with cuisine info
    const selectedCuisines = mealPreferences.cuisineTypes || [];
    const cuisineStr = selectedCuisines.length > 0 ? selectedCuisines.join(', ') : '';
    
    let mealPrompt = '';
    if (mealInfo.length > 0) {
      mealPrompt = `\n\nMANDATORY MEAL REQUIREMENTS (must include these meals EVERY day):\n`;
      mealInfo.forEach(meal => {
        mealPrompt += `- ${meal}\n`;
      });
      if (cuisineStr) {
        mealPrompt += `\nPreferred cuisines: ${cuisineStr}\nCRITICAL: Rotate between these cuisines daily. Day 1 use first cuisine, Day 2 use second, etc. Each day MUST use a DIFFERENT cuisine from the list.`;
      }
      mealPrompt += `\nMeal budget: ${mealPreferences.budgetPerMeal}`;
    }

    const budgetPrompt = totalBudget > 0 
      ? `Total budget: $${totalBudget}. Do NOT exceed this budget.`
      : '';

    try {
      const currentLang = document.documentElement.lang || navigator.language || 'en';
      const isArabic = currentLang.startsWith('ar');
      const languageInstruction = isArabic
        ? 'IMPORTANT: Generate ALL content in Arabic (العربية).'
        : `IMPORTANT: Generate ALL content in ${currentLang.split('-')[0]} language.`;

      const selectedMealsCount = [
        mealPreferences.breakfast,
        mealPreferences.lunch,
        mealPreferences.dinner,
        mealPreferences.snacks,
      ].filter(Boolean).length;
      const requestedTotalDailyItems = Math.max(1, Math.min(maxActivitiesPerDay, Math.max(4, selectedMealsCount + 1)));
      const requestedNonMealItems = Math.max(0, requestedTotalDailyItems - selectedMealsCount);

      const { data, error } = await supabase.functions.invoke('generate-trip', {
        body: {
          destination: destinationCity || 'auto-detect',
          departureCity: departureCity || undefined,
          duration: duration,
          travelers: 2,
          interests: mealPreferences.cuisineTypes || [],
          budget: totalBudget > 0 ? totalBudget.toString() : undefined,
          tripType: quickTripType || undefined,
          mealPreferences: {
            ...mealPreferences,
            cuisineTypes: selectedCuisines,
          },
          cuisineTypes: selectedCuisines.length > 0 ? selectedCuisines : undefined,
          additionalPreferences: `${languageInstruction} ${getQuickTripPromptPrefix()}USER PROMPT: ${tripPrompt}. ${mealPrompt} ${budgetPrompt}`.trim(),
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          activitiesPerDay: requestedNonMealItems,
          maxActivitiesPerDay: requestedTotalDailyItems,
          totalDailyItemsTarget: requestedTotalDailyItems,
          maxTotalActivitiesRemaining: remainingActivities,
          wantFlight: options.flight,
          wantHotel: options.hotel,
          lang: i18n.language || 'en',
        },
      });

      const errorPayload = error ? await readFunctionErrorPayload(error) : null;
      const responsePayload = data ?? errorPayload?.data ?? errorPayload;

      if (error && !Array.isArray(responsePayload?.days)) {
        throw new Error(getFriendlyGenerationError(responsePayload?.error || error.message, isArabic));
      }
      if (responsePayload?.error && !Array.isArray(responsePayload?.days)) {
        throw new Error(getFriendlyGenerationError(responsePayload.error, isArabic));
      }
      if (!Array.isArray(responsePayload?.days) || responsePayload.days.length === 0) {
        throw new Error(getFriendlyGenerationError(t('chatbot.sorryError'), isArabic));
      }

      const itineraryId = Math.random().toString(36).substring(2, 10);
      const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const dur = responsePayload.days?.length || duration;
      const endDate = new Date(startDate.getTime() + dur * 24 * 60 * 60 * 1000);

      const itineraryToSave = {
        id: itineraryId,
        destination: responsePayload.destination || destinationCity || 'AI Generated Trip',
        departureCity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        duration: dur,
        days: responsePayload.days.map((day: any) => ({
          date: day.date || new Date(startDate.getTime() + ((day.dayNumber || 1) - 1) * 24 * 60 * 60 * 1000).toISOString(),
          activities: day.activities.map((act: any) => ({
            id: act.id, title: act.name, description: act.description,
            startTime: act.time, endTime: act.time,
            address: act.address,
            place_id: act.place_id || act.placeId,
            googleMapsLink: act.googleMapsUrl || act.googleMapsLink || getActivityMapLink(act, responsePayload.destination || destinationCity),
            googleMapsUrl: act.googleMapsUrl || act.googleMapsLink,
            googleMapsCoordsUrl: act.googleMapsCoordsUrl,
            imageUrl: getActivityImage(act, responsePayload.destination || destinationCity),
            cost: act.cost, type: act.category, rating: act.rating,
            latitude: act.latitude, longitude: act.longitude, enriched: act.enriched,
            website: normalizeWebsiteUrl(act.website),
          })),
        })),
        estimatedTotalCost: responsePayload.estimatedTotalCost,
        tips: responsePayload.tips,
        aiGenerated: true,
        cities: responsePayload.cities,
        citiesVisited: responsePayload.citiesVisited,
        cityLegs: responsePayload.cityLegs,
        tripDetails: responsePayload.tripDetails,
        suggestedFlights: responsePayload.suggestedFlights,
        suggestedHotels: responsePayload.suggestedHotels,
        mealPreferences: mealPreferences,
        quickTripType: quickTripType,
        budgetBreakdown: costBreakdown,
        travelMetadata: responsePayload.travelMetadata,
        cityOverview: responsePayload.cityOverview,
        activitiesPerDay: requestedNonMealItems,
        maxActivitiesPerDay: requestedTotalDailyItems,
        totalDailyItemsTarget: requestedTotalDailyItems,
        wantFlight: options.flight,
        wantHotel: options.hotel,
        wantCar: options.carRental,
      };

      const enforced = enforceDailyItemLimit(itineraryToSave.days, requestedTotalDailyItems, mealPreferences);
      itineraryToSave.days = enforced.days;

      localStorage.setItem(`itinerary-${itineraryId}`, JSON.stringify(itineraryToSave));

      // If user wants flight, hotel, or car rental, use the same /bookings experience
      if (options.flight || options.hotel || options.carRental) {
        toast.success(t('booking.selectBookingsPrompt', { defaultValue: 'اختر حجوزاتك لإكمال الخطة' }));
        navigate(buildBookingsRoute({
          tab: options.flight ? 'flights' : options.hotel ? 'hotels' : 'cars',
          from: departureCity,
          to: itineraryToSave.destination,
          date: startDate,
          returnDate: endDate,
          guests: 2,
          itineraryId,
        }));
      } else {
        toast.success(t('wizard.tripGenerated'));
        navigate(`/itinerary/${itineraryId}`);
      }
    } catch (err: any) {
      console.error('Prompt generation error:', err);
      toast.error(err.message || t('chatbot.sorryError'));
    } finally {
      setIsGeneratingFromPrompt(false);
    }
  };

  // Handle booking selection and adjust itinerary timing
  const handleFlightSelected = (flight: FlightResult) => {
    if (!pendingItinerary) return;
    const arrivalTime = flight.departure_at ? new Date(flight.departure_at) : null;
    let arrivalHour = 10; // Default
    if (arrivalTime && flight.duration) {
      const departHour = arrivalTime.getHours();
      arrivalHour = (departHour + Math.floor(flight.duration / 60)) % 24;
    } else if (arrivalTime) {
      arrivalHour = arrivalTime.getHours();
    }

    // Adjust first day activities to start after flight arrival
    const updated = { ...pendingItinerary };
    if (updated.days?.[0]?.activities) {
      // Add flight arrival as first activity
      const flightActivity = {
        id: 'flight-arrival',
        title: `✈️ ${flight.airline} ${flight.flight_number || ''}`.trim(),
        description: `${t('booking.flightArrival', { defaultValue: 'الوصول بالطائرة' })} - $${flight.price}`,
        startTime: `${String(arrivalHour).padStart(2, '0')}:00`,
        endTime: `${String(arrivalHour + 1).padStart(2, '0')}:00`,
        type: 'transport',
        cost: flight.price,
        bookingLink: flight.link,
      };
      // Shift existing activities to start after arrival
      const shiftedActivities = updated.days[0].activities.map((act: any, idx: number) => ({
        ...act,
        startTime: `${String(Math.min(arrivalHour + 1 + idx * 2, 22)).padStart(2, '0')}:00`,
        endTime: `${String(Math.min(arrivalHour + 2 + idx * 2, 23)).padStart(2, '0')}:00`,
      }));
      updated.days[0].activities = [flightActivity, ...shiftedActivities];
    }
    updated.flightDetails = {
      departure: { ...flight, price: flight.price },
    };
    updated.estimatedFlightCost = flight.price;
    setPendingItinerary(updated);
  };

  const handleHotelSelected = (hotel: HotelResult) => {
    if (!pendingItinerary) return;
    const updated = { ...pendingItinerary };
    // Add hotel check-in to end of first day
    if (updated.days?.[0]?.activities) {
      const hotelActivity = {
        id: 'hotel-checkin',
        title: `🏨 ${hotel.hotelName}`,
        description: `${t('booking.hotelCheckIn', { defaultValue: 'تسجيل الوصول' })} - $${hotel.price}/${t('booking.night', { defaultValue: 'ليلة' })}`,
        startTime: '16:00',
        endTime: '17:00',
        type: 'hotel',
        cost: hotel.price,
        bookingLink: hotel.link,
        imageUrl: hotel.image,
      };
      updated.days[0].activities.push(hotelActivity);
    }
    updated.selectedHotel = hotel;
    updated.estimatedHotelCost = hotel.price * (updated.duration || 3);
    setPendingItinerary(updated);
  };

  const handleCarSelected = (car: CarResult) => {
    if (!pendingItinerary) return;
    const updated = { ...pendingItinerary };
    updated.selectedCar = car;
    updated.estimatedCarCost = car.price * (updated.duration || 3);
    setPendingItinerary(updated);
  };

  const handleBookingConfirmSkip = () => {
    if (!pendingItinerary) return;
    localStorage.setItem(`itinerary-${pendingItinerary.id}`, JSON.stringify(pendingItinerary));
    toast.success(t('wizard.tripGenerated'));
    navigate(`/itinerary/${pendingItinerary.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isItineraryOnly && options.flight && !departureCity) { toast.error(t('planning.enterDeparture')); return; }
    if (!destinationCity) { toast.error(t('planning.enterDestination')); return; }
    if (options.carRental && !carType) { toast.error(t('planning.selectCarType')); return; }
    if (options.hotel && !hotelCategory) { toast.error(t('planning.selectHotelCategory')); return; }
    
    const planningParams = {
      options, departureCity, destinationCity,
      carType: options.carRental ? carType : null,
      hotelCategory: options.hotel ? hotelCategory : null,
      estimatedCost: totalCost,
      duration,
      totalBudget,
      mealPreferences,
      quickTripType,
      costBreakdown,
    };
    sessionStorage.setItem('planningParams', JSON.stringify(planningParams));
    setShowAdvancedPlanning(true);
    if (onPlanningComplete) {
      toast.success(t('planning.planningOptionsSaved'));
      onPlanningComplete(planningParams);
    }
  };

  const budgetItems = buildBudgetItems(costBreakdown);

  if (showBookingSelection && pendingItinerary) {
    return (
      <BookingSelectionStep
        itinerary={pendingItinerary}
        wantFlight={options.flight}
        wantHotel={options.hotel}
        wantCar={options.carRental}
        onSelectFlight={handleFlightSelected}
        onSelectHotel={handleHotelSelected}
        onSelectCar={handleCarSelected}
        onSkip={handleBookingConfirmSkip}
      />
    );
  }

  return (
    <>
      {!showAdvancedPlanning ? (
        <motion.div id="planning-options" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glassmorphism rounded-xl p-4 sm:p-6 max-w-4xl mx-auto">
          {/* Quick Trip Types */}
          <div className="mb-6">
            <QuickTripTypes selected={quickTripType} onSelect={handleQuickTripSelect} />
          </div>

          {/* AI Prompt Section */}
          <div className="mb-6 p-4 sm:p-5 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-0">
                <Sparkles className="text-primary" size={20} />
                {t('planner.describeTrip')}
              </h3>
              {tripPrompt && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTripPrompt('')} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10">
                  {i18n.language?.startsWith('ar') ? 'تفريغ' : 'Clear'}
                </Button>
              )}
            </div>
            <Textarea
              value={tripPrompt}
              onChange={(e) => setTripPrompt(e.target.value)}
              placeholder={t('planner.describeTripPlaceholder')}
              className="min-h-[80px] mb-3 bg-background"
              disabled={isGeneratingFromPrompt}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isRecordingPrompt ? "destructive" : "outline"}
                size="icon"
                className={`shrink-0 ${isRecordingPrompt ? 'animate-pulse' : ''}`}
                onClick={togglePromptRecording}
                disabled={isGeneratingFromPrompt}
              >
                {isRecordingPrompt ? <MicOff size={16} /> : <Mic size={16} />}
              </Button>
              <Button 
                onClick={handleGenerateFromPrompt}
                disabled={isGeneratingFromPrompt || (!tripPrompt.trim() && !quickTripType)}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                {isGeneratingFromPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles size={16} />}
                {isGeneratingFromPrompt ? t('wizard.generating') : t('planner.generateFromPrompt')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">{t('planner.orFillManually')}</p>
          </div>

          <h2 className="text-xl font-bold mb-4 text-center text-foreground">{t('planning.customizePlanning')}</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
              <OptionCard icon={Check} title={t('planning.tripItineraryOnly')} description={t('planning.justPlanning')} isSelected={options.itinerary} onClick={() => toggleOption('itinerary')} />
              <OptionCard icon={Plane} title={t('planning.addFlight')} description={t('planning.includeFlightBooking')} isSelected={options.flight} onClick={() => toggleOption('flight')} />
              <OptionCard icon={Car} title={t('planning.personalCar', { defaultValue: 'Your Car' })} description={t('planning.personalCarDesc', { defaultValue: 'Drive your car' })} isSelected={options.personalCar} onClick={() => toggleOption('personalCar')} />
              <OptionCard icon={Car} title={t('planning.addCarRental')} description={t('planning.includeRentalCar')} isSelected={options.carRental} onClick={() => toggleOption('carRental')} />
              <OptionCard icon={Hotel} title={t('planning.addHotelBooking')} description={t('planning.includeAccommodation')} isSelected={options.hotel} onClick={() => toggleOption('hotel')} />
            </div>

            <PlanningFields options={options} departureCity={departureCity} setDepartureCity={setDepartureCity} destinationCity={destinationCity} setDestinationCity={setDestinationCity} carType={carType} setCarType={setCarType} hotelCategory={hotelCategory} setHotelCategory={setHotelCategory} addToTotalCost={addToTotalCost} />

            {/* Duration & Budget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground">
                  {t('planning.duration', { defaultValue: 'Duration (days)' })}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                  className="bg-background"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground">
                  {t('planning.totalBudget', { defaultValue: 'Total Budget ($)' })}
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={t('planning.budgetPlaceholder', { defaultValue: 'Optional - set your max budget' })}
                  value={totalBudget || ''}
                  onChange={(e) => setTotalBudget(parseInt(e.target.value) || 0)}
                  className="bg-background"
                />
              </div>
            </div>

            {/* Meal Options */}
            <div className="mb-4">
              <div className="flex items-center justify-end mb-2">
                {(mealPreferences.breakfast || mealPreferences.lunch || mealPreferences.dinner || mealPreferences.snacks || (mealPreferences.cuisineTypes?.length ?? 0) > 0) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => updateMealPreferences({ breakfast: false, lunch: false, dinner: false, snacks: false, budgetPerMeal: 'moderate', cuisineTypes: [] })} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10">
                    {i18n.language?.startsWith('ar') ? 'تفريغ الوجبات' : 'Clear meals'}
                  </Button>
                )}
              </div>
              <MealOptions
                preferences={mealPreferences}
                onChange={updateMealPreferences}
                duration={duration}
              />
            </div>

            {/* Budget Breakdown */}
            <div className="mb-6">
              <BudgetBreakdown items={budgetItems} totalBudget={totalBudget} />
            </div>

            <div className="text-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-2">{t('planning.createTravelPlan')}</Button>
            </div>
            <ChatbotTrigger isItineraryOnly={isItineraryOnly} />
          </form>
        </motion.div>
      ) : (
        <div className="mt-4">
        <TripPlanner initialPlanningParams={{ 
            options, departureCity, destinationCity, carType, hotelCategory, 
            estimatedCost: totalCost, duration, totalBudget, mealPreferences, quickTripType,
            interests: mealPreferences.cuisineTypes || [],
          }} />
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => setShowAdvancedPlanning(false)} className="text-primary hover:text-primary/80">{t('planner.goBackSimple')}</Button>
          </div>
        </div>
      )}
    </>
  );
};

export default PlanningOptions;
