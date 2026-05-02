
import { useState, useEffect } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { Icon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for marker icons in Leaflet with React
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Import our components and utilities
import MapMarker from "./map/MapMarker";
import MapLoading from "./map/MapLoading";
import ChangeMapCenter from "./map/ChangeMapCenter";
import MapRouteLines from "./map/MapRouteLines";
import StepControls from "./map/StepControls";
import { Activity, processActivitiesWithCoordinates, calculateMapCenter } from "@/utils/mapUtils";
import { useMapSteps } from "@/hooks/useMapSteps";

// Import styles
import "../styles/map.css";

interface ItineraryMapProps {
  activities: Activity[];
  onMarkerClick?: (googleMapsLink: string) => void;
}

const ItineraryMap = ({ activities, onMarkerClick }: ItineraryMapProps) => {
  const [mapActivities, setMapActivities] = useState<Activity[]>([]);
  const [center, setCenter] = useState<LatLngExpression>([0, 0]);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(12);
  
  const {
    visibleSteps,
    showAllSteps,
    visibleMarkers,
    customConnections,
    isEditingConnections,
    setCustomConnections,
    setIsEditingConnections,
    toggleStep,
    toggleAllSteps,
    recalculateVisibleMarkers,
    getStepNumberFromConnection,
    initializeVisibleSteps
  } = useMapSteps(mapActivities.length);

  useEffect(() => {
    (async function init() {
      // @ts-ignore
      delete Icon.Default.prototype._getIconUrl;
      Icon.Default.mergeOptions({
        iconRetinaUrl: iconRetinaUrl,
        iconUrl: iconUrl,
        shadowUrl: shadowUrl,
      });
    })();
  }, []);

  useEffect(() => {
    const loadMapData = async () => {
      console.log("Processing activities for map:", activities.length);
      const activitiesWithCoords = await processActivitiesWithCoordinates(activities);
      console.log("Activities with coordinates:", activitiesWithCoords.length);
      
      const validActivities = activitiesWithCoords.filter(activity => !!activity.coordinates);
      console.log("Valid activities with coordinates:", validActivities.length);
      
      setMapActivities(validActivities);
      
      if (validActivities.length > 0) {
        const mapCenter = calculateMapCenter(validActivities);
        console.log("Map center:", mapCenter);
        setCenter(mapCenter);
        
        if (validActivities.length === 1) {
          setZoom(14);
        } else if (validActivities.length > 5) {
          setZoom(9);
        } else {
          setZoom(11);
        }

        initializeVisibleSteps();
      }
      
      setLoaded(true);
    };
    
    loadMapData();
  }, [activities]);
  
  const handleMarkerClick = (activity: Activity) => {
    if (onMarkerClick && activity.googleMapsLink) {
      console.log("Marker clicked:", activity.title);
      onMarkerClick(activity.googleMapsLink);
    }
  };
  
  if (!loaded) {
    return <MapLoading />;
  }
  
  if (mapActivities.length === 0) {
    console.log("No activities with coordinates to display on map");
    return <MapLoading />;
  }
  
  const maxSteps = mapActivities.length - 1 + customConnections.length;
  const defaultCenter: LatLngExpression = [25.2048, 55.2708];
  console.log("Rendering map with", mapActivities.length, "markers");
  
  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-video rounded-lg overflow-hidden">
        <MapContainer 
          className="h-full w-full"
          // @ts-ignore - TypeScript definitions don't match component props
          center={defaultCenter}
          // @ts-ignore - TypeScript definitions don't match component props
          zoom={zoom}
        >
          <ChangeMapCenter center={center} />
          
          <TileLayer
            // @ts-ignore - TypeScript definitions don't match component props
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            // @ts-ignore - TypeScript definitions don't match component props
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          <MapRouteLines 
            activities={mapActivities} 
            visibleSteps={showAllSteps ? undefined : visibleSteps}
            customConnections={customConnections}
            getStepNumberFromConnection={getStepNumberFromConnection}
          />
          
          {mapActivities.map((activity, index) => (
            visibleMarkers.includes(index) && (
              <MapMarker 
                key={activity.id || `activity-${activity.title}`} 
                activity={activity} 
                onMarkerClick={handleMarkerClick}
                index={index}
              />
            )
          ))}
        </MapContainer>
      </div>
      
      {maxSteps > 0 && (
        <StepControls 
          mapActivitiesLength={mapActivities.length}
          customConnections={customConnections}
          setCustomConnections={setCustomConnections}
          visibleSteps={visibleSteps}
          showAllSteps={showAllSteps}
          toggleStep={toggleStep}
          toggleAllSteps={toggleAllSteps}
          isEditingConnections={isEditingConnections}
          setIsEditingConnections={setIsEditingConnections}
          recalculateVisibleMarkers={recalculateVisibleMarkers}
          getStepNumberFromConnection={getStepNumberFromConnection}
          activities={mapActivities}
        />
      )}
    </div>
  );
};

export default ItineraryMap;
