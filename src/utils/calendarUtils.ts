
// Calendar integration utilities
import { format } from "date-fns";

// Generate Apple Calendar event URL with proper iCal format
export const generateAppleCalendarUrl = (
  title: string,
  startDate: Date,
  endDate: Date,
  location: string = "",
  description: string = ""
): string => {
  // Format dates for iCal format (without UTC indicator to work better with Apple Calendar)
  const formatICalDate = (date: Date): string => {
    return format(date, "yyyyMMdd'T'HHmmss");
  };

  // Create proper iCal format for Apple Calendar
  const startDateStr = formatICalDate(startDate);
  const endDateStr = formatICalDate(endDate);
  
  // Build a complete iCal format with all required fields
  const iCalData = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `SUMMARY:${title}`,
    `DTSTART:${startDateStr}`,
    `DTEND:${endDateStr}`,
    location ? `LOCATION:${location}` : "",
    description ? `DESCRIPTION:${description}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join('\n');
  
  // Ensure URL is properly encoded as a data URL for Apple devices
  return `data:text/calendar;charset=utf8,${encodeURIComponent(iCalData)}`;
};

// Generate a full day itinerary calendar URL with shortened content
export const generateDayItineraryCalendarUrl = (
  destination: string,
  date: Date,
  dayActivities: any[]
): string => {
  // The end date is the end of the same day
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59);
  
  // Create a shorter description with limited activities
  const description = dayActivities
    .slice(0, 3) // Only include first 3 activities to limit URL size
    .map(activity => `${activity.startTime || ""}: ${activity.title || ""}`)
    .join('\n');
  
  return generateAppleCalendarUrl(
    `${destination} Day ${format(date, "d")}`,
    date,
    endDate,
    destination,
    description
  );
};

// Generate a single activity calendar URL
export const generateActivityCalendarUrl = (
  activity: any,
  date: Date
): string => {
  // Parse the start and end times
  const startTime = activity.startTime?.split(":") || ["9", "00"];
  const endTime = activity.endTime?.split(":") || ["10", "00"];
  
  const startDate = new Date(date);
  startDate.setHours(parseInt(startTime[0]), parseInt(startTime[1] || 0), 0);
  
  const endDate = new Date(date);
  endDate.setHours(parseInt(endTime[0]), parseInt(endTime[1] || 0), 0);
  
  // Keep description very short to avoid QR code issues
  const shortDescription = (activity.title || "").substring(0, 50);
  
  return generateAppleCalendarUrl(
    activity.title,
    startDate,
    endDate,
    activity.address,
    shortDescription
  );
};

// Helper to generate unique activities for each day without repeats
export const generateUniqueActivities = (destination: string, count: number, existingActivities: string[] = []): any[] => {
  let attractions: string[] = [];
  
  if (destination.includes("Paris")) {
    attractions = [
      "Eiffel Tower", "Louvre Museum", "Notre-Dame Cathedral", "Champs-Élysées", 
      "Montmartre", "Seine River Cruise", "Café de Flore", "Arc de Triomphe",
      "Sacré-Cœur Basilica", "Musée d'Orsay", "Palace of Versailles", "Centre Pompidou",
      "Sainte-Chapelle", "Luxembourg Gardens", "Place de la Concorde", "Tuileries Garden",
      "Moulin Rouge", "Pont Neuf", "Panthéon", "Opéra Garnier",
      "Les Invalides", "Île de la Cité", "Père Lachaise Cemetery", "La Défense"
    ];
  } else if (destination.includes("New York")) {
    attractions = [
      "Times Square", "Central Park", "Empire State Building", "Metropolitan Museum of Art",
      "Brooklyn Bridge", "High Line", "Broadway Show", "Chelsea Market",
      "Statue of Liberty", "Museum of Modern Art", "Rockefeller Center", "9/11 Memorial",
      "Grand Central Terminal", "Fifth Avenue", "Whitney Museum", "Ellis Island",
      "One World Observatory", "Wall Street", "Chinatown", "SoHo",
      "Little Italy", "Greenwich Village", "Hudson Yards", "Washington Square Park"
    ];
  } else if (destination.includes("Tokyo")) {
    attractions = [
      "Shibuya Crossing", "Meiji Shrine", "Tokyo Skytree", "Tsukiji Fish Market",
      "Akihabara", "Harajuku", "Senso-ji Temple", "Tokyo Disneyland",
      "Tokyo Tower", "Imperial Palace", "Shinjuku Gyoen", "Ueno Park",
      "Ginza Shopping District", "Odaiba", "Robot Restaurant", "Roppongi Hills",
      "Yoyogi Park", "Nakamise Shopping Street", "Takeshita Street", "Kabukicho",
      "Ghibli Museum", "Tokyo National Museum", "Rainbow Bridge", "Edo-Tokyo Museum"
    ];
  } else if (destination.includes("London")) {
    attractions = [
      "British Museum", "Tower of London", "Buckingham Palace", "London Eye",
      "Westminster Abbey", "Covent Garden", "Hyde Park", "Borough Market",
      "St Paul's Cathedral", "Tate Modern", "Natural History Museum", "Piccadilly Circus",
      "Big Ben", "Trafalgar Square", "Tower Bridge", "Camden Market",
      "Oxford Street", "Victoria & Albert Museum", "Regent's Park", "Greenwich Observatory",
      "Notting Hill", "Kensington Palace", "Hampstead Heath", "Sky Garden"
    ];
  } else if (destination.includes("Dubai")) {
    attractions = [
      "Burj Khalifa", "Dubai Mall", "Palm Jumeirah", "Dubai Miracle Garden",
      "Dubai Creek", "Gold Souk", "Desert Safari", "Jumeirah Beach",
      "Dubai Marina", "Atlantis Aquaventure", "Burj Al Arab", "Dubai Fountain",
      "Museum of the Future", "Dubai Frame", "Souk Madinat Jumeirah", "IMG Worlds of Adventure",
      "Global Village", "Bastakia Quarter", "Kite Beach", "Ski Dubai",
      "Wild Wadi Water Park", "Dubai Opera", "Al Fahidi Historical District", "Dubai Aquarium"
    ];
  } else if (destination.includes("Cairo")) {
    attractions = [
      "Pyramids of Giza", "Egyptian Museum", "Khan el-Khalili", "Al-Azhar Mosque",
      "Coptic Cairo", "Nile River Cruise", "Salah El-Din Citadel", "Tahrir Square",
      "Alabaster Mosque", "Cairo Tower", "Hanging Church", "Solar Boat Museum",
      "Pyramid of Djoser", "Al-Azhar Park", "Ben Ezra Synagogue", "Great Sphinx of Giza",
      "Memphis", "Museum of Islamic Art", "Saqqara Necropolis", "Sultan Hassan Mosque",
      "Gayer-Anderson Museum", "Nilometer", "Baron Empain Palace", "Manial Palace"
    ];
  } else if (destination.includes("Jeddah")) {
    attractions = [
      "Al-Balad (Historic District)", "King Fahd Fountain", "Jeddah Corniche", "Floating Mosque",
      "Red Sea Mall", "Fakieh Aquarium", "Jeddah Sculpture Museum", "Al Rahma Mosque",
      "Jeddah Waterfront", "King Abdulaziz Historical Center", "Abdul Raouf Khalil Museum", "Tayebat City",
      "Makkah Gate", "Mall of Arabia", "King Abdullah Economic City", "Silver Sands Beach",
      "Central Fish Market", "Al Shallal Theme Park", "Jeddah Science Oasis", "Athr Gallery",
      "King Fahad Fountain", "Nassif House Museum", "Al Tayibat City Museum", "Biet Nassif"
    ];
  } else {
    attractions = [
      "Local Museum", "Famous Monument", "Historic Site", "Popular Restaurant",
      "Shopping District", "Park", "Beach", "Local Market",
      "Downtown Area", "Cultural Center", "Art Gallery", "Ancient Temple",
      "Botanical Garden", "River Walk", "Observation Deck", "Heritage Village",
      "Local Theater", "Craft Market", "National Monument", "Historical Square",
      "Wildlife Sanctuary", "Traditional Restaurant", "City Hall", "Lighthouse"
    ];
  }
  
  // Filter out activities that have been used before
  const availableAttractions = attractions.filter(attr => !existingActivities.includes(attr));
  
  // If we don't have enough available attractions, add some generic ones
  if (availableAttractions.length < count) {
    const additionalAttractions = [
      "Local Restaurant", "City View Point", "Hidden Gem Café", "Historical District",
      "Street Food Market", "Public Square", "Local Boutique", "Traditional Bakery",
      "City Garden", "Artisan Workshop", "Local Brewery", "Modern Art Installation",
      "Technology Museum", "Science Center", "Music Venue", "Sports Complex"
    ].filter(attr => !existingActivities.includes(attr));
    
    availableAttractions.push(...additionalAttractions);
  }
  
  // Shuffle available attractions to get random selection each time
  const shuffled = [...availableAttractions].sort(() => 0.5 - Math.random());
  
  // Take only what we need
  const selectedAttractions = shuffled.slice(0, count);
  
  // Generate activities
  const activityTypes = [
    "Sightseeing", "Museum", "Dining", "Shopping",
    "Entertainment", "Relaxation", "Nature", "Cultural"
  ];
  
  return selectedAttractions.map((attraction, index) => {
    const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
    
    // Calculate times - stagger throughout the day
    const startHour = 9 + Math.floor(index * 2);
    const durationHours = Math.floor(Math.random() * 2) + 1;
    const endHour = startHour + durationHours;
    
    const startTime = `${startHour.toString().padStart(2, "0")}:00`;
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;
    
    const address = `${Math.floor(Math.random() * 200) + 1} Main St, ${destination}`;
    
    const openingHour = Math.floor(Math.random() * 4) + 8;
    const closingHour = Math.floor(Math.random() * 6) + 17;
    
    const isOpen = startHour >= openingHour && endHour <= closingHour;
    
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${attraction} ${destination}`
    )}`;
    
    let cost;
    switch (activityType.toLowerCase()) {
      case "dining":
        cost = Math.floor(Math.random() * 80) + 20;
        break;
      case "museum":
        cost = Math.floor(Math.random() * 30) + 10;
        break;
      case "entertainment":
        cost = Math.floor(Math.random() * 100) + 50;
        break;
      case "shopping":
        cost = Math.floor(Math.random() * 200) + 50;
        break;
      default:
        cost = Math.floor(Math.random() * 50) + 10;
    }
    
    return {
      id: `activity-${attraction.replace(/\s+/g, "-").toLowerCase()}-${index}`,
      title: attraction,
      type: activityType,
      startTime,
      endTime,
      address,
      description: `Explore the wonders of ${attraction} in ${destination}. This is a must-visit location for travelers.`,
      openingHours: `${openingHour}:00 - ${closingHour}:00`,
      isOpen,
      googleMapsLink,
      cost,
      phone: `+1-555-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`,
      website: `https://www.${attraction.toLowerCase().replace(/\s+/g, "")}.com`,
    };
  });
};
