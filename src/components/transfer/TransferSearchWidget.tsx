
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Bus } from "lucide-react";

interface TransferSearchWidgetProps {
  from?: string;
  to?: string;
  date?: Date;
}

const TransferSearchWidget = ({ 
  from, 
  to,
  date
}: TransferSearchWidgetProps) => {
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
    
    // Kiwitaxi content widget URL - Applied light theme parameters
    let scriptSrc = `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${shmarker}&locale=en&powered_by=true&transfer_options_limit=10&transfer_options=MCR&disable_currency_selector=true&hide_form_extras=true&hide_external_links=true&bg_color=%23FFFFFF&button_color=%2300A991&button_font_color=%23ffffff&campaign_id=1&promo_id=3879`;
    
    // Add parameters if available
    if (from) {
      scriptSrc += `&from_name=${encodeURIComponent(from)}`;
    }
    
    if (to) {
      scriptSrc += `&to_name=${encodeURIComponent(to)}`;
    }
    
    if (date) {
      const formattedDate = date.toISOString().split('T')[0];
      scriptSrc += `&pickup_date=${formattedDate}`;
    }
    
    script.src = scriptSrc;
    
    // Listen for script load completion
    script.onload = () => {
      setIsLoading(false);
    };
    
    // Handle errors
    script.onerror = (e) => {
      console.error("Failed to load transfer search widget:", e);
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
  }, [from, to, date]);
  
  return (
    <Card className="mt-8 p-6 bg-white border-gray-200 shadow-xl rounded-2xl">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
        <Bus className="text-[#00A991]" size={20} />
        <h2 className="text-xl font-bold text-gray-900">نتائج خدمات النقل</h2>
      </div>
      <div 
        ref={containerRef} 
        className="w-full min-h-[500px] bg-white rounded-xl overflow-hidden"
      >
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-[500px] gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-[#00A991]" />
            <span className="text-gray-500 font-medium">جاري البحث عن خدمات نقل من {from}...</span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TransferSearchWidget;
