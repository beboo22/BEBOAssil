
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatbotTriggerProps {
  label?: string;
  isItineraryOnly?: boolean;
}

const ChatbotTrigger = ({ 
  label = "Need help planning your trip?",
  isItineraryOnly = false
}: ChatbotTriggerProps) => {
  return (
    <div className="mt-6 text-center">
      <p className="text-sm text-gray-600 mb-2">
        {isItineraryOnly 
          ? "Want to see city options with pricing?" 
          : label}
      </p>
      <Button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('toggleChatbot'))}
        className="flex items-center gap-2 bg-travel-blue hover:bg-travel-blue-dark text-white px-4 py-2 rounded-md"
      >
        <MessageSquare size={18} />
        <span>Chat with our AI travel assistant</span>
      </Button>
    </div>
  );
};

export default ChatbotTrigger;
