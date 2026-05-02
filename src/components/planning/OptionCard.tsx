
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface OptionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}

const OptionCard = ({ icon: Icon, title, description, isSelected, onClick }: OptionCardProps) => {
  return (
    <motion.div 
      whileHover={{ scale: 1.03 }}
      className={`rounded-lg p-4 border-2 cursor-pointer transition-colors
        ${isSelected ? 'border-travel-blue bg-travel-blue-bg' : 'border-gray-200'}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-2">
        <Icon className={`h-5 w-5 ${isSelected ? 'text-travel-blue' : 'text-gray-400'}`} />
        <div className={`h-5 w-5 rounded-full border flex items-center justify-center 
          ${isSelected ? 'border-travel-blue bg-travel-blue' : 'border-gray-300'}`}>
          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-white"></span>}
        </div>
      </div>
      <p className="font-medium text-center">{title}</p>
      <p className="text-xs text-gray-500 text-center mt-1">{description}</p>
    </motion.div>
  );
};

export default OptionCard;
