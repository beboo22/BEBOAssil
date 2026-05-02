
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CitySearch from '../CitySearch';
import { PersonalCarOptions } from '@/components/travel/PersonalCarOptions';

interface PlanningFieldsProps {
  options: {
    flight: boolean;
    carRental: boolean;
    personalCar: boolean;
    hotel: boolean;
    itinerary: boolean;
  };
  departureCity: string;
  setDepartureCity: (city: string) => void;
  carType: string;
  setCarType: (type: string) => void;
  hotelCategory: string;
  setHotelCategory: (category: string) => void;
  destinationCity: string;
  setDestinationCity: (city: string) => void;
  addToTotalCost?: (cost: number) => void;
}

const PlanningFields = ({
  options,
  departureCity,
  setDepartureCity,
  carType,
  setCarType,
  hotelCategory,
  setHotelCategory,
  destinationCity,
  setDestinationCity,
  addToTotalCost
}: PlanningFieldsProps) => {
  const [cityPrice, setCityPrice] = useState('');
  
  const isItineraryOnly = options.itinerary && !options.flight && !options.carRental && !options.hotel && !options.personalCar;

  const handleAddPrice = () => {
    if (cityPrice && !isNaN(Number(cityPrice))) {
      addToTotalCost?.(Number(cityPrice));
      setCityPrice('');
    }
  };

  const popularDestinations = [
    '🇦🇪 Dubai, UAE', '🇹🇷 Istanbul, Turkey', '🇫🇷 Paris, France', '🇪🇬 Cairo, Egypt',
    '🇬🇧 London, UK', '🇪🇸 Barcelona, Spain', '🇯🇵 Tokyo, Japan', '🇮🇹 Rome, Italy',
    '🇹🇭 Bangkok, Thailand', '🇲🇦 Marrakech, Morocco', '🇬🇷 Athens, Greece', '🇸🇬 Singapore',
  ];

  return (
    <div className="grid gap-6 p-4 bg-muted/50 rounded-lg mb-6">
      {isItineraryOnly ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="destinationCity">Where do you want to go?</Label>
            <CitySearch
              onSelect={(city) => setDestinationCity(city)}
              placeholder="Enter your destination"
              initialValue={destinationCity}
            />
            {!destinationCity && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Popular destinations:</p>
                <div className="flex flex-wrap gap-1.5">
                  {popularDestinations.map(d => (
                    <button key={d} type="button" onClick={() => setDestinationCity(d.slice(4))}
                      className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <Label htmlFor="cityPrice">Budget Estimate (optional)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                <Input id="cityPrice" type="text" placeholder="Enter your budget" value={cityPrice} onChange={(e) => setCityPrice(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Button onClick={handleAddPrice} className="bg-primary hover:bg-primary/90 text-primary-foreground" type="button">Add to Total</Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <Label className="mb-2 block">Travel Route</Label>
            <CitySearch
              combined={true}
              departureValue={departureCity}
              destinationValue={destinationCity}
              onDepartureSelect={(city) => setDepartureCity(city)}
              onDestinationSelect={(city) => setDestinationCity(city)}
              onSelect={() => {}}
            />
          </div>
          
          {options.personalCar && (
            <PersonalCarOptions distance={500} destination={destinationCity} />
          )}
          
          {options.carRental && (
            <div>
              <Label htmlFor="carType">Car Type</Label>
              <Select value={carType} onValueChange={setCarType}>
                <SelectTrigger id="carType" className="mt-1"><SelectValue placeholder="Select car type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="midsize">Midsize</SelectItem>
                  <SelectItem value="suv">SUV</SelectItem>
                  <SelectItem value="luxury">Luxury</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {options.hotel && (
            <div>
              <Label htmlFor="hotelCategory">Hotel Category</Label>
              <Select value={hotelCategory} onValueChange={setHotelCategory}>
                <SelectTrigger id="hotelCategory" className="mt-1"><SelectValue placeholder="Select hotel category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="budget">Budget (1-2 stars)</SelectItem>
                  <SelectItem value="standard">Standard (3 stars)</SelectItem>
                  <SelectItem value="premium">Premium (4 stars)</SelectItem>
                  <SelectItem value="luxury">Luxury (5 stars)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PlanningFields;
