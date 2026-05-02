
import { useState } from 'react';

export interface PlanningOptions {
  itinerary: boolean;
  flight: boolean;
  carRental: boolean;
  personalCar: boolean;
  hotel: boolean;
}

export interface MealPreferences {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  snacks: boolean;
  budgetPerMeal: 'budget' | 'moderate' | 'premium';
  cuisineTypes?: string[];
}

export type QuickTripType = 'short' | 'weekend' | 'in-city' | 'nearby' | 'random' | 'free';

export const usePlanningOptions = () => {
  const [options, setOptions] = useState<PlanningOptions>({
    itinerary: true,
    flight: false,
    carRental: false,
    personalCar: false,
    hotel: false
  });
  
  const [departureCity, setDepartureCity] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [carType, setCarType] = useState('');
  const [hotelCategory, setHotelCategory] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [duration, setDuration] = useState(3);
  const [totalBudget, setTotalBudget] = useState(0);
  
  const [mealPreferences, setMealPreferences] = useState<MealPreferences>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snacks: false,
    budgetPerMeal: 'moderate',
  });

  const [quickTripType, setQuickTripType] = useState<QuickTripType | null>(null);

  const [costBreakdown, setCostBreakdown] = useState({
    flights: 0,
    hotels: 0,
    meals: 0,
    activities: 0,
    carRental: 0,
  });
  
  const isItineraryOnly = options.itinerary && !options.flight && !options.carRental && !options.hotel && !options.personalCar;
  
  const toggleOption = (option: keyof PlanningOptions) => {
    setOptions(prev => {
      if (option === 'itinerary') {
        if (prev.itinerary && !prev.flight && !prev.carRental && !prev.hotel && !prev.personalCar) {
          return prev;
        }
      }
      
      const newOptions = { ...prev, [option]: !prev[option] };
      
      if (option === 'personalCar' && !prev.personalCar) {
        newOptions.flight = false;
      }
      if (option === 'flight' && !prev.flight) {
        newOptions.personalCar = false;
      }
      
      if (option === 'flight' && options.flight) setDepartureCity('');
      if (option === 'carRental' && options.carRental) setCarType('');
      if (option === 'hotel' && options.hotel) setHotelCategory('');
      
      // Update cost breakdown
      const costMap: Record<string, { key: keyof typeof costBreakdown; amount: number }> = {
        flight: { key: 'flights', amount: 300 },
        carRental: { key: 'carRental', amount: 150 },
        hotel: { key: 'hotels', amount: 200 * duration },
        personalCar: { key: 'carRental', amount: 50 },
      };
      
      const mapping = costMap[option];
      if (mapping) {
        setCostBreakdown(prev => ({
          ...prev,
          [mapping.key]: !options[option] ? mapping.amount : 0,
        }));
      }
      
      return newOptions;
    });
  };

  const updateMealPreferences = (prefs: MealPreferences) => {
    setMealPreferences(prefs);
    // Recalculate meal costs
    const MEAL_COSTS: Record<string, Record<string, number>> = {
      budget: { breakfast: 5, lunch: 8, dinner: 12, snacks: 3 },
      moderate: { breakfast: 12, lunch: 20, dinner: 35, snacks: 8 },
      premium: { breakfast: 25, lunch: 45, dinner: 80, snacks: 15 },
    };
    const costs = MEAL_COSTS[prefs.budgetPerMeal];
    let dailyCost = 0;
    if (prefs.breakfast) dailyCost += costs.breakfast;
    if (prefs.lunch) dailyCost += costs.lunch;
    if (prefs.dinner) dailyCost += costs.dinner;
    if (prefs.snacks) dailyCost += costs.snacks;
    setCostBreakdown(prev => ({ ...prev, meals: dailyCost * duration }));
  };

  const handleQuickTripSelect = (type: QuickTripType | null) => {
    setQuickTripType(type);
    if (type) {
      const durationMap: Record<QuickTripType, number> = {
        short: 2, weekend: 3, 'in-city': 1, nearby: 2, random: 3, free: 1,
      };
      setDuration(durationMap[type]);
      
      if (type === 'free') {
        setTotalBudget(0);
        setCostBreakdown({ flights: 0, hotels: 0, meals: 0, activities: 0, carRental: 0 });
      }
    }
  };

  // Computed total
  const computedTotalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const addToTotalCost = (additionalCost: number) => {
    setCostBreakdown(prev => ({ ...prev, activities: prev.activities + additionalCost }));
  };

  return {
    options,
    departureCity,
    setDepartureCity,
    destinationCity,
    setDestinationCity,
    carType,
    setCarType,
    hotelCategory,
    setHotelCategory,
    totalCost: computedTotalCost,
    setTotalCost,
    addToTotalCost,
    toggleOption,
    isItineraryOnly,
    duration,
    setDuration,
    totalBudget,
    setTotalBudget,
    mealPreferences,
    updateMealPreferences,
    quickTripType,
    handleQuickTripSelect,
    costBreakdown,
  };
};
