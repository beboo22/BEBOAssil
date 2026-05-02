
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Loader2, Hotel } from "lucide-react";
import HotelCard, { HotelCardSkeleton } from "@/components/HotelCard";
import { HotelResult } from "@/services/api/types";

interface HotelSearchResultsProps {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hotels: HotelResult[] | undefined;
  location: string;
  checkIn: Date | undefined;
  checkOut: Date | undefined;
  guests: number;
  isSearching: boolean;
  onClearSearch: () => void;
  onRefetch: () => void;
}

const HotelSearchResults = ({
  isLoading,
  isError,
  error,
  hotels,
  location,
  checkIn,
  checkOut,
  guests,
  isSearching,
  onClearSearch,
  onRefetch
}: HotelSearchResultsProps) => {
  if (!isSearching) {
    return null;
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Hotels in <span className="text-[#22C55E]">{location}</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {hotels?.length || 0} premium options available for your stay
          </p>
        </div>
        <div className="text-xs font-bold text-gray-400 bg-gray-800/50 px-3 py-2 rounded-lg border border-gray-700/50">
          {checkIn && checkOut && (
            <span className="flex items-center gap-2">
              <span className="text-white">{format(checkIn, "MMM d")} - {format(checkOut, "MMM d")}</span>
              <span className="w-1 h-1 bg-gray-600 rounded-full" />
              <span>{guests} Guest{guests !== 1 ? 's' : ''}</span>
            </span>
          )}
        </div>
      </div>
      
      {renderResults()}
    </div>
  );

  function renderResults() {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {Array.from({ length: 6 }).map((_, index) => (
            <HotelCardSkeleton key={index} />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="text-center py-12">
          <p className="text-lg text-red-500">Error loading hotels. Please try again.</p>
          <p className="text-sm text-gray-500 mt-2">{error?.message}</p>
          <Button 
            onClick={onRefetch} 
            className="mt-4"
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      );
    }

    if (!hotels || hotels.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="p-6 rounded-lg bg-travel-blue-bg border border-travel-blue-light">
            <Hotel className="mx-auto h-16 w-16 text-travel-blue mb-4" />
            <h3 className="text-xl font-semibold text-travel-blue-dark">No Hotels Found</h3>
            <p className="mt-2 text-travel-text-secondary">
              We couldn't find any hotels for your search criteria. Try different dates or location.
            </p>
            <Button 
              onClick={onClearSearch} 
              className="mt-4"
              variant="outline"
            >
              Clear Search
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {hotels.map((hotel: HotelResult) => (
          <HotelCard key={hotel.id} hotel={hotel} />
        ))}
      </div>
    );
  }
};

export default HotelSearchResults;
