
import { useState } from "react";
import { StepConnection } from "@/components/map/custom-connections/types";

export const useMapSteps = (mapActivitiesLength: number) => {
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [showAllSteps, setShowAllSteps] = useState(true);
  const [visibleMarkers, setVisibleMarkers] = useState<number[]>([]);
  const [customConnections, setCustomConnections] = useState<StepConnection[]>([]);
  const [isEditingConnections, setIsEditingConnections] = useState(false);

  // Helper to get a step number from a connection
  const getStepNumberFromConnection = (connection: StepConnection): number => {
    // We're using the connection's ID index (last part after the hyphen)
    // to determine its step number 
    const connIndex = customConnections.findIndex(conn => conn.id === connection.id);
    return mapActivitiesLength + connIndex;
  };

  // Helper to recalculate which markers should be visible
  const recalculateVisibleMarkers = (steps: number[], connections: StepConnection[]) => {
    if (steps.length === 0) {
      setVisibleMarkers([]);
      return;
    }
    
    const newVisibleMarkers: number[] = [];
    
    // Add markers for standard steps
    steps.forEach(stepNum => {
      if (stepNum < mapActivitiesLength) {
        newVisibleMarkers.push(stepNum - 1);
        newVisibleMarkers.push(stepNum);
      }
    });
    
    // Add markers for custom connections
    connections.forEach(conn => {
      if (steps.includes(getStepNumberFromConnection(conn))) {
        newVisibleMarkers.push(conn.fromIndex);
        newVisibleMarkers.push(conn.toIndex);
      }
    });
    
    setVisibleMarkers([...new Set(newVisibleMarkers)].sort((a, b) => a - b));
  };

  const toggleStep = (step: number) => {
    setShowAllSteps(false);
    let newVisibleSteps: number[];
    
    if (visibleSteps.includes(step)) {
      newVisibleSteps = visibleSteps.filter(s => s !== step);
    } else {
      newVisibleSteps = [...visibleSteps, step].sort((a, b) => a - b);
    }
    
    setVisibleSteps(newVisibleSteps);
    recalculateVisibleMarkers(newVisibleSteps, customConnections);
  };

  const toggleAllSteps = () => {
    if (showAllSteps) {
      setVisibleSteps([]);
      setVisibleMarkers([]);
      setShowAllSteps(false);
    } else {
      const allSteps = Array.from(
        { length: mapActivitiesLength - 1 }, 
        (_, i) => i + 1
      );
      const allMarkers = Array.from(
        { length: mapActivitiesLength },
        (_, i) => i
      );
      
      setVisibleSteps(allSteps);
      setVisibleMarkers(allMarkers);
      setShowAllSteps(true);
    }
  };

  const initializeVisibleSteps = () => {
    const steps = Array.from(
      { length: mapActivitiesLength - 1 }, 
      (_, i) => i + 1
    );
    setVisibleSteps(steps);
    
    const markers = Array.from(
      { length: mapActivitiesLength },
      (_, i) => i
    );
    setVisibleMarkers(markers);
    setShowAllSteps(true);
  };

  return {
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
  };
};
