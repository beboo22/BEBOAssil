import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Check, Bookmark, Globe, Plane, Mountain, Waves, Utensils, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

interface HighlightGroup {
  id: string;
  name: string;
  icon: string;
  coverImage?: string;
  storyIds: string[];
}

interface Story {
  id: string;
  title: string;
  media_urls?: string[];
  location_name?: string;
}

interface StoryHighlightsProps {
  stories: Story[];
  onViewStory: (index: number) => void;
  userId?: string;
  isOwner?: boolean;
}

const HIGHLIGHT_ICONS = ['🌍', '✈️', '🏖️', '⛰️', '🏙️', '🍽️', '📸', '🎭', '🏕️', '❤️', '⭐', '🎉'];

const DEFAULT_HIGHLIGHTS: HighlightGroup[] = [];

export const StoryHighlights: React.FC<StoryHighlightsProps> = ({ stories, onViewStory, userId, isOwner }) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [highlights, setHighlights] = useState<HighlightGroup[]>(DEFAULT_HIGHLIGHTS);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🌍');
  const [selectedStories, setSelectedStories] = useState<string[]>([]);

  const createHighlight = () => {
    if (!newName.trim()) return;
    const cover = stories.find(s => selectedStories.includes(s.id))?.media_urls?.[0];
    const newHighlight: HighlightGroup = {
      id: `h-${Date.now()}`,
      name: newName,
      icon: selectedIcon,
      coverImage: cover,
      storyIds: selectedStories,
    };
    setHighlights(prev => [...prev, newHighlight]);
    setShowCreate(false);
    setNewName('');
    setSelectedStories([]);
  };

  const handleHighlightClick = (group: HighlightGroup) => {
    const firstStoryId = group.storyIds[0];
    const idx = stories.findIndex(s => s.id === firstStoryId);
    if (idx >= 0) onViewStory(idx);
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar">
        {/* Create new highlight */}
        {isOwner && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center bg-card hover:bg-primary/5 transition-colors">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{isArabic ? 'جديد' : 'New'}</span>
          </motion.button>
        )}

        {highlights.map((group, i) => (
          <motion.button
            key={group.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleHighlightClick(group)}
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-accent via-primary to-emerald-400 shadow-md">
              {group.coverImage ? (
                <img src={group.coverImage} alt={group.name} className="w-full h-full rounded-full object-cover border-2 border-background" />
              ) : (
                <div className="w-full h-full rounded-full bg-card border-2 border-background flex items-center justify-center text-xl">
                  {group.icon}
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-foreground w-16 truncate text-center">{group.name}</span>
          </motion.button>
        ))}
      </div>

      {/* Create Highlight Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-primary" />
              {isArabic ? 'إنشاء مجموعة مميزة' : 'Create Highlight'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={isArabic ? 'اسم المجموعة...' : 'Highlight name...'}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="rounded-xl"
            />
            {/* Icon picker */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">{isArabic ? 'اختر أيقونة' : 'Choose icon'}</p>
              <div className="flex flex-wrap gap-2">
                {HIGHLIGHT_ICONS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setSelectedIcon(icon)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                      selectedIcon === icon ? 'bg-primary/20 ring-2 ring-primary scale-110' : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {/* Story selector */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">{isArabic ? 'اختر القصص' : 'Select stories'}</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {stories.map(story => (
                  <button
                    key={story.id}
                    onClick={() => setSelectedStories(prev => prev.includes(story.id) ? prev.filter(id => id !== story.id) : [...prev, story.id])}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                      selectedStories.includes(story.id) ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {story.media_urls?.[0] && (
                      <img src={story.media_urls[0]} alt="" className="w-8 h-8 rounded-lg object-cover" />
                    )}
                    <span className="flex-1 text-left truncate">{story.title}</span>
                    {selectedStories.includes(story.id) && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createHighlight} disabled={!newName.trim()} className="w-full rounded-xl">
              {isArabic ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
