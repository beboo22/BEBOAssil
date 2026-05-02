
import { generateUniqueActivities } from './calendarUtils';

type PdfProgressCallback = (progress: number) => void;

type PdfExportOptions = {
  onProgress?: PdfProgressCallback;
  maxDays?: number;
};

export type ItineraryDay = {
  date: Date;
  activities: Activity[];
};

export type Activity = {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  address: string;
  googleMapsLink: string;
  imageUrl: string;
  openingHours: string;
  isOpen: boolean;
  cost?: number;
  type?: string;
  phone?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
};

export type Itinerary = {
  id: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  days: ItineraryDay[];
  flightDetails?: {
    departure: FlightDetail;
    return: FlightDetail;
  };
};

type FlightDetail = {
  date: Date;
  time: string;
  airport: string;
  flightNumber: string;
  price: number;
};

// Specific location data for each destination
const destinationData: Record<string, Array<{
  name: string;
  address: string;
  description: string;
  type: string;
  openingHours: string;
  website: string;
  phone: string;
}>> = {
  "Paris": [
    {
      name: "Eiffel Tower",
      address: "Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France",
      description: "Iconic wrought-iron tower offering city views from 3 observation levels.",
      type: "Attraction",
      openingHours: "9:00 AM - 11:45 PM",
      website: "https://www.toureiffel.paris/en",
      phone: "+33 892 70 12 39"
    },
    {
      name: "Louvre Museum",
      address: "Rue de Rivoli, 75001 Paris, France",
      description: "World's largest art museum featuring the Mona Lisa and other masterpieces.",
      type: "Museum",
      openingHours: "9:00 AM - 6:00 PM",
      website: "https://www.louvre.fr/en",
      phone: "+33 1 40 20 53 17"
    },
    {
      name: "Notre-Dame Cathedral",
      address: "6 Parvis Notre-Dame, 75004 Paris, France",
      description: "Medieval Catholic cathedral with Gothic architecture and stained glass.",
      type: "Cultural",
      openingHours: "8:00 AM - 6:45 PM",
      website: "https://www.notredamedeparis.fr/",
      phone: "+33 1 42 34 56 10"
    },
    {
      name: "Champs-Élysées",
      address: "Avenue des Champs-Élysées, 75008 Paris, France",
      description: "Prestigious avenue lined with luxury shops, theaters and cafés.",
      type: "Shopping",
      openingHours: "24 hours (shops 10:00 AM - 8:00 PM)",
      website: "https://www.champselysees-paris.com/",
      phone: ""
    },
    {
      name: "Sacré-Cœur Basilica",
      address: "35 Rue du Chevalier de la Barre, 75018 Paris, France",
      description: "Roman Catholic church with white dome offering panoramic city views.",
      type: "Cultural",
      openingHours: "6:00 AM - 10:30 PM",
      website: "https://www.sacre-coeur-montmartre.com/",
      phone: "+33 1 53 41 89 00"
    }
  ],
  "New York": [
    {
      name: "Empire State Building",
      address: "350 5th Ave, New York, NY 10118, USA",
      description: "Iconic 102-story skyscraper with observatories offering city views.",
      type: "Attraction",
      openingHours: "8:00 AM - 2:00 AM",
      website: "https://www.esbnyc.com/",
      phone: "+1 212-736-3100"
    },
    {
      name: "Central Park",
      address: "Central Park West & 59th St, New York, NY 10019, USA",
      description: "Sprawling urban park with lakes, walking paths, and outdoor activities.",
      type: "Park",
      openingHours: "6:00 AM - 1:00 AM",
      website: "https://www.centralparknyc.org/",
      phone: "+1 212-310-6600"
    },
    {
      name: "Statue of Liberty",
      address: "Liberty Island, New York, NY 10004, USA",
      description: "Iconic copper statue gifted by France, symbolizing freedom and democracy.",
      type: "Monument",
      openingHours: "9:30 AM - 5:00 PM",
      website: "https://www.nps.gov/stli/",
      phone: "+1 212-363-3200"
    },
    {
      name: "Metropolitan Museum of Art",
      address: "1000 5th Ave, New York, NY 10028, USA",
      description: "Vast collection of art spanning 5,000 years of world culture.",
      type: "Museum",
      openingHours: "10:00 AM - 5:30 PM",
      website: "https://www.metmuseum.org/",
      phone: "+1 212-535-7710"
    },
    {
      name: "Times Square",
      address: "Broadway & 7th Avenue, New York, NY 10036, USA",
      description: "Vibrant intersection known for bright lights, Broadway theaters, and shops.",
      type: "Entertainment",
      openingHours: "24 hours",
      website: "https://www.timessquarenyc.org/",
      phone: "+1 212-768-1560"
    }
  ],
  "Dubai": [
    {
      name: "Burj Khalifa",
      address: "1 Sheikh Mohammed bin Rashid Blvd, Dubai, UAE",
      description: "World's tallest building with observation decks offering panoramic views.",
      type: "Attraction",
      openingHours: "8:30 AM - 11:00 PM",
      website: "https://www.burjkhalifa.ae/",
      phone: "+971 4 888 8888"
    },
    {
      name: "The Dubai Mall",
      address: "Financial Centre Road, Downtown Dubai, UAE",
      description: "World's largest mall with luxury shopping, dining, and entertainment.",
      type: "Shopping",
      openingHours: "10:00 AM - 12:00 AM",
      website: "https://thedubaimall.com/",
      phone: "+971 4 438 3200"
    },
    {
      name: "Palm Jumeirah",
      address: "Palm Jumeirah, Dubai, UAE",
      description: "Artificial archipelago with luxury resorts, restaurants, and beaches.",
      type: "Adventure",
      openingHours: "24 hours",
      website: "https://www.visitdubai.com/en/places-to-visit/palm-jumeirah",
      phone: ""
    },
    {
      name: "Dubai Miracle Garden",
      address: "Al Barsha South 3, Dubai, UAE",
      description: "World's largest natural flower garden with over 50 million flowers.",
      type: "Park",
      openingHours: "9:00 AM - 9:00 PM",
      website: "https://www.dubaimiraclegarden.com/",
      phone: "+971 4 422 8902"
    },
    {
      name: "Dubai Marina",
      address: "Dubai Marina, Dubai, UAE",
      description: "Waterfront promenade with luxury yachts, restaurants, and skyscrapers.",
      type: "Sightseeing",
      openingHours: "24 hours",
      website: "https://www.visitdubai.com/en/places-to-visit/dubai-marina",
      phone: ""
    }
  ],
  "Tokyo": [
    {
      name: "Tokyo Skytree",
      address: "1 Chome-1-2 Oshiage, Sumida City, Tokyo 131-0045, Japan",
      description: "Tallest tower in Japan with observation decks and shopping complex.",
      type: "Attraction",
      openingHours: "10:00 AM - 9:00 PM",
      website: "http://www.tokyo-skytree.jp/en/",
      phone: "+81 570-550-634"
    },
    {
      name: "Sensō-ji Temple",
      address: "2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan",
      description: "Ancient Buddhist temple with iconic Thunder Gate and shopping street.",
      type: "Cultural",
      openingHours: "6:00 AM - 5:00 PM",
      website: "https://www.senso-ji.jp/",
      phone: "+81 3-3842-0181"
    },
    {
      name: "Shibuya Crossing",
      address: "2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo 150-0043, Japan",
      description: "World's busiest pedestrian crossing with neon lights and shopping centers.",
      type: "Sightseeing",
      openingHours: "24 hours",
      website: "https://www.japan-guide.com/e/e3007.html",
      phone: ""
    },
    {
      name: "Meiji Shrine",
      address: "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan",
      description: "Shinto shrine dedicated to Emperor Meiji set in a peaceful forest.",
      type: "Cultural",
      openingHours: "Sunrise to Sunset",
      website: "https://www.meijijingu.or.jp/en/",
      phone: "+81 3-3379-5511"
    },
    {
      name: "Akihabara Electric Town",
      address: "Akihabara, Taito City, Tokyo 110-0006, Japan",
      description: "District famous for electronics, anime, manga, and gaming culture.",
      type: "Shopping",
      openingHours: "11:00 AM - 8:00 PM",
      website: "https://www.japan-guide.com/e/e3003.html",
      phone: ""
    }
  ],
  "London": [
    {
      name: "Tower of London",
      address: "St Katharine's & Wapping, London EC3N 4AB, UK",
      description: "Historic castle housing the Crown Jewels and with infamous past.",
      type: "Monument",
      openingHours: "9:00 AM - 5:30 PM",
      website: "https://www.hrp.org.uk/tower-of-london/",
      phone: "+44 33 3320 6000"
    },
    {
      name: "British Museum",
      address: "Great Russell St, London WC1B 3DG, UK",
      description: "World-class museum of human history, art, and culture.",
      type: "Museum",
      openingHours: "10:00 AM - 5:00 PM",
      website: "https://www.britishmuseum.org/",
      phone: "+44 20 7323 8299"
    },
    {
      name: "Buckingham Palace",
      address: "Westminster, London SW1A 1AA, UK",
      description: "Official residence of the British monarch with changing of the guard ceremony.",
      type: "Monument",
      openingHours: "9:30 AM - 5:30 PM (during summer opening)",
      website: "https://www.rct.uk/visit/buckingham-palace",
      phone: "+44 303 123 7300"
    },
    {
      name: "London Eye",
      address: "Riverside Building, County Hall, London SE1 7PB, UK",
      description: "Giant observation wheel offering panoramic views of London's skyline.",
      type: "Attraction",
      openingHours: "11:00 AM - 6:00 PM",
      website: "https://www.londoneye.com/",
      phone: "+44 870 990 8883"
    },
    {
      name: "Hyde Park",
      address: "Hyde Park, London W2 2UH, UK",
      description: "One of London's largest parks with Serpentine Lake and Speakers' Corner.",
      type: "Park",
      openingHours: "5:00 AM - 12:00 AM",
      website: "https://www.royalparks.org.uk/parks/hyde-park",
      phone: "+44 300 061 2000"
    }
  ]
};

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate fuel cost for a given distance
 */
