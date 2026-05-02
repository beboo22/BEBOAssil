
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Hotel } from "lucide-react";

interface HotelSearchWidgetProps {
  location?: string;
  checkIn?: Date;
  checkOut?: Date;
  guests?: number;
}

const HotelSearchWidget = ({ 
  location, 
  checkIn,
  checkOut,
  guests
}: HotelSearchWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Update script whenever search parameters change
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
    
    // Hotellook search results widget URL - Campaign 121 is Hotellook/Aviasales
    let scriptSrc = `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${shmarker}&locale=en&powered_by=true&show_logo=false&limit=10&bg_color=%23FFFFFF&font_color=%231F2937&stars_color=%23E5E7EB&stars_active_color=%23FACC15&dots_color=%23D1D5DB&loader_color=%2300A991&arrows_color=%2300A991&autoscroll=false&autoscroll_delay=5000&promo_id=hotel_search_results&campaign_id=121&search_ready=true`;
    
    // Add location if available
    if (location) {
      scriptSrc += `&destination=${encodeURIComponent(location)}`;
    }
    
    // Add date parameters if available
    if (checkIn) {
      const formattedCheckIn = checkIn.toISOString().split('T')[0];
      scriptSrc += `&check_in=${formattedCheckIn}`;
    }
    
    if (checkOut) {
      const formattedCheckOut = checkOut.toISOString().split('T')[0];
      scriptSrc += `&check_out=${formattedCheckOut}`;
    }
    
    // Add adults if available
    if (guests) {
      scriptSrc += `&adults=${guests}`;
    }
    
    script.src = scriptSrc;
    
    // Listen for script load completion
    script.onload = () => {
      setIsLoading(false);
    };
    
    // Handle errors
    script.onerror = (e) => {
      console.error("Failed to load hotel search widget:", e);
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
  }, [location, checkIn, checkOut, guests]);
  
  return (
    <Card className="mt-8 p-6 bg-[#111827] border-gray-800 shadow-2xl rounded-2xl">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
        <Hotel className="text-[#22C55E]" size={20} />
        <h2 className="text-xl font-black text-white">Live Hotel Deals</h2>
      </div>
      <div 
        ref={containerRef} 
        className="w-full min-h-[600px] bg-[#111827] rounded-xl overflow-hidden"
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-[500px] gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-[#22C55E]" />
            <span className="text-gray-400 font-medium">Bargain hunting in {location}...</span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default HotelSearchWidget;
