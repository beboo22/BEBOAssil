
import { useEffect } from "react";
import TripSearch from "@/components/TripSearch";
import SearchStatus from "@/components/flight/SearchStatus";
import SelectedBookings from "@/components/SelectedBookings";
import { useFlightSearch } from "@/hooks/useFlightSearch";
import FlightSearchWidget from "@/components/flight/FlightSearchWidget";

interface FlightSearchProps {
  departure: string;
  destination: string;
  departDate: Date | undefined;
  returnDate: Date | undefined;
  travelers: number;
  setDeparture: (city: string) => void;
  setDestination: (city: string) => void;
}

const FlightSearch = ({
  departure,
  destination,
  departDate,
  returnDate,
  travelers,
  setDeparture,
  setDestination
}: FlightSearchProps) => {
  const {
    flightData,
    isLoading,
    isSearching,
    selectedFlight,
    handleSearch,
    handleSelectFlight
  } = useFlightSearch(departure, destination, departDate, returnDate, travelers);

  // Listen for flight search events from TripSearch component
  useEffect(() => {
    const handleFlightSearchEvent = (event: any) => {
      const { departure: newDeparture, destination: newDestination, departDate, returnDate, travelers } = event.detail;
      
      // Update parent component state
      setDeparture(newDeparture);
      setDestination(newDestination);
      
      // Trigger the flight search
      setTimeout(() => {
        handleSearch();
      }, 100);
    };
    
    document.addEventListener("flightSearch", handleFlightSearchEvent);
    
    return () => {
      document.removeEventListener("flightSearch", handleFlightSearchEvent);
    };
  }, [setDeparture, setDestination, handleSearch]);

  // Log current search parameters for debugging
  useEffect(() => {
    console.log("Current search parameters:", { departure, destination, departDate, returnDate });
  }, [departure, destination, departDate, returnDate]);

  return (
    <>
      <TripSearch />
      
      {/* Show the FlightSearchWidget with current departure and destination */}
      <FlightSearchWidget 
        departure={departure} 
        destination={destination}
        departDate={departDate}
        returnDate={returnDate}
        travelers={travelers}
      />
      
      <SearchStatus 
        isSearching={isSearching || (flightData?.flights?.length > 0)}
        isLoading={isLoading}
        flights={flightData?.flights || []}
        departure={departure}
        destination={destination}
        onSelectFlight={handleSelectFlight}
      />
      
      {selectedFlight && (
        <SelectedBookings selectedFlight={selectedFlight} />
      )}
    </>
  );
};

export default FlightSearch;
