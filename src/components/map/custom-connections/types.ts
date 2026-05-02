
export interface StepConnection {
  id: string;
  fromIndex: number;
  toIndex: number;
  name: string;
}

export interface CustomConnectionsProps {
  mapActivitiesLength: number;
  customConnections: StepConnection[];
  setCustomConnections: (connections: StepConnection[]) => void;
  visibleSteps: number[];
  recalculateVisibleMarkers: (steps: number[], connections: StepConnection[]) => void;
  getStepNumberFromConnection: (connection: StepConnection) => number;
  activities?: any[];
}
