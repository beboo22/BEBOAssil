
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { FlightResult } from "@/services/apiService";
import FlightSearchResults from "@/components/FlightSearchResults";

interface SearchStatusProps {
  isSearching: boolean;
  isLoading: boolean;
  flights: FlightResult[];
  departure: string;
  destination: string;
  onSelectFlight: (flight: FlightResult) => void;
}

const SearchStatus = ({
  isSearching,
  isLoading,
  flights,
  departure,
  destination,
  onSelectFlight
}: SearchStatusProps) => {
  if (!isSearching && flights?.length === 0) {
    return null;
  }

  return (
    <Card className="mt-8 p-6 bg-white shadow-sm rounded-xl">
      <h2 className="text-xl font-bold mb-4">
        {isLoading ? (
          "Searching for flights..."
        ) : (
          `${flights?.length || 0} Flights from ${departure} to ${destination}`
        )}
      </h2>
      
      <FlightSearchResults 
        results={flights || []}
        isLoading={isLoading}
        departure={departure}
        destination={destination}
        onSelectFlight={onSelectFlight}
      />
    </Card>
  );
};

export default SearchStatus;
