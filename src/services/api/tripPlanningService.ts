
import axios from 'axios';

// Gemini AI integration for trip planning
export const generateAITripPlan = async (destination: string, interests: string[], duration: number, budget: string) => {
  try {
    // This is a placeholder. In a real application, this would call the Gemini API
    // You would need to set up a backend service to handle API keys securely
    const response = await axios.post('https://api.gemini.com/trip-planner', {
      destination,
      interests,
      duration,
      budget
    });
    
    return response.data;
  } catch (error) {
    console.error('Error generating trip plan with AI:', error);
    
    // If API call fails, return mock data for now
    return {
      destination,
      days: Array.from({ length: duration }, (_, i) => ({
        date: new Date(new Date().setDate(new Date().getDate() + i)),
        activities: [
          {
            id: `act-${i}-1`,
            time: "09:00",
            name: `${interests[0] || 'Cultural'} Activity`,
            location: `${destination} Downtown`,
            description: `Explore the ${interests[0] || 'cultural'} scene in ${destination}`,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
            category: "activity",
            duration: "2 hours"
          },
          {
            id: `act-${i}-2`,
            time: "12:00",
            name: "Local Restaurant",
            location: `${destination} Center`,
            description: `Enjoy local cuisine in ${destination}`,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=restaurants+${encodeURIComponent(destination)}`,
            category: "food",
            duration: "1.5 hours"
          },
          {
            id: `act-${i}-3`,
            time: "15:00",
            name: `${interests[1] || 'Outdoor'} Experience`,
            location: `${destination} Park`,
            description: `Experience ${interests[1] || 'outdoor activities'} in ${destination}`,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=parks+${encodeURIComponent(destination)}`,
            category: "attraction",
            duration: "3 hours"
          }
        ]
      }))
    };
  }
};
