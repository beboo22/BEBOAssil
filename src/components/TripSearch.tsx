import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Search, Users } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CitySearch from "./CitySearch";

type TripType = "oneWay" | "roundTrip" | "multiCity";

const TripSearch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tripType, setTripType] = useState<TripType>("roundTrip");
  const [startingPoint, setStartingPoint] = useState("");
  const [destination, setDestination] = useState("");
  const [departDate, setDepartDate] = useState<Date | undefined>();
  const [returnDate, setReturnDate] = useState<Date | undefined>();
  const [travelers, setTravelers] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isFlightPage = location.pathname === "/flights";

  const handleFlightSearch = () => {
    const flightSearchEvent = new CustomEvent("flightSearch", {
      detail: {
        departure: startingPoint,
        destination,
        departDate,
        returnDate,
        travelers
      }
    });
    
    document.dispatchEvent(flightSearchEvent);
    setIsSubmitting(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startingPoint) {
      toast.error("Please select a starting point");
      return;
    }
    
    if (!destination) {
      toast.error("Please select a destination");
      return;
    }
    
    if (!departDate) {
      toast.error("Please select a departure date");
      return;
    }
    
    if (tripType === "roundTrip" && !returnDate) {
      toast.error("Please select a return date");
      return;
    }

    setIsSubmitting(true);
    
    if (isFlightPage) {
      handleFlightSearch();
      return;
    }
    
    try {
      const itineraryId = Math.random().toString(36).substring(2, 10);
      
      let duration = 1;
      if (returnDate && departDate) {
        const diffTime = Math.abs(returnDate.getTime() - departDate.getTime());
        duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else {
        duration = 3;
      }

      const itineraryData = { 
        startingPoint,
        destination, 
        tripType, 
        startDate: departDate,
        returnDate, 
        travelers,
        duration
      };
      
      const initialItinerary = {
        id: itineraryId,
        destination,
        startDate: departDate.toISOString(),
        endDate: returnDate ? returnDate.toISOString() : 
                new Date(departDate.getTime() + (duration * 24 * 60 * 60 * 1000)).toISOString(),
        duration,
        days: []
      };
      
      localStorage.setItem(`itinerary-${itineraryId}`, JSON.stringify(initialItinerary));
      
      setTimeout(() => {
        navigate(`/itinerary/${itineraryId}`, { 
          state: itineraryData
        });
        setIsSubmitting(false);
      }, 800);
    } catch (error) {
      console.error("Error during search navigation:", error);
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glassmorphism rounded-2xl p-6 md:p-8 max-w-4xl mx-auto"
    >
      <form onSubmit={handleSearch} className="space-y-6">
        <RadioGroup
          defaultValue="roundTrip"
          className="flex flex-wrap gap-4"
          onValueChange={(value) => setTripType(value as TripType)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="oneWay" id="oneWay" />
            <Label htmlFor="oneWay" className="cursor-pointer">One Way</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="roundTrip" id="roundTrip" />
            <Label htmlFor="roundTrip" className="cursor-pointer">Round Trip</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="multiCity" id="multiCity" />
            <Label htmlFor="multiCity" className="cursor-pointer">Multi-City</Label>
          </div>
        </RadioGroup>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-2">
            <Label htmlFor="travelRoute" className="text-sm font-medium mb-1.5 block">
              Travel Route
            </Label>
            <CitySearch 
              combined={true}
              departureValue={startingPoint}
              destinationValue={destination}
              onDepartureSelect={(city) => setStartingPoint(city)}
              onDestinationSelect={(city) => setDestination(city)}
              onSelect={() => {}}
            />
          </div>

          <div>
            <Label htmlFor="departDate" className="text-sm font-medium mb-1.5 block">
              Depart Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !departDate && "text-muted-foreground",
                    departDate && "text-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {departDate ? format(departDate, "MMM dd, yyyy") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={departDate}
                  onSelect={setDepartDate}
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
                    !returnDate && "text-muted-foreground",
                    returnDate && "text-foreground"
                  )}
                  disabled={tripType === "oneWay"}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {returnDate ? format(returnDate, "MMM dd, yyyy") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={returnDate}
                  onSelect={setReturnDate}
                  initialFocus
                  disabled={(date) => 
                    date < new Date(new Date().setHours(0, 0, 0, 0)) || 
                    (departDate && date < departDate)
                  }
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <Label htmlFor="travelers" className="text-sm font-medium mb-1.5 block">
              Travelers
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
                className="pl-10 text-travel-black"
              />
            </div>
          </div>
          
          <div className="md:col-span-3">
            <Button 
              type="submit" 
              className="w-full button-travel py-6 mt-6 md:mt-0"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <div className="h-5 w-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                  Processing...
                </div>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  {isFlightPage ? "Search Flights" : "Plan My Trip"}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default TripSearch;
