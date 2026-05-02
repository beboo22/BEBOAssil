
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Pen, Map as MapIcon } from "lucide-react";
import { StepConnection } from "./custom-connections/types";
import CustomConnections from "./custom-connections/CustomConnections";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

interface StepControlsProps {
  mapActivitiesLength: number;
  customConnections: StepConnection[];
  setCustomConnections: (connections: StepConnection[]) => void;
  visibleSteps: number[];
  showAllSteps: boolean;
  toggleStep: (step: number) => void;
  toggleAllSteps: () => void;
  isEditingConnections: boolean;
  setIsEditingConnections: (value: boolean) => void;
  recalculateVisibleMarkers: (steps: number[], connections: StepConnection[]) => void;
  getStepNumberFromConnection: (connection: StepConnection) => number;
  activities?: any[];
}

const StepControls = ({
  mapActivitiesLength,
  customConnections,
  setCustomConnections,
  visibleSteps,
  showAllSteps,
  toggleStep,
  toggleAllSteps,
  isEditingConnections,
  setIsEditingConnections,
  recalculateVisibleMarkers,
  getStepNumberFromConnection,
  activities
}: StepControlsProps) => {
  const { t } = useTranslation();
  const stepControls = [];
  
  // Prevent propagation on the edit container
  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    return false;
  }, []);
  
  // Add standard steps
  for (let i = 1; i <= mapActivitiesLength - 1; i++) {
    stepControls.push(
      <Toggle
        key={`step-${i}`}
        pressed={visibleSteps.includes(i)}
        onPressedChange={() => toggleStep(i)}
        variant="outline"
        className={`step-toggle ${
          visibleSteps.includes(i) ? "active" : ""
        }`}
      >
        {i}
      </Toggle>
    );
  }
  
  // Add custom connection steps
  customConnections.forEach((conn, index) => {
    const stepNumber = mapActivitiesLength + index;
    stepControls.push(
      <Toggle
        key={`custom-step-${conn.id}`}
        pressed={visibleSteps.includes(stepNumber)}
        onPressedChange={() => toggleStep(stepNumber)}
        variant="outline"
        className={`step-toggle ${
          visibleSteps.includes(stepNumber) ? "active" : ""
        }`}
        title={conn.name}
      >
        {conn.name.charAt(0)}
      </Toggle>
    );
  });

  return (
    <div className="bg-card p-3 rounded-lg shadow border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-foreground flex items-center">
          <MapIcon className="h-4 w-4 ml-2" />
          {t("mapConnection.controlsTitle", { defaultValue: "Route Steps Control" })}
        </h3>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant={isEditingConnections ? "default" : "outline"}
            onClick={() => setIsEditingConnections(!isEditingConnections)}
            className="text-xs"
          >
            <Pen className="h-3 w-3 ml-1" />
            {isEditingConnections
              ? t("mapConnection.doneEditing", { defaultValue: "Done" })
              : t("mapConnection.editSteps", { defaultValue: "Edit Steps" })}
          </Button>
          <Button 
            size="sm" 
            variant={showAllSteps ? "default" : "outline"}
            onClick={toggleAllSteps}
            className="text-xs"
          >
            {showAllSteps
              ? t("mapConnection.hideAll", { defaultValue: "Hide All" })
              : t("mapConnection.showAll", { defaultValue: "Show All" })}
          </Button>
        </div>
      </div>
      
      <div 
        className="flex flex-wrap gap-2 items-center" 
        onClick={isEditingConnections ? stopPropagation : undefined}
        onMouseDown={isEditingConnections ? stopPropagation : undefined}
        onTouchStart={isEditingConnections ? stopPropagation : undefined}
      >
        {stepControls}
        
        {isEditingConnections && (
          <div 
            onClick={stopPropagation} 
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            className="w-full mt-2"
          >
            <CustomConnections
              mapActivitiesLength={mapActivitiesLength}
              customConnections={customConnections}
              setCustomConnections={setCustomConnections}
              visibleSteps={visibleSteps}
              recalculateVisibleMarkers={recalculateVisibleMarkers}
              getStepNumberFromConnection={getStepNumberFromConnection}
              activities={activities}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default StepControls;
