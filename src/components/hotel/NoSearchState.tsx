
import { Hotel } from "lucide-react";

const NoSearchState = () => {
  return (
    <div className="text-center py-12">
      <div className="p-6 rounded-lg bg-travel-blue-bg border border-travel-blue-light">
        <Hotel className="mx-auto h-16 w-16 text-travel-blue mb-4" />
        <h3 className="text-xl font-semibold text-travel-blue-dark">Search for Hotels</h3>
        <p className="mt-2 text-travel-text-secondary">
          Enter your destination, dates, and number of guests to find available hotels.
        </p>
      </div>
    </div>
  );
};

export default NoSearchState;
