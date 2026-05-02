
import React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import CitySearch from "@/components/CitySearch";
import TransportationOptions from "@/components/TransportationOptions";

interface TransportationTabProps {
  departure: string;
  destination: string;
  setDeparture: (city: string) => void;
  setDestination: (city: string) => void;
}

const TransportationTab = ({ 
  departure, 
  destination, 
  setDeparture, 
  setDestination 
}: TransportationTabProps) => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Compare Local Transportation Options</h2>
        <div className="mb-4">
          <Label className="block text-sm font-medium mb-1">Travel Route</Label>
          <CitySearch
            combined={true}
            departureValue={departure}
            destinationValue={destination}
            onDepartureSelect={(city) => setDeparture(city)}
            onDestinationSelect={(city) => setDestination(city)}
            onSelect={() => {}} // Required by interface but unused in combined mode
          />
        </div>
        
        <div className="mt-6">
          <TransportationOptions 
            origin={departure}
            destination={destination}
            distance={10} // Default distance for demo
          />
        </div>
      </Card>
    </div>
  );
};

export default TransportationTab;