export const calculateFuelCost = (
  distanceKm: number,
  fuelEfficiency: number = 8, // liters per 100km
  fuelPrice: number = 2.5 // price per liter in USD
): number => {
  const fuelNeeded = (distanceKm / 100) * fuelEfficiency;
  return Math.round(fuelNeeded * fuelPrice * 100) / 100;
};

/**
 * Calculate total distance and fuel cost for a day's activities
 */
export const calculateDayTripStats = (
  activities: Activity[],
  fuelEfficiency: number = 8,
  fuelPrice: number = 2.5
): { totalDistance: number; fuelCost: number; segments: Array<{ from: string; to: string; distance: number }> } => {
  let totalDistance = 0;
  const segments: Array<{ from: string; to: string; distance: number }> = [];
  
  for (let i = 0; i < activities.length - 1; i++) {
    const current = activities[i];
    const next = activities[i + 1];
    
    if (current.latitude && current.longitude && next.latitude && next.longitude) {
      const distance = calculateDistance(
        current.latitude, current.longitude,
        next.latitude, next.longitude
      );
      totalDistance += distance;
      segments.push({
        from: current.title,
        to: next.title,
        distance: Math.round(distance * 10) / 10
      });
    }
  }
  
  const fuelCost = calculateFuelCost(totalDistance, fuelEfficiency, fuelPrice);
  
  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    fuelCost,
    segments
  };
};

