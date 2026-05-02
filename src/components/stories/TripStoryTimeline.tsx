import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Calendar, Camera, Clock, ChevronDown, ChevronUp, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface TripStory {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  media_urls?: string[];
  created_at: string;
  profiles?: { full_name?: string; avatar_url?: string };
  trip_data?: any;
}

interface TripStoryTimelineProps {
  tripId: string;
  destination: string;
  onStoryClick?: (storyId: string) => void;
}

export const TripStoryTimeline: React.FC<TripStoryTimelineProps> = ({ tripId, destination, onStoryClick }) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [stories, setStories] = useState<TripStory[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTripStories = async () => {
      setLoading(true);
      // Fetch stories that have this trip linked
      const { data } = await supabase
        .from('travel_stories')
        .select('*, profiles!travel_stories_user_id_fkey(full_name, avatar_url)')
        .order('created_at', { ascending: true });

      // Filter stories linked to this trip
      const linked = (data || []).filter((s: any) => 
        s.trip_data?.linked_trip_id === tripId
      );
      setStories(linked as TripStory[]);
      setLoading(false);
    };
    fetchTripStories();
  }, [tripId]);

  if (loading) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4">
                <div className="w-2 h-2 rounded-full bg-muted mt-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stories.length === 0) return null;

  // Group stories by day
  const groupedByDay: Record<string, TripStory[]> = {};
  stories.forEach(story => {
    const day = new Date(story.created_at).toLocaleDateString(isArabic ? 'ar' : 'en', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!groupedByDay[day]) groupedByDay[day] = [];
    groupedByDay[day].push(story);
  });

  return (
    <Card className="border-border/50 bg-card overflow-hidden">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            {isArabic ? `قصة الرحلة: ${destination}` : `Trip Story: ${destination}`}
            <Badge variant="secondary" className="text-xs">{stories.length}</Badge>
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardContent className="pt-0 pb-6">
              <div className="space-y-6">
                {Object.entries(groupedByDay).map(([day, dayStories], dayIdx) => (
                  <div key={day}>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{day}</span>
                      <Badge variant="outline" className="text-xs">
                        {isArabic ? `يوم ${dayIdx + 1}` : `Day ${dayIdx + 1}`}
                      </Badge>
                    </div>

                    <div className={`${isArabic ? 'border-r-2 pr-4 mr-2' : 'border-l-2 pl-4 ml-2'} border-primary/20 space-y-4`}>
                      {dayStories.map((story, i) => (
                        <motion.div
                          key={story.id}
                          initial={{ opacity: 0, x: isArabic ? 10 : -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="relative cursor-pointer group"
                          onClick={() => onStoryClick?.(story.id)}
                        >
                          {/* Timeline dot */}
                          <div className={`absolute top-2 ${isArabic ? '-right-[1.35rem]' : '-left-[1.35rem]'} w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm`} />

                          <div className="bg-muted/30 rounded-xl p-3 group-hover:bg-muted/50 transition-colors">
                            <div className="flex items-start gap-3">
                              {/* Thumbnail */}
                              {story.media_urls && story.media_urls.length > 0 && (
                                <img
                                  src={story.media_urls[0]}
                                  alt=""
                                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                  {story.title}
                                </h4>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{story.content}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(story.created_at).toLocaleTimeString(isArabic ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {story.location_name && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {story.location_name}
                                    </span>
                                  )}
                                  {story.media_urls && story.media_urls.length > 1 && (
                                    <span className="flex items-center gap-1">
                                      <Camera className="w-3 h-3" />
                                      {story.media_urls.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};