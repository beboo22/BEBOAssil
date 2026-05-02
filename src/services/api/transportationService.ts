
import { TransportationCostParams } from './types';

// Calculate transportation costs based on type and distance
export const calculateTransportationCost = (params: TransportationCostParams): number => {
  const { transportType, distance = 0, fuelEfficiency = 7.5, fuelPrice = 1.5 } = params;
  
  // Default rates (USD)
  const rates = {
    car: (distance / 100) * fuelEfficiency * fuelPrice, // Cost based on fuel consumption
    taxi: 2.5 + (distance * 1.5), // Base fare + per km
    uber: 3.0 + (distance * 1.2), // Base fare + per km
    bus: 2.0 + (distance * 0.1), // Base fare + per km
    train: 5.0 + (distance * 0.2), // Base fare + per km
  };
  
  return parseFloat(rates[transportType].toFixed(2));
};

// Compare transportation options and return sorted by price
export const compareTransportationOptions = async (
  origin: string, 
  destination: string, 
  distance?: number
): Promise<Array<{type: string; cost: number; duration: number; co2: number}>> => {
  try {
    // If distance isn't provided, we could call a distance matrix API here
    // For now, using a mock implementation
    const estimatedDistance = distance || 10; // Default 10km if no distance provided
    
    const options = [
      {
        type: 'car',
        cost: calculateTransportationCost({
          origin,
          destination,
          transportType: 'car',
          distance: estimatedDistance
        }),
        duration: estimatedDistance * 1.2, // minutes, assuming 50km/h avg speed
        co2: estimatedDistance * 120 // g/km CO2 emissions
      },
      {
        type: 'taxi',
        cost: calculateTransportationCost({
          origin,
          destination,
          transportType: 'taxi',
          distance: estimatedDistance
        }),
        duration: estimatedDistance * 1.1, // minutes
        co2: estimatedDistance * 120 // g/km CO2 emissions
      },
      {
        type: 'uber',
        cost: calculateTransportationCost({
          origin,
          destination,
          transportType: 'uber',
          distance: estimatedDistance
        }),
        duration: estimatedDistance * 1.1, // minutes
        co2: estimatedDistance * 120 // g/km CO2 emissions
      },
      {
        type: 'bus',
        cost: calculateTransportationCost({
          origin,
          destination,
          transportType: 'bus',
          distance: estimatedDistance
        }),
        duration: estimatedDistance * 1.5, // minutes
        co2: estimatedDistance * 65 // g/km CO2 emissions
      },
      {
        type: 'train',
        cost: calculateTransportationCost({
          origin,
          destination,
          transportType: 'train',
          distance: estimatedDistance
        }),
        duration: estimatedDistance * 0.8, // minutes
        co2: estimatedDistance * 35 // g/km CO2 emissions
      }
    ];
    
    // Sort by cost ascending
    return options.sort((a, b) => a.cost - b.cost);
  } catch (error) {
    console.error('Error comparing transportation options:', error);
    throw error;
  }
};
