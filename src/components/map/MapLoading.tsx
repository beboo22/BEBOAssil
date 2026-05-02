
import { Skeleton } from "@/components/ui/skeleton";

const MapLoading = () => {
  return (
    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
      <div className="text-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-travel-blue mx-auto mb-4"></div>
        <h3 className="text-xl font-semibold mb-2">Loading Map</h3>
        <p className="text-gray-500">
          Preparing the interactive map view...
        </p>
      </div>
    </div>
  );
};

export default MapLoading;
