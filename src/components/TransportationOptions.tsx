
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { compareTransportationOptions } from '@/services/apiService';
import { Loader2, Car, Bus, Train, CreditCard, Footprints } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface TransportationOptionsProps {
  origin: string;
  destination: string;
  distance?: number;
}

interface TransportOption {
  type: string;
  cost: number;
  duration: number;
  co2: number;
}

const getTransportIcon = (type: string, className: string = 'h-5 w-5') => {
  switch (type) {
    case 'car':
      return <Car className={className} />;
    case 'taxi':
      return <Car className={className} />;
    case 'uber':
      return <Car className={className} />;
    case 'bus':
      return <Bus className={className} />;
    case 'train':
      return <Train className={className} />;
    default:
      return <Footprints className={className} />;
  }
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
};

const TransportationOptions: React.FC<TransportationOptionsProps> = ({
  origin,
  destination,
  distance
}) => {
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      if (!origin || !destination) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const transportOptions = await compareTransportationOptions(origin, destination, distance);
        setOptions(transportOptions);
      } catch (err) {
        setError('Unable to fetch transportation options. Please try again later.');
        console.error('Error fetching transportation options:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptions();
  }, [origin, destination, distance]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-travel-blue mb-2" />
            <p>Loading transportation options...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (options.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500">
            Enter origin and destination to see transportation options.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Transportation Options</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {options.map((option, index) => (
            <div key={index} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-travel-blue-light bg-opacity-20 rounded-full mr-4">
                {getTransportIcon(option.type, 'h-6 w-6 text-travel-blue')}
              </div>
              
              <div className="flex-1">
                <h3 className="font-medium capitalize">{option.type}</h3>
                <div className="flex flex-wrap text-sm text-gray-500 gap-x-4">
                  <span className="flex items-center">
                    <Loader2 className="h-3 w-3 mr-1" />
                    {formatDuration(option.duration)}
                  </span>
                  <span className="flex items-center">
                    <Footprints className="h-3 w-3 mr-1" />
                    {option.co2} g CO₂
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-xl font-bold text-travel-blue-dark">${option.cost}</p>
                <p className="text-xs text-gray-500">per person</p>
              </div>
            </div>
          ))}
        </div>
        
        <Separator className="my-4" />
        
        <div className="text-sm text-gray-500 flex items-center">
          <CreditCard className="h-4 w-4 mr-2" />
          <span>Prices are estimates and may vary based on time and availability</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransportationOptions;
