
import { Polyline, Tooltip } from "react-leaflet";
import { Activity } from "@/utils/mapUtils";
import { Route } from "lucide-react";

// Define the custom connection type
interface StepConnection {
  id: string;
  fromIndex: number;
  toIndex: number;
  name: string;
}

interface MapRouteLinesProps {
  activities: Activity[];
  visibleSteps?: number[]; // Control which steps are visible
  customConnections?: StepConnection[]; // Add custom connections
  getStepNumberFromConnection?: (connection: StepConnection) => number; // Helper function
}

const MapRouteLines = ({ 
  activities, 
  visibleSteps,
  customConnections = [],
  getStepNumberFromConnection
}: MapRouteLinesProps) => {
  // Filter activities to only those with coordinates
  const validActivities = activities.filter(
    (activity): activity is Activity & { coordinates: [number, number] } => 
      !!activity.coordinates
  );
  
  // If there are less than 2 activities with coordinates, we can't draw a route
  if (validActivities.length < 2 && customConnections.length === 0) {
    console.log("Not enough activities with coordinates to draw route lines");
    return null;
  }
  
  // If visibleSteps is defined but empty, don't draw any lines
  if (visibleSteps && visibleSteps.length === 0) {
    return null;
  }
  
  console.log("Drawing route lines between", validActivities.length, "points");
  
  // Different colors for different segments
  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];
  
  // Create route segments between consecutive points
  const routeSegments = [];
  
  // Add standard route segments
  for (let i = 0; i < validActivities.length - 1; i++) {
    const startPoint = validActivities[i].coordinates;
    const endPoint = validActivities[i + 1].coordinates;
    const segmentNumber = i + 1;
    
    // Skip this segment if it's not in the visibleSteps array (when specified)
    if (visibleSteps && !visibleSteps.includes(segmentNumber)) {
      continue;
    }
    
    // Calculate position for the segment number (midpoint of the line)
    const midLat = (startPoint[0] + endPoint[0]) / 2;
    const midLng = (startPoint[1] + endPoint[1]) / 2;
    
    const color = colors[i % colors.length];
    
    routeSegments.push(
      <Polyline 
        key={`route-segment-${i}`}
        positions={[startPoint, endPoint]}
        // @ts-ignore - TypeScript definitions don't match component props
        pathOptions={{
          color: color,
          weight: 3,
          opacity: 0.8,
          dashArray: "5, 10" // Creates a dashed line
        }}
      >
        {/* @ts-ignore - TypeScript definitions don't match component props */}
        <Tooltip permanent direction="center" className="route-segment-tooltip">
          <div className="bg-white p-1 rounded-full shadow-md">
            <span className="text-xs font-bold">Step {segmentNumber}</span>
          </div>
        </Tooltip>
      </Polyline>
    );
  }
  
  // Add custom connection segments
  if (customConnections && customConnections.length > 0) {
    customConnections.forEach((connection, index) => {
      // Only draw connections that should be visible
      const connStepNumber = getStepNumberFromConnection ? 
        getStepNumberFromConnection(connection) : validActivities.length + index;
        
      if (visibleSteps && !visibleSteps.includes(connStepNumber)) {
        return;
      }
      
      // Make sure we have valid coordinates for both points
      if (connection.fromIndex < 0 || connection.fromIndex >= validActivities.length ||
          connection.toIndex < 0 || connection.toIndex >= validActivities.length) {
        return;
      }
      
      const startPoint = validActivities[connection.fromIndex].coordinates;
      const endPoint = validActivities[connection.toIndex].coordinates;
      
      if (!startPoint || !endPoint) {
        return; // Skip if coordinates are missing
      }
      
      // Calculate position for the segment name (midpoint of the line)
      const midLat = (startPoint[0] + endPoint[0]) / 2;
      const midLng = (startPoint[1] + endPoint[1]) / 2;
      
      // Use a distinct color for custom connections
      const customColors = ["#059669", "#d946ef", "#f97316", "#06b6d4", "#a855f7"];
      const color = customColors[index % customColors.length];
      
      routeSegments.push(
        <Polyline 
          key={`custom-route-${connection.id}`}
          positions={[startPoint, endPoint]}
          // @ts-ignore - TypeScript definitions don't match component props
          pathOptions={{
            color: color,
            weight: 3,
            opacity: 0.8,
            dashArray: "2, 8" // Creates a different dashed line pattern
          }}
        >
          {/* @ts-ignore - TypeScript definitions don't match component props */}
          <Tooltip permanent direction="center" className="route-segment-tooltip">
            <div className="bg-white p-1 rounded-full shadow-md">
              <span className="text-xs font-bold">{connection.name}</span>
            </div>
          </Tooltip>
        </Polyline>
      );
    });
  }
  
  return (
    <>
      {routeSegments}
    </>
  );
};

export default MapRouteLines;
