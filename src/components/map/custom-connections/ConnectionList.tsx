
import { Button } from "@/components/ui/button";
import { Trash2, Edit } from "lucide-react";
import { StepConnection } from "./types";
import { useTranslation } from "react-i18next";

interface ConnectionListProps {
  customConnections: StepConnection[];
  deleteCustomConnection: (id: string) => void;
  editConnection: (connection: StepConnection) => void;
}

const ConnectionList = ({ 
  customConnections, 
  deleteCustomConnection,
  editConnection
}: ConnectionListProps) => {
  const { t } = useTranslation();

  if (customConnections.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {customConnections.map(connection => (
        <div key={connection.id} className="flex items-center gap-2">
          <div className="bg-muted rounded px-2 py-1 text-xs text-foreground flex-1">
            {connection.name}
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-6 w-6 p-0"
            onClick={() => editConnection(connection)}
            title={t('mapConnection.editConnectionAction', { defaultValue: 'Edit connection' })}
          >
            <Edit className="h-3 w-3" />
            <span className="sr-only">{t('mapConnection.editConnectionAction', { defaultValue: 'Edit connection' })}</span>
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-6 w-6 p-0 text-destructive hover:text-destructive/90"
            onClick={() => deleteCustomConnection(connection.id)}
            title={t('mapConnection.deleteConnectionAction', { defaultValue: 'Delete connection' })}
          >
            <Trash2 className="h-3 w-3" />
            <span className="sr-only">{t('mapConnection.deleteConnectionAction', { defaultValue: 'Delete connection' })}</span>
          </Button>
        </div>
      ))}
    </div>
  );
};

export default ConnectionList;
