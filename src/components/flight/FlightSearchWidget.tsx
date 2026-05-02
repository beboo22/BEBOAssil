
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface FlightSearchWidgetProps {
  departure?: string;
  destination?: string;
  departureCode?: string;
  arrivalCode?: string;
  departDate?: Date | null;
  returnDate?: Date | null;
  travelers?: number;
}

const FlightSearchWidget = ({ 
  departureCode: propDepartureCode, 
  arrivalCode: propArrivalCode,
  departure: propDeparture,
  destination: propDestination,
  departDate,
  returnDate,
  travelers
}: FlightSearchWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const departure = propDepartureCode || propDeparture || "";
  const destination = propArrivalCode || propDestination || "";
  
  // Function to extract IATA code from city string
  const extractIataCode = (cityString: string): string => {
    if (!cityString) return "";
    
    // If it's already a 3-letter code, return it
    if (/^[A-Z]{3}$/.test(cityString.trim())) {
      return cityString.trim();
    }
    
    // Try to extract a 3-letter code if it's in parentheses like "City (ABC)"
    const codeMatch = cityString.match(/\(([A-Z]{3})\)/);
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1];
    }
    
    // Default fallback codes
    if (cityString.includes("Jeddah")) return "JED";
    if (cityString.includes("Abu Dhabi")) return "AUH";
    if (cityString.includes("Dubai")) return "DXB";
    if (cityString.includes("Riyadh")) return "RUH";
    if (cityString.includes("London")) return "LON";
    if (cityString.includes("New York")) return "NYC";
    if (cityString.includes("Tokyo")) return "TYO";
    if (cityString.includes("Paris")) return "PAR";
    
    // If no match, return first part of the city name
    return cityString.split(',')[0].trim();
  };
  
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
    
    // Extract airport codes from city names
    let departureCode = "JED"; // Default departure
    let destinationCode = "AUH"; // Default destination
    
    if (departure) {
      departureCode = extractIataCode(departure);
    }
    
    if (destination) {
      destinationCode = extractIataCode(destination);
    }
    
    console.log("Using codes for search widget:", departureCode, destinationCode);
    
    // Create and append the new script
    const script = document.createElement('script');
    script.async = true;
    script.charset = "utf-8";
    
    // Basic script URL
    const trs = import.meta.env.VITE_TRAVELPAYOUTS_TRS || "477988";
    const shmarker = import.meta.env.VITE_TRAVELPAYOUTS_SHMARKER || "688262";
    
    let scriptSrc = `https://tp.media/content?currency=usd&trs=${trs}&shmarker=${shmarker}&color_button=%2300A991&target_host=www.aviasales.com%2Fsearch&locale=en&powered_by=true&with_fallback=true&non_direct_flights=false&min_lines=10&border_radius=8&color_background=%23FFFFFF&color_text=%23000000&color_border=%23E5E7EB&promo_id=2811&campaign_id=100&booking=true&direct_booking=true`;
    
    // Add origin and destination
    scriptSrc += `&origin=${encodeURIComponent(departureCode)}`;
    scriptSrc += `&destination=${encodeURIComponent(destinationCode)}`;
    
    // Add date parameters if available
    if (departDate) {
      const formattedDepartDate = departDate.toISOString().split('T')[0];
      scriptSrc += `&departure_date=${formattedDepartDate}`;
    }
    
    if (returnDate) {
      const formattedReturnDate = returnDate.toISOString().split('T')[0];
      scriptSrc += `&return_date=${formattedReturnDate}`;
    }
    
    // Add travelers if available
    if (travelers) {
      scriptSrc += `&adults=${travelers}`;
    }
    
    script.src = scriptSrc;
    
    // Listen for script load completion
    script.onload = () => {
      setIsLoading(false);
      console.log("Flight search widget loaded successfully");
    };
    
    // Handle errors
    script.onerror = (e) => {
      console.error("Failed to load flight search widget:", e);
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
  }, [departure, destination, departDate, returnDate, travelers]);
  
  // Also listen for flightSearch events to refresh the widget
  useEffect(() => {
    const handleFlightSearchEvent = (event: any) => {
      console.log("Flight search event detected in widget:", event.detail);
      
      // The widget will be updated by the main component props changes
      // This listener is just for logging purposes
    };
    
    document.addEventListener("flightSearch", handleFlightSearchEvent);
    
    return () => {
      document.removeEventListener("flightSearch", handleFlightSearchEvent);
    };
  }, []);
  
  return (
    <Card className="mt-8 p-6 bg-white shadow-sm rounded-2xl border-gray-100">
      <h2 className="text-xl font-bold mb-6 text-gray-900">نتائج البحث المباشرة</h2>
      <div 
        ref={containerRef} 
        className="w-full min-h-[500px] border border-gray-50 rounded-xl overflow-hidden"
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-[500px] bg-gray-50/50">
            <Loader2 className="h-10 w-10 animate-spin text-[#00A991] mb-4" />
            <span className="text-gray-500 font-medium">جاري جلب أفضل العروض لموقعك...</span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default FlightSearchWidget;
