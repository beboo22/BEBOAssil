
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AddConnectionButtonProps {
  onClick: () => void;
}

const AddConnectionButton = ({ onClick }: AddConnectionButtonProps) => {
  const { t } = useTranslation();
  return (
    <Button 
      size="sm" 
      variant="outline" 
      className="h-8 rounded-md gap-1.5" 
      onClick={onClick}
      title={t('mapConnection.addTitle')}
    >
      <Plus className="h-3 w-3" />
      <span className="text-xs">{t('mapConnection.addTitle')}</span>
    </Button>
  );
};

export default AddConnectionButton;