/**
 * Generates a complete itinerary with activities for each day
 */
export const generateFullItinerary = (
  destination: string, 
  startDate: Date, 
  duration: number,
  customId?: string
): Itinerary => {
  const id = customId || Math.random().toString(36).substring(2, 10);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + duration - 1);
  
  const departureHour = Math.floor(Math.random() * 12) + 6;
  const returnHour = Math.floor(Math.random() * 12) + 6;
  const flightPrice = Math.floor(Math.random() * 500) + 300;
  
  const flightDetails = {
    departure: {
      date: new Date(startDate),
      time: `${departureHour.toString().padStart(2, "0")}:${Math.floor(Math.random() * 60).toString().padStart(2, "0")}`,
      airport: `${destination.split(",")[0]} International Airport`,
      flightNumber: `${["AA", "UA", "DL", "BA", "EK", "QR"][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 1000) + 1000}`,
      price: flightPrice,
    },
    return: {
      date: new Date(endDate),
      time: `${returnHour.toString().padStart(2, "0")}:${Math.floor(Math.random() * 60).toString().padStart(2, "0")}`,
      airport: `${destination.split(",")[0]} International Airport`,
      flightNumber: `${["AA", "UA", "DL", "BA", "EK", "QR"][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 1000) + 1000}`,
      price: Math.floor(flightPrice * 0.9),
    }
  };
  
  let destinationKey = Object.keys(destinationData).find(key => 
    destination.includes(key)
  ) || "Paris";
  
  const locationData = destinationData[destinationKey].slice();
  
  const days: ItineraryDay[] = [];
  const allUsedLocations: string[] = [];
  
  for (let i = 0; i < duration; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + i);
    
    const activitiesCount = Math.floor(Math.random() * 3) + 3;
    
    const availableTimes = [
      { start: "09:00 AM", end: "11:00 AM" },
      { start: "11:30 AM", end: "01:30 PM" },
      { start: "02:00 PM", end: "04:00 PM" },
      { start: "04:30 PM", end: "06:30 PM" },
      { start: "07:00 PM", end: "09:00 PM" }
    ];
    
    const activities: Activity[] = [];
    
    if (locationData.length < activitiesCount) {
      const allLocations = [...destinationData[destinationKey]];
      const freshLocations = allLocations.filter(loc => 
        !allUsedLocations.includes(loc.name)
      );
      locationData.push(...freshLocations.slice(0, Math.max(5, activitiesCount)));
    }
    
    for (let j = 0; j < Math.min(activitiesCount, availableTimes.length); j++) {
      if (locationData.length === 0) break;
      
      const randomIndex = Math.floor(Math.random() * locationData.length);
      const location = locationData[randomIndex];
      
      locationData.splice(randomIndex, 1);
      allUsedLocations.push(location.name);
      
      const isOpen = Math.random() > 0.2;
      
      const activity: Activity = {
        id: `activity-${i}-${j}-${Math.random().toString(36).substring(2, 6)}`,
        title: location.name,
        description: location.description,
        startTime: availableTimes[j].start,
        endTime: availableTimes[j].end,
        address: location.address,
        googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.name + ' ' + location.address)}`,
        imageUrl: `/placeholder.svg`,
        openingHours: location.openingHours,
        isOpen: isOpen,
        cost: Math.floor(Math.random() * 50) + 10,
        type: location.type,
        phone: location.phone || undefined,
        website: location.website || undefined
      };
      
      activities.push(activity);
    }
    
    days.push({
      date: dayDate,
      activities: activities,
    });
  }
  
  return {
    id,
    destination,
    startDate,
    endDate,
    duration,
    days,
    flightDetails,
  };
};

/**
 * Validates and repairs an itinerary object
 */
export const validateAndRepairItinerary = (
  itinerary: any, 
  fallbackDestination: string = "Paris, France"
): Itinerary => {
  if (!itinerary || typeof itinerary !== 'object') {
    return generateFullItinerary(fallbackDestination, new Date(), 3);
  }
  
  const startDate = itinerary.startDate instanceof Date 
    ? itinerary.startDate 
    : new Date(itinerary.startDate || new Date());
    
  const endDate = itinerary.endDate instanceof Date 
    ? itinerary.endDate 
    : new Date(itinerary.endDate || new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000)));
  
  let duration = itinerary.duration || 3;
  if (!itinerary.duration) {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 3;
  }
  
  const destination = itinerary.destination || fallbackDestination;
  
  let days = [];
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    days = itinerary.days.map((day: any) => ({
      date: day.date instanceof Date ? day.date : new Date(day.date || startDate),
      activities: Array.isArray(day.activities) ? day.activities : []
    }));
  }
  
  if (days.length === 0 || days.length !== duration) {
    return generateFullItinerary(destination, startDate, duration, itinerary.id);
  }
  
  return {
    id: itinerary.id || Math.random().toString(36).substring(2, 10),
    destination,
    startDate,
    endDate,
    duration,
    days,
    flightDetails: itinerary.flightDetails
  };
};

/**
 * Generate interactive HTML file for download with clickable links and QR codes
 */
export const generateInteractiveHTML = (printableRef: React.RefObject<HTMLDivElement>, filename: string) => {
  if (!printableRef.current) throw new Error("No printable content");
  
  const content = printableRef.current.innerHTML;
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
<meta name="format-detection" content="telephone=yes">
<title>${filename}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif; background: #f8fafc; direction: rtl; color: #0f172a; font-size: 15px; line-height: 1.55; -webkit-text-size-adjust: 100%; }
  .export-shell { max-width: 860px; margin: 0 auto; padding: 16px; }
  img, svg, video, canvas, iframe { max-width: 100%; height: auto; }
  table { max-width: 100%; display: block; overflow-x: auto; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  a { word-break: break-word; color: #0d9488; text-decoration: none; }
  a:hover { text-decoration: underline; }
  /* Portrait mobile optimizations */
  @media (max-width: 768px) {
    .export-shell { padding: 10px 12px; max-width: 100%; }
    body { background: #ffffff; font-size: 14px; }
    h1 { font-size: 1.4rem !important; }
    h2 { font-size: 1.2rem !important; }
    h3 { font-size: 1.05rem !important; }
    /* Force the printable container away from its fixed 794px width */
    #printable-itinerary, [data-pdf-section], [data-pdf-day-section],
    [data-pdf-activity], [data-pdf-card] {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
    /* Force ANY descendant flex/grid row inside an activity/section/day to stack */
    [data-pdf-activity] *, [data-pdf-card] *, [data-pdf-section] *, [data-pdf-day-section] * {
      min-width: 0 !important;
      max-width: 100% !important;
    }
    [data-pdf-activity] div[style*="display: flex"],
    [data-pdf-activity] div[style*="display:flex"],
    [data-pdf-card] div[style*="display: flex"],
    [data-pdf-card] div[style*="display:flex"],
    [data-pdf-section] div[style*="display: flex"],
    [data-pdf-section] div[style*="display:flex"] {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 10px !important;
      width: 100% !important;
    }
    /* But keep small inline flex rows (badges, link rows, match rows) horizontal-friendly */
    [data-pdf-activity] div[style*="flex-wrap"],
    [data-pdf-card] div[style*="flex-wrap"] {
      flex-direction: row !important;
      flex-wrap: wrap !important;
    }
    /* Activity image: full width on mobile */
    [data-pdf-activity] > div > div:first-child[style*="width: 100px"],
    [data-pdf-activity] > div > div:first-child[style*="width:100px"] {
      width: 100% !important;
      height: 200px !important;
    }
    [data-pdf-activity] img, .activity-card img {
      width: 100% !important; max-width: 100% !important;
      height: auto !important; max-height: 240px;
      object-fit: cover; border-radius: 12px;
    }
    /* Address & long text reflow */
    [data-pdf-activity] p, [data-pdf-activity] div, [data-pdf-activity] span, [data-pdf-activity] a,
    .activity-card p, .activity-card div, .activity-card span, .activity-card a {
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
    }
    /* QR section: keep horizontal pair, centered */
    [data-pdf-activity] svg, .activity-card svg { max-width: 140px; max-height: 140px; }
  }
  @media (max-width: 480px) {
    .export-shell { padding: 8px; }
    body { font-size: 13.5px; }
    [data-pdf-activity] svg, .activity-card svg { max-width: 110px; max-height: 110px; }
  }
   @media print {
     body { background: white; }
     .export-shell { max-width: 100%; padding: 0; }
     a { color: #0d9488 !important; }
     * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
     [data-pdf-day-section] { page-break-before: always; }
     [data-pdf-day-section]:first-of-type { page-break-before: auto; }
   }
</style>
</head>
<body>
<main class="export-shell">
${content}
</main>
<script>
document.querySelectorAll('a[href]').forEach(function(a) {
  var href = (a.getAttribute('href') || '').trim();
  if (/^https?:\\/\\//i.test(href)) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  // Make tel: links work on click
  if (/^tel:/i.test(href)) {
    a.addEventListener('click', function(e) {
      window.location.href = href;
    });
  }
});
// Make QR code SVGs inside <a> tags clickable
document.querySelectorAll('a svg').forEach(function(svg) {
  svg.style.cursor = 'pointer';
  svg.style.pointerEvents = 'auto';
});
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Generates a PDF of the itinerary with day-aware pagination.
 */
export const generateItineraryPDF = async (
  printableRef: React.RefObject<HTMLDivElement>,
  optionsOrProgress?: PdfProgressCallback | PdfExportOptions,
) => {
  if (!printableRef.current) {
    throw new Error("Could not find printable content");
  }
  const onProgress = typeof optionsOrProgress === 'function'
    ? optionsOrProgress
    : optionsOrProgress?.onProgress;
  const maxDays = typeof optionsOrProgress === 'function'
    ? undefined
    : optionsOrProgress?.maxDays;
  
  const jsPDF = (await import('jspdf')).default;
  const html2canvas = (await import('html2canvas')).default;
  
  const element = printableRef.current;
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MARGIN_MM = 10;
  const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
  const SECTION_GAP_MM = 3;
  const USABLE_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2;
  
  // Element is already visible via absolute positioning - just ensure proper width
  const origStyles = {
    width: element.style.width,
    backgroundColor: element.style.backgroundColor,
    direction: element.style.direction,
  };
  
  element.style.width = '794px';
  element.style.backgroundColor = '#ffffff';
  element.style.direction = 'rtl';

  // Collect ALL renderable units in document order. Each activity card is its
  // own unit so it never gets sliced across pages. Day sections that contain
  // activity cards are decomposed into: day header + individual activity cards.
  const collectRenderUnits = (root: HTMLElement): HTMLElement[] => {
    const units: HTMLElement[] = [];
    const walk = (node: HTMLElement) => {
      for (const child of Array.from(node.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.offsetHeight <= 0) continue;
        const isDaySection = child.hasAttribute('data-pdf-day-section');
        const isSection = child.hasAttribute('data-pdf-section');
        const isActivity = child.hasAttribute('data-pdf-activity');
        if (isActivity || isSection) {
          units.push(child);
          continue;
        }
        if (isDaySection) {
          // Walk into the day section so each activity becomes its own unit,
          // but keep the day header (a [data-pdf-section] inside) right before its activities.
          walk(child);
          continue;
        }
        // Recurse into pure layout wrappers to find nested marked nodes.
        if (child.querySelector('[data-pdf-section],[data-pdf-day-section],[data-pdf-activity]')) {
          walk(child);
        }
      }
    };
    walk(root);
    return units;
  };
  const allDaySections = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-day-section]'))
    .filter((section) => section.offsetHeight > 0);
  const daySections = maxDays && maxDays > 0 ? allDaySections.slice(0, maxDays) : allDaySections;
  const collected = collectRenderUnits(element).filter((unit) => {
    if (!maxDays || maxDays <= 0) return true;
    const parentDay = unit.closest('[data-pdf-day-section]') as HTMLElement | null;
    if (!parentDay) return true;
    return allDaySections.indexOf(parentDay) < maxDays;
  });
  // Render small marked units instead of whole day containers. This prevents
  // html2canvas from freezing on tall day blocks and keeps progress moving.
  const renderSections = collected.length > 0
    ? collected
    : (daySections.length > 0 ? daySections : [element]);
  
  // Wait for images to load (very short timeout for speed). Skip the wait
  // entirely for images that are already complete or have srcset cached —
  // this trims 200-400ms on most exports.
  const images = element.querySelectorAll('img');
  const pendingImages = Array.from(images).filter((img) => !img.complete);
  if (pendingImages.length > 0) {
    const imagePromises = pendingImages.map((img) => new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      setTimeout(resolve, 200);
    }));
    await Promise.all(imagePromises);
  }
  
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let currentY = MARGIN_MM;

    const addSectionLinks = (
      section: HTMLElement,
      sectionRect: DOMRect,
      canvas: HTMLCanvasElement,
      renderX: number,
      renderY: number,
      renderWidth: number,
      renderHeight: number,
      clipTopPx = 0,
      clipHeightPx = canvas.height,
    ) => {
      const links = Array.from(section.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const canvasScaleY = canvas.height / Math.max(sectionRect.height, 1);
      const clipTopCss = clipTopPx / Math.max(canvasScaleY, 1);
      const clipHeightCss = clipHeightPx / Math.max(canvasScaleY, 1);
      const clipBottomCss = clipTopCss + clipHeightCss;
      const scaleX = renderWidth / Math.max(sectionRect.width, 1);
      const scaleY = renderHeight / Math.max(clipHeightCss, 1);

      links.forEach((link) => {
        const rawHref = (link.getAttribute('href') || '').trim();
        if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:') || rawHref.startsWith('data:')) return;

        let href = rawHref;
        if (href.startsWith('www.')) href = `https://${href}`;
        if (href.startsWith('//')) href = `https:${href}`;
        if (href.startsWith('tel:')) {
          const phone = href.replace('tel:', '').replace(/[^\d+]/g, '');
          href = `tel:${phone}`;
        }

        const rect = link.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;

        const relativeTopCss = rect.top - sectionRect.top;
        const relativeBottomCss = relativeTopCss + rect.height;
        if (relativeBottomCss <= clipTopCss || relativeTopCss >= clipBottomCss) return;

        const clippedTopCss = Math.max(relativeTopCss, clipTopCss);
        const clippedBottomCss = Math.min(relativeBottomCss, clipBottomCss);
        const x = renderX + (rect.left - sectionRect.left) * scaleX;
        const y = renderY + (clippedTopCss - clipTopCss) * scaleY;
        const w = Math.max(rect.width * scaleX, 2);
        const h = Math.max((clippedBottomCss - clippedTopCss) * scaleY, 2);

        if (y + h <= A4_HEIGHT_MM - MARGIN_MM + 0.5) {
          pdf.link(x, y, w, h, { url: href });
        }
      });
    };

    // Reuse a single offscreen canvas for slicing — avoids repeated
    // allocation/GC pressure when many sections need to be split across pages.
    let sliceCanvasReusable: HTMLCanvasElement | null = null;
    const createCanvasSlice = (sourceCanvas: HTMLCanvasElement, sourceY: number, sourceHeight: number) => {
      if (!sliceCanvasReusable) sliceCanvasReusable = document.createElement('canvas');
      const sliceCanvas = sliceCanvasReusable;
      if (sliceCanvas.width !== sourceCanvas.width) sliceCanvas.width = sourceCanvas.width;
      if (sliceCanvas.height !== sourceHeight) sliceCanvas.height = sourceHeight;
      const ctx = sliceCanvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create PDF slice canvas');
      ctx.drawImage(
        sourceCanvas,
        0, sourceY, sourceCanvas.width, sourceHeight,
        0, 0, sourceCanvas.width, sourceHeight,
      );
      return sliceCanvas;
    };

    const addCanvasToPdf = async (
      canvas: HTMLCanvasElement,
      section: HTMLElement,
      sectionRect: DOMRect,
      forcePageStart = false,
    ) => {
      const pageHeightPx = Math.max(1, Math.floor((USABLE_HEIGHT_MM * canvas.width) / CONTENT_WIDTH_MM));
      const fitsInRemaining = (heightMm: number) =>
        currentY + heightMm <= A4_HEIGHT_MM - MARGIN_MM || currentY === MARGIN_MM;

      // FAST PATH: section fits in a single page → no slicing, no extra canvas alloc.
      if (canvas.height <= pageHeightPx) {
        const heightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;
        if (forcePageStart && currentY !== MARGIN_MM) {
          pdf.addPage();
          currentY = MARGIN_MM;
        } else if (!fitsInRemaining(heightMm)) {
          pdf.addPage();
          currentY = MARGIN_MM;
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.6);
        pdf.addImage(imgData, 'JPEG', MARGIN_MM, currentY, CONTENT_WIDTH_MM, heightMm, undefined, 'FAST');
        addSectionLinks(section, sectionRect, canvas, MARGIN_MM, currentY, CONTENT_WIDTH_MM, heightMm, 0, canvas.height);
        currentY += heightMm + SECTION_GAP_MM;
        return;
      }

      // SLICING PATH: section spans multiple pages.
      let sliceTopPx = 0;
      let isFirstSlice = true;
      let sliceIndex = 0;
      const totalSlices = Math.max(1, Math.ceil(canvas.height / pageHeightPx));
      while (sliceTopPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sliceTopPx);
        const sliceHeightMm = (sliceHeightPx * CONTENT_WIDTH_MM) / canvas.width;

        if (forcePageStart && isFirstSlice && currentY !== MARGIN_MM) {
          pdf.addPage();
          currentY = MARGIN_MM;
        } else if (!isFirstSlice) {
          pdf.addPage();
          currentY = MARGIN_MM;
        } else if (currentY + sliceHeightMm > A4_HEIGHT_MM - MARGIN_MM && currentY > MARGIN_MM) {
          pdf.addPage();
          currentY = MARGIN_MM;
        }

        const sliceCanvas = createCanvasSlice(canvas, sliceTopPx, sliceHeightPx);
        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.6);
        pdf.addImage(imgData, 'JPEG', MARGIN_MM, currentY, CONTENT_WIDTH_MM, sliceHeightMm, undefined, 'FAST');
        addSectionLinks(section, sectionRect, canvas, MARGIN_MM, currentY, CONTENT_WIDTH_MM, sliceHeightMm, sliceTopPx, sliceHeightPx);

        currentY += sliceHeightMm + SECTION_GAP_MM;
        sliceTopPx += sliceHeightPx;
        isFirstSlice = false;
        sliceIndex += 1;
        if (totalSlices > 8 && sliceIndex % 6 === 0) {
          onProgress?.(50 + Math.min(28, Math.round((sliceIndex / totalSlices) * 28)));
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    };

    const renderFallbackCanvas = (section: HTMLElement, index: number): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = 794;
      canvas.height = section.hasAttribute('data-pdf-day-section') ? 420 : 180;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create fallback PDF canvas');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0d9488';
      ctx.fillRect(0, 0, canvas.width, 8);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`ASEEL AI TRIP`, 32, 56);
      ctx.font = '18px Arial';
      const text = (section.textContent || `Itinerary section ${index + 1}`).replace(/\s+/g, ' ').trim();
      const words = text.split(' ').slice(0, 180);
      let line = '';
      let y = 96;
      ctx.fillStyle = '#334155';
      ctx.font = '16px Arial';
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > canvas.width - 64) {
          ctx.fillText(line, 32, y);
          line = word;
          y += 24;
        } else {
          line = test;
        }
      });
      if (line && y < canvas.height - 24) ctx.fillText(line, 32, y);
      return canvas;
    };

    // Concurrency tuned to hardware. html2canvas is the bottleneck; running
    // more in parallel reduces wall-time linearly until we hit memory limits.
    // For 100-day exports we want maximum throughput without OOM.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const sectionCount = renderSections.length;
    const isLong = sectionCount > 30;
    const isHuge = sectionCount > 80;
    const isMassive = sectionCount > 150;
    const hwConcurrency = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) || 4;
    const desktopBatch = Math.min(4, Math.max(2, hwConcurrency));
    const batchSize = isMobile
      ? 1
      : (isLong ? desktopBatch : Math.min(4, Math.max(2, hwConcurrency)));
    const renderScale = isMobile
      ? (isMassive ? 0.5 : isHuge ? 0.56 : isLong ? 0.64 : 0.78)
      : (isMassive ? 0.7 : isHuge ? 0.78 : isLong ? 0.85 : 0.92);

    // Pre-compute section bounding rects in a single read pass to avoid
    // layout thrash later (each html2canvas call already triggers reflow).
    const sectionRects = new Map<HTMLElement, DOMRect>();
    for (const s of renderSections) sectionRects.set(s, s.getBoundingClientRect());

    for (let i = 0; i < renderSections.length; i += batchSize) {
      onProgress?.(50 + Math.min(28, Math.floor((i / Math.max(renderSections.length, 1)) * 28)));
      const batch = renderSections.slice(i, i + batchSize);
      const batchRendered = await Promise.all(
        batch.map(async (section, batchIndex) => {
          const sectionIndex = i + batchIndex;
          const renderPromise = html2canvas(section, {
            scale: renderScale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: section.scrollWidth,
            windowWidth: section.scrollWidth,
            scrollX: 0,
            scrollY: 0,
            imageTimeout: 120,
            removeContainer: true,
            foreignObjectRendering: false,
          });
          const timeoutMs = isMobile ? 9000 : 14000;
          const canvas = await Promise.race([
            renderPromise,
            new Promise<HTMLCanvasElement>((resolve) =>
              setTimeout(() => resolve(renderFallbackCanvas(section, sectionIndex)), timeoutMs),
            ),
          ]);
          return { section, canvas, sectionRect: sectionRects.get(section) || section.getBoundingClientRect() };
        })
      );
      for (const { section, canvas, sectionRect } of batchRendered) {
        const isDayHeader = section.getAttribute('data-pdf-section') !== null
          && /اليوم|Day\s*\d/i.test(section.textContent || '')
          && (section.parentElement?.hasAttribute('data-pdf-day-section') || false);
        if (isDayHeader && currentY > MARGIN_MM && (A4_HEIGHT_MM - MARGIN_MM - currentY) < 60) {
          pdf.addPage();
          currentY = MARGIN_MM;
        }
        await addCanvasToPdf(canvas, section, sectionRect, false);
        canvas.width = 1;
        canvas.height = 1;
      }
      onProgress?.(50 + Math.min(30, Math.round(((i + batch.length) / renderSections.length) * 30)));
      // Yield to the browser only on very long exports, and only every 5 batches —
      // keeps UI responsive without adding measurable wall-time on short exports.
      if (isHuge && (i / batchSize) % 5 === 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    if (sliceCanvasReusable) {
      sliceCanvasReusable.width = 1;
      sliceCanvasReusable.height = 1;
      sliceCanvasReusable = null;
    }

    return pdf;
  } finally {
    element.style.width = origStyles.width;
    element.style.backgroundColor = origStyles.backgroundColor;
    element.style.direction = origStyles.direction;
  }
};
