
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { searchFlights, FlightResult } from "@/services/apiService";

export function useFlightSearch(
  departure: string,
  destination: string,
  departDate: Date | undefined,
  returnDate: Date | undefined,
  travelers: number
) {
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["flights", departure, destination, departDate, returnDate, travelers],
    queryFn: async () => {
      if (!departure || !destination || !departDate) return null;
      
      const formattedDepartDate = departDate ? format(departDate, "yyyy-MM-dd") : '';
      const formattedReturnDate = returnDate ? format(returnDate, "yyyy-MM-dd") : undefined;
      
      console.log("Searching flights with formatted dates:", formattedDepartDate, formattedReturnDate);
      
      const data = await searchFlights({
        departure,
        destination,
        departDate: formattedDepartDate,
        returnDate: formattedReturnDate,
        adults: travelers
      });
      
      console.log("Flight search results:", data);
      return data;
    },
    enabled: false
  });

  // Handle flight search - make this a useCallback so it can be used in the dependency array
  const handleSearch = useCallback(() => {
    if (!departure) {
      toast.error("Please select a departure city");
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
    
    setIsSearching(true);
    console.log("Manual search triggered");
    refetch().finally(() => setIsSearching(false));
  }, [departure, destination, departDate, refetch]);

  // Auto-search when both cities are selected
  useEffect(() => {
    if (departure && destination && departDate) {
      console.log("Auto-searching flights with:", departure, destination, departDate);
      handleSearch();
    }
  }, [departure, destination, departDate, handleSearch]);

  const handleSelectFlight = (flight: FlightResult) => {
    setSelectedFlight(flight);
    console.log("Selected flight:", flight);
  };

  return {
    flightData: data,
    isLoading,
    isSearching,
    selectedFlight,
    handleSearch,
    handleSelectFlight
  };
}
