
import { useState, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { StepConnection, CustomConnectionsProps } from "./types";
import ConnectionForm from "./ConnectionForm";
import ConnectionList from "./ConnectionList";
import AddConnectionButton from "./AddConnectionButton";

interface CustomConnectionsWithActivitiesProps extends CustomConnectionsProps {
  activities?: any[];
}

const CustomConnections = ({
  mapActivitiesLength,
  customConnections,
  setCustomConnections,
  visibleSteps,
  recalculateVisibleMarkers,
  getStepNumberFromConnection,
  activities
}: CustomConnectionsWithActivitiesProps) => {
  const { t } = useTranslation();
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<StepConnection | null>(null);
  
  const deleteCustomConnection = (connectionId: string) => {
    const updatedConnections = customConnections.filter(conn => conn.id !== connectionId);
    setCustomConnections(updatedConnections);
    recalculateVisibleMarkers(visibleSteps, updatedConnections);
    toast.success(t('mapConnection.deleted'));
  };

  const handleEditConnection = (connection: StepConnection) => {
    setEditingConnection(connection);
    setShowConnectionDialog(true);
  };

  const handleCloseDialog = useCallback(() => {
    setShowConnectionDialog(false);
    setTimeout(() => setEditingConnection(null), 300);
  }, []);

  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (open === false) handleCloseDialog();
    else setShowConnectionDialog(true);
  }, [handleCloseDialog]);

  return (
    <>
      <AddConnectionButton onClick={() => setShowConnectionDialog(true)} />
      
      <Sheet open={showConnectionDialog} onOpenChange={handleSheetOpenChange}>
        <SheetContent 
          className="z-[9999] overflow-auto" 
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
        >
          {showConnectionDialog && (
            <div onClick={stopPropagation} onMouseDown={stopPropagation} onTouchStart={stopPropagation} className="h-full">
              <ConnectionForm
                mapActivitiesLength={mapActivitiesLength}
                customConnections={customConnections}
                setCustomConnections={setCustomConnections}
                visibleSteps={visibleSteps}
                recalculateVisibleMarkers={recalculateVisibleMarkers}
                getStepNumberFromConnection={getStepNumberFromConnection}
                onClose={handleCloseDialog}
                editingConnection={editingConnection}
                activities={activities}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
      
      <ConnectionList 
        customConnections={customConnections}
        deleteCustomConnection={deleteCustomConnection}
        editConnection={handleEditConnection}
      />
    </>
  );
};

export default CustomConnections;
