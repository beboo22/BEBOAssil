
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, MapPin, Search, Users, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import CitySearch from "@/components/CitySearch";
import { useToast } from "@/hooks/use-toast";
import CurrencySelector from "@/components/CurrencySelector";

interface HotelSearchFormProps {
  onSearch: (params: {
    location: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    currency: string;
  }) => void;
  isLoading: boolean;
}

const HotelSearchForm = ({ onSearch, isLoading }: HotelSearchFormProps) => {
  const { toast } = useToast();
  const [location, setLocation] = useState("");
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guests, setGuests] = useState(2);
  const [currency, setCurrency] = useState("USD");

  const handleSearch = () => {
    if (!location) {
      toast({
        title: "Error",
        description: "Please enter a destination",
        variant: "destructive",
      });
      return;
    }

    if (!checkIn || !checkOut) {
      toast({
        title: "Error",
        description: "Please select check-in and check-out dates",
        variant: "destructive",
      });
      return;
    }

    // Format dates for API - YYYY-MM-DD format
    const formattedCheckIn = format(checkIn, 'yyyy-MM-dd');
    const formattedCheckOut = format(checkOut, 'yyyy-MM-dd');
    
    onSearch({
      location,
      checkIn: formattedCheckIn,
      checkOut: formattedCheckOut,
      guests,
      currency
    });
  };

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <Label htmlFor="location">Destination</Label>
            <CitySearch
              onSelect={(city) => setLocation(city)}
              placeholder="Where are you going?"
              initialValue={location}
            />
          </div>
          
          <div>
            <Label>Check-in Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !checkIn && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkIn ? format(checkIn, "PPP") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkIn}
                  onSelect={setCheckIn}
                  initialFocus
                  disabled={(date) => date < new Date()}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <Label>Check-out Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !checkOut && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkOut ? format(checkOut, "PPP") : <span>Select date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkOut}
                  onSelect={setCheckOut}
                  initialFocus
                  disabled={(date) => !checkIn || date <= checkIn || date < new Date()}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <Label htmlFor="guests">Guests</Label>
            <div className="flex items-center">
              <Users className="mr-2 h-4 w-4 text-travel-text-secondary" />
              <Input
                id="guests"
                type="number"
                min="1"
                max="10"
                value={guests}
                onChange={(e) => setGuests(parseInt(e.target.value) || 1)}
                className="w-full"
              />
            </div>
          </div>
          
          <div>
            <Label>Currency</Label>
            <CurrencySelector 
              value={currency} 
              onChange={(value) => setCurrency(value)}
            />
          </div>
        </div>
        
        <Button 
          className="mt-4 w-full md:w-auto" 
          onClick={handleSearch}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Search className="mr-2 h-4 w-4" />
          Search Hotels
        </Button>
      </CardContent>
    </Card>
  );
};

export default HotelSearchForm;
