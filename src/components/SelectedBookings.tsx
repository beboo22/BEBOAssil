
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plane, Hotel, Car, ExternalLink, Loader2 } from "lucide-react";
import { FlightResult, HotelResult } from "@/services/apiService";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";

interface SelectedBookingsProps {
  selectedFlight: FlightResult | null;
  selectedHotel?: HotelResult | null;
  selectedCar?: any | null;
}

const SelectedBookings = ({ selectedFlight, selectedHotel, selectedCar }: SelectedBookingsProps) => {
  const [isBooking, setIsBooking] = useState(false);
  const { formatPrice, convertPrice } = useCurrency();
  const handleBookingRequest = () => {
    setIsBooking(true);
    // Simulate API call delay
    setTimeout(() => {
      setIsBooking(false);
      // Display confirmation links (these would normally be returned from an API)
      const flightLink = selectedFlight?.airline ? `https://www.${selectedFlight.airline.toLowerCase()}.com/booking` : "https://www.amadeus.com/en/portfolio/airlines/flight-api";
      const hotelLink = selectedHotel?.url || "https://developers.booking.com/api/index.html";
      const carLink = selectedCar?.url || "https://rapidapi.com/collection/car-rental-apis";
      
      // Open in new window/tab
      window.open(flightLink, '_blank');
      
      // Show success toast
      toast.success("Booking initiated! Redirecting to airline website.", {
        duration: 5000,
      });
    }, 1500);
  };
  
  if (!selectedFlight && !selectedHotel && !selectedCar) {
    return null;
  }
  
  return (
    <Card className="mt-6 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Your Selected Travel Items</CardTitle>
      </CardHeader>
      <CardContent>
        {selectedFlight && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Plane className="h-5 w-5 text-travel-blue" />
              <h3 className="font-semibold">Selected Flight</h3>
            </div>
            <div className="bg-blue-50 p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Airline:</span>
                <span className="font-medium">{selectedFlight.airline}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Flight Number:</span>
                <span className="font-medium">{selectedFlight.flight_number}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Departure:</span>
                <span className="font-medium">{selectedFlight.departure_time}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Arrival:</span>
                <span className="font-medium">{selectedFlight.arrival_time}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Price:</span>
                <span className="font-semibold text-travel-blue-dark">{formatPrice(selectedFlight.price)}</span>
              </div>
            </div>
          </div>
        )}
        
        {selectedHotel && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Hotel className="h-5 w-5 text-travel-blue" />
              <h3 className="font-semibold">Selected Hotel</h3>
            </div>
            <div className="bg-blue-50 p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Hotel:</span>
                <span className="font-medium">{selectedHotel.name}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Location:</span>
                <span className="font-medium">{selectedHotel.location}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Price:</span>
                <span className="font-semibold text-travel-blue-dark">
                  {formatPrice(selectedHotel.price, selectedHotel.currency || 'USD')}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {selectedCar && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Car className="h-5 w-5 text-travel-blue" />
              <h3 className="font-semibold">Selected Car</h3>
            </div>
            <div className="bg-blue-50 p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Model:</span>
                <span className="font-medium">{selectedCar.model}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Price:</span>
                <span className="font-semibold text-travel-blue-dark">{formatPrice(selectedCar.price, selectedCar.currency || 'USD')}</span>
              </div>
            </div>
          </div>
        )}
        
        <Separator className="my-4" />
        
        <div className="flex justify-between items-center">
          <div>
            <p className="text-lg font-bold">
              {"Total: "}
              {formatPrice(
                convertPrice(selectedFlight?.price || 0) + 
                convertPrice(selectedHotel?.price || 0, selectedHotel?.currency || 'USD') + 
                convertPrice(selectedCar?.price || 0, selectedCar?.currency || 'USD')
              )}
            </p>
            <p className="text-xs text-gray-500">*Taxes and fees may apply</p>
          </div>
          
          <Button 
            onClick={handleBookingRequest} 
            disabled={isBooking}
            className="bg-green-600 hover:bg-green-700"
          >
            {isBooking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Complete Booking
              </>
            )}
          </Button>
        </div>
        
        <div className="mt-4 text-sm text-gray-500">
          Clicking "Complete Booking" will redirect you to the partner websites to finalize your reservation.
        </div>
      </CardContent>
    </Card>
  );
};

export default SelectedBookings;
