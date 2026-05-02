
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plane, Clock, ArrowRight, Loader2 } from "lucide-react";
import { FlightResult } from "@/services/apiService";

interface FlightSearchResultsProps {
  results: FlightResult[];
  isLoading: boolean;
  departure: string;
  destination: string;
  onSelectFlight: (flight: FlightResult) => void;
}

const FlightSearchResults = ({ 
  results, 
  isLoading, 
  departure, 
  destination,
  onSelectFlight 
}: FlightSearchResultsProps) => {
  
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  
  // Handle flight selection
  const handleSelectFlight = (flight: FlightResult) => {
    setSelectedFlightId(flight.flight_number);
    onSelectFlight(flight);
    toast.success(`Flight ${flight.flight_number} selected!`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-travel-blue mr-2" />
        <span>Searching for the best flight options...</span>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No flights found for this route. Try different dates or cities.</p>
      </div>
    );
  }

  console.log("Rendering flight results:", results.length, "flights found");

  return (
    <div className="space-y-2">
      {results.map((flight, index) => (
        <Card 
          key={flight.flight_number || index}
          className={`border ${selectedFlightId === flight.flight_number ? 'border-primary shadow-md' : 'border-border'} rounded-lg p-1.5 sm:p-2 hover:shadow-sm transition-shadow`}
        >
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center min-w-0 shrink-0">
                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center mr-1.5">
                  <Plane className="h-3 w-3 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[10px] sm:text-xs truncate">{flight.airline}</h3>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">{flight.flight_number}</p>
                </div>
              </div>
              
              <div className="flex items-center flex-1 justify-center min-w-0 gap-1 sm:gap-2">
                <div className="text-center min-w-0">
                  <div className="text-xs sm:text-sm font-bold">{flight.departure_time}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate max-w-[50px] sm:max-w-[70px]">{departure.split(',')[0]}</div>
                </div>
                
                <div className="flex flex-col items-center min-w-0 px-0.5">
                  <div className="text-[9px] text-muted-foreground">{flight.duration}</div>
                  <div className="relative w-10 sm:w-16 md:w-20">
                    <div className="border-t border-border absolute w-full top-1/2"></div>
                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground absolute right-0 top-1/2 transform -translate-y-1/2" />
                  </div>
                  <div>
                    {flight.stops === 0 ? (
                      <Badge variant="outline" className="text-[8px] sm:text-[9px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200 dark:bg-green-950 dark:text-green-400">Nonstop</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px] sm:text-[9px] px-0.5 py-0 bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950 dark:text-amber-400">
                        {flight.stops} stop{flight.stops > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="text-center min-w-0">
                  <div className="text-xs sm:text-sm font-bold">{flight.arrival_time}</div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate max-w-[50px] sm:max-w-[70px]">{destination.split(',')[0]}</div>
                </div>
              </div>
              
              <div className="text-right shrink-0">
                <div className="text-sm sm:text-base font-bold text-primary">
                  ${flight.price}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground">per person</div>
                <Button 
                  size="sm"
                  className={`mt-0.5 h-6 text-[10px] px-1.5 sm:px-2 ${selectedFlightId === flight.flight_number ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => handleSelectFlight(flight)}
                >
                  {selectedFlightId === flight.flight_number ? '✓' : 'Select'}
                </Button>
              </div>
            </div>
            
            {flight.layovers && (
              <div className="mt-1.5 pt-1.5 border-t border-dashed border-border">
                <div className="flex items-center">
                  <Clock className="w-3 h-3 text-muted-foreground mr-1" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    Layover: {flight.layovers.join(", ")}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FlightSearchResults;
