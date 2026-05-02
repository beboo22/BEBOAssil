import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Hash, X, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface HashtagSystemProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  mode?: 'edit' | 'filter';
}

const POPULAR_HASHTAGS = [
  'travel', 'wanderlust', 'adventure', 'nature', 'beach', 'mountains',
  'sunset', 'food', 'culture', 'photography', 'roadtrip', 'backpacking',
  'luxury', 'budget', 'family', 'solo', 'honeymoon', 'diving',
];

const TOPIC_CATEGORIES = [
  { id: 'sports', emoji: '⚽', label: 'Sports', labelAr: 'رياضة' },
  { id: 'swimming', emoji: '🏊', label: 'Swimming', labelAr: 'سباحة' },
  { id: 'hiking', emoji: '🥾', label: 'Hiking', labelAr: 'مشي' },
  { id: 'food', emoji: '🍽️', label: 'Food', labelAr: 'طعام' },
  { id: 'shopping', emoji: '🛍️', label: 'Shopping', labelAr: 'تسوق' },
  { id: 'nightlife', emoji: '🌃', label: 'Nightlife', labelAr: 'حياة ليلية' },
  { id: 'history', emoji: '🏛️', label: 'History', labelAr: 'تاريخ' },
  { id: 'art', emoji: '🎨', label: 'Art', labelAr: 'فن' },
  { id: 'wellness', emoji: '🧘', label: 'Wellness', labelAr: 'استرخاء' },
  { id: 'wildlife', emoji: '🦁', label: 'Wildlife', labelAr: 'حياة برية' },
  { id: 'photography', emoji: '📷', label: 'Photography', labelAr: 'تصوير' },
  { id: 'camping', emoji: '⛺', label: 'Camping', labelAr: 'تخييم' },
];

export { TOPIC_CATEGORIES };

export const HashtagSystem: React.FC<HashtagSystemProps> = ({
  selectedTags, onTagsChange, selectedTopics, onTopicsChange, mode = 'edit'
}) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [tagInput, setTagInput] = useState('');

  const addTag = (tag: string) => {
    const clean = tag.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '').toLowerCase();
    if (clean && !selectedTags.includes(clean)) {
      onTagsChange([...selectedTags, clean]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => onTagsChange(selectedTags.filter(t => t !== tag));

  const toggleTopic = (topicId: string) => {
    onTopicsChange(
      selectedTopics.includes(topicId)
        ? selectedTopics.filter(t => t !== topicId)
        : [...selectedTopics, topicId]
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          {isArabic ? '📂 المواضيع' : '📂 Topics'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_CATEGORIES.map(topic => (
            <motion.button key={topic.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => toggleTopic(topic.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                selectedTopics.includes(topic.id)
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border hover:border-primary/40'
              }`}>
              <span>{topic.emoji}</span>
              {isArabic ? topic.labelAr : topic.label}
            </motion.button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Hash className="w-3 h-3" />
          {isArabic ? 'هاشتاقات' : 'Hashtags'}
        </p>
        {mode === 'edit' && (
          <div className="flex gap-2 mb-2">
            <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
              placeholder={isArabic ? 'أضف هاشتاق...' : 'Add hashtag...'} className="h-8 text-xs rounded-lg" />
          </div>
        )}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 text-xs px-2.5 py-0.5 rounded-full">
                #{tag}
                {mode === 'edit' && (
                  <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                )}
              </Badge>
            ))}
          </div>
        )}
        {mode === 'edit' && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />{isArabic ? 'شائعة' : 'Trending'}
            </p>
            <div className="flex flex-wrap gap-1">
              {POPULAR_HASHTAGS.filter(h => !selectedTags.includes(h)).slice(0, 12).map(tag => (
                <button key={tag} onClick={() => addTag(tag)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Clickable tags displayed in story cards/feed/viewer
export const StoryTags: React.FC<{ 
  hashtags?: string[]; 
  topics?: string[]; 
  locationName?: string;
  onHashtagClick?: (tag: string) => void;
  onTopicClick?: (topic: string) => void;
  onLocationClick?: (location: string) => void;
}> = ({ hashtags = [], topics = [], locationName, onHashtagClick, onTopicClick, onLocationClick }) => {
  const navigate = useNavigate();
  const topicMap = Object.fromEntries(TOPIC_CATEGORIES.map(t => [t.id, t]));

  const handleHashtagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onHashtagClick) { onHashtagClick(tag); return; }
    navigate(`/stories?search=%23${tag}`);
  };

  const handleTopicClick = (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation();
    if (onTopicClick) { onTopicClick(topicId); return; }
    navigate(`/stories?topic=${topicId}`);
  };

  const handleLocationClick = (e: React.MouseEvent, loc: string) => {
    e.stopPropagation();
    if (onLocationClick) { onLocationClick(loc); return; }
    navigate(`/stories?search=${encodeURIComponent(loc)}`);
  };

  if (!hashtags.length && !topics.length && !locationName) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {topics.map(t => {
        const topic = topicMap[t];
        return topic ? (
          <button key={t} onClick={(e) => handleTopicClick(e, t)}
            className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer">
            {topic.emoji} {topic.label}
          </button>
        ) : null;
      })}
      {hashtags.map(tag => (
        <button key={tag} onClick={(e) => handleHashtagClick(e, tag)}
          className="text-[10px] text-accent/90 font-medium hover:text-accent hover:underline active:scale-95 transition-all cursor-pointer">
          #{tag}
        </button>
      ))}
      {locationName && (
        <button onClick={(e) => handleLocationClick(e, locationName)}
          className="text-[10px] text-accent/90 font-medium hover:text-accent hover:underline active:scale-95 transition-all cursor-pointer">
          @{locationName}
        </button>
      )}
    </div>
  );
};
