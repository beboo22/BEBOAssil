
import { LatLngExpression } from "leaflet";

// Define the Activity type
export interface Activity {
  id: string;
  title: string;
  address: string;
  description: string;
  startTime: string;
  endTime: string;
  googleMapsLink: string;
  /** Coordinate-based fallback URL (e.g. https://maps.google.com/?q=lat,lng).
   *  Used when the named place lookup fails or returns nothing. */
  googleMapsCoordsUrl?: string;
  type?: string;
  coordinates?: [number, number]; // [latitude, longitude]
  latitude?: number;
  longitude?: number;
}

// Extract coordinates from Google Maps URL
export const extractCoordinatesFromGoogleMapsUrl = (url: string): [number, number] | null => {
  try {
    // Try to extract coordinates from various Google Maps URL formats
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = url.match(regex);
    
    if (match && match.length >= 3) {
      // The coordinates in Google Maps are in the format latitude,longitude
      return [parseFloat(match[1]), parseFloat(match[2])];
    }
    
    // If no coordinates found in URL, try to extract from query parameters
    const urlObj = new URL(url);
    const queryParams = urlObj.searchParams;
    
    // Check for "q" parameter which often contains lat,lng
    const qParam = queryParams.get("q");
    if (qParam) {
      const qParamCoords = qParam.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qParamCoords && qParamCoords.length >= 3) {
        return [parseFloat(qParamCoords[1]), parseFloat(qParamCoords[2])];
      }
    }
    
    return null;
  } catch (error) {
    console.error("Failed to extract coordinates:", error);
    return null;
  }
};

// Pre-defined coordinates for popular Dubai attractions to ensure unique markers
const dubaiAttractions: { [key: string]: [number, number] } = {
  "Dubai Mall": [25.1972, 55.2798],
  "Burj Khalifa": [25.1972, 55.2744],
  "Dubai Creek": [25.2285, 55.3273],
  "Dubai Marina": [25.0808, 55.1403],
  "Palm Jumeirah": [25.1124, 55.1400],
  "Jumeirah Beach": [25.2048, 55.2708],
  "Wild Wadi Water Park": [25.1376, 55.1845],
  "Dubai Miracle Garden": [25.0636, 55.2417],
  "Ski Dubai": [25.1172, 55.2003],
  "Dubai Museum": [25.2635, 55.2972],
  "Global Village": [25.0714, 55.3009],
  "Mall of the Emirates": [25.1181, 55.2000],
  "Dubai Frame": [25.2344, 55.3006],
  "IMG Worlds of Adventure": [25.0478, 55.3770],
  "La Mer Beach": [25.2253, 55.2590]
};

// Geocode address to coordinates
export const geocodeAddress = async (address: string | undefined, title: string | undefined): Promise<[number, number] | null> => {
  if (!address && !title) return null;
  const safeAddress = address || "";
  const safeTitle = title || "";
  // First check if this is a known Dubai attraction
  for (const attraction in dubaiAttractions) {
    if (safeTitle.toLowerCase().includes(attraction.toLowerCase()) || 
        safeAddress.toLowerCase().includes(attraction.toLowerCase())) {
      return dubaiAttractions[attraction];
    }
  }
  
  // Predefined coordinates for popular global destinations
  const popularPlaces: { [key: string]: [number, number] } = {
    "Paris": [48.8566, 2.3522],
    "London": [51.5074, -0.1278],
    "New York": [40.7128, -74.0060],
    "Tokyo": [35.6762, 139.6503],
    "Sydney": [-33.8688, 151.2093],
    "Rome": [41.9028, 12.4964],
    "Cairo": [30.0444, 31.2357],
    "Dubai": [25.2048, 55.2708],
    "Istanbul": [41.0082, 28.9784],
    "Barcelona": [41.3851, 2.1734],
    "Jeddah": [21.5433, 39.1728],
    "Abu Dhabi": [24.4539, 54.3773],
    "Riyadh": [24.7136, 46.6753],
    "Mecca": [21.3891, 39.8579],
    "Amman": [31.9539, 35.9340],
    "Jerash": [32.2747, 35.8913],
  };
  
  // Check if the address contains any of our predefined places
  for (const place in popularPlaces) {
    if (safeAddress.toLowerCase().includes(place.toLowerCase()) || safeTitle.toLowerCase().includes(place.toLowerCase())) {
      return popularPlaces[place];
    }
  }

  // Do not inject random/fake coordinates.
  return null;
};

// Process activities to extract or geocode coordinates
export const processActivitiesWithCoordinates = async (activities: Activity[]): Promise<Activity[]> => {
  // Process all activities to extract or geocode coordinates
  const activitiesWithCoords = await Promise.all(
    activities.map(async (activity, index) => {
      // First check if activity already has latitude/longitude from AI
      if (Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude)) {
        return { ...activity, coordinates: [activity.latitude, activity.longitude] as [number, number] };
      }
      
      // Try to extract coordinates from Google Maps URL if available
      if (activity.googleMapsLink) {
        const coords = extractCoordinatesFromGoogleMapsUrl(activity.googleMapsLink);
        if (coords) {
          return { ...activity, coordinates: coords };
        }
      }
      
      // Fallback to geocoding the address
      try {
        const coords = await geocodeAddress(activity.address, activity.title);
        if (coords) {
          return { ...activity, coordinates: coords };
        }
        return activity;
      } catch (error) {
        console.error("Failed to geocode:", error);
        // Return activity without coordinates
        return activity;
      }
    })
  );
  
  return activitiesWithCoords as Activity[];
};

// Calculate the center point of multiple coordinates
export const calculateMapCenter = (activities: Activity[]): LatLngExpression => {
  const validActivities = activities.filter(activity => activity.coordinates);
  
  if (validActivities.length === 0) {
    // Default to New York if no valid activities
    return [40.7128, -74.0060];
  }
  
  const sumLat = validActivities.reduce((sum, act) => 
    sum + (act.coordinates ? act.coordinates[0] : 0), 0);
  const sumLng = validActivities.reduce((sum, act) => 
    sum + (act.coordinates ? act.coordinates[1] : 0), 0);
  
  return [
    sumLat / validActivities.length,
    sumLng / validActivities.length
  ];
};
