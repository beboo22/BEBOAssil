
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Car } from "lucide-react";

interface CarSearchWidgetProps {
  location?: string;
  pickupDate?: Date;
  returnDate?: Date;
}

const CarSearchWidget = ({ 
  location, 
  pickupDate,
  returnDate
}: CarSearchWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Show loading state
    setIsLoading(true);
    
    // Clear any existing scripts
    const existingScript = containerRef.current.querySelector('script');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Use environment variables for affiliate IDs
    const trs = import.meta.env.VITE_TRAVELPAYOUTS_TRS || "477988";
    const shmarker = import.meta.env.VITE_TRAVELPAYOUTS_SHMARKER || "688262";
    
    // Create and append the new script
    const script = document.createElement('script');
    script.async = true;
    script.charset = "utf-8";
    
    // DiscoverCars content widget URL - Using light theme parameters
    let scriptSrc = `https://tpscr.com/content?trs=${trs}&shmarker=${shmarker}&powered_by=true&lang=en&width=100&background=light&bg_color=%23FFFFFF&font_color=%231F2937&logo=false&header=true&gearbox=false&cars=true&border=false&footer=false&campaign_id=87&promo_id=4322`;
    
    // Add parameters if available
    if (location) {
      scriptSrc += `&pickup_location=${encodeURIComponent(location)}`;
    }
    
    if (pickupDate) {
      const formattedPickupDate = pickupDate.toISOString().split('T')[0];
      scriptSrc += `&pickup_date=${formattedPickupDate}`;
    }
    
    if (returnDate) {
      const formattedReturnDate = returnDate.toISOString().split('T')[0];
      scriptSrc += `&return_date=${formattedReturnDate}`;
    }
    
    script.src = scriptSrc;
    
    // Listen for script load completion
    script.onload = () => {
      setIsLoading(false);
    };
    
    // Handle errors
    script.onerror = (e) => {
      console.error("Failed to load car search widget:", e);
      setIsLoading(false);
    };
    
    containerRef.current.appendChild(script);
    
    return () => {
      if (containerRef.current) {
        const script = containerRef.current.querySelector('script');
        if (script) {
          script.remove();
        }
      }
    };
  }, [location, pickupDate, returnDate]);
  
  return (
    <Card className="mt-8 p-6 bg-white border-gray-200 shadow-xl rounded-2xl">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
        <Car className="text-[#00A991]" size={20} />
        <h2 className="text-xl font-bold text-gray-900">نتائج تأجير السيارات</h2>
      </div>
      <div 
        ref={containerRef} 
        className="w-full min-h-[500px] bg-white rounded-xl overflow-hidden"
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-[500px] gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-[#00A991]" />
            <span className="text-gray-500 font-medium">جاري البحث عن سيارات في {location}...</span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CarSearchWidget;
