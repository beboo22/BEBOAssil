import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';

interface Story {
  id: string;
  title: string;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  likes_count: number;
  media_urls?: string[];
  profiles?: { full_name?: string };
}

interface StoryHeatmapProps {
  stories: Story[];
}

interface HeatPoint {
  lat: number;
  lng: number;
  count: number;
  location: string;
  topStory: Story;
}

function getHeatColor(intensity: number): string {
  if (intensity > 0.75) return '#ef4444';
  if (intensity > 0.5) return '#f97316';
  if (intensity > 0.25) return '#eab308';
  return '#3b82f6';
}

export const StoryHeatmap = ({ stories }: StoryHeatmapProps) => {
  const { t } = useTranslation();

  const heatPoints = useMemo(() => {
    const geoStories = stories.filter(s => s.latitude && s.longitude);
    const groups: Record<string, Story[]> = {};

    geoStories.forEach(story => {
      const key = `${Math.round(story.latitude! * 10) / 10},${Math.round(story.longitude! * 10) / 10}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(story);
    });

    const points: HeatPoint[] = Object.entries(groups).map(([, group]) => {
      const avgLat = group.reduce((s, st) => s + (st.latitude || 0), 0) / group.length;
      const avgLng = group.reduce((s, st) => s + (st.longitude || 0), 0) / group.length;
      const topStory = group.sort((a, b) => b.likes_count - a.likes_count)[0];
      return { lat: avgLat, lng: avgLng, count: group.length, location: topStory.location_name || '', topStory };
    });

    return points;
  }, [stories]);

  const maxCount = Math.max(...heatPoints.map(p => p.count), 1);

  if (heatPoints.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-12 text-center">
          <Flame className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">
            {t('heatmap.noData')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('heatmap.addLocation')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const centerLat = heatPoints.reduce((s, p) => s + p.lat, 0) / heatPoints.length;
  const centerLng = heatPoints.reduce((s, p) => s + p.lng, 0) / heatPoints.length;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="w-5 h-5 text-orange-500" />
          {t('heatmap.title')}
          <Badge variant="secondary" className="text-xs">{heatPoints.length} {t('heatmap.spots')}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center gap-4 px-4 pb-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" />{t('heatmap.low')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" />{t('heatmap.medium')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" />{t('heatmap.high')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" />{t('heatmap.hot')}</span>
        </div>

        <MapContainer
          // @ts-ignore
          center={[centerLat, centerLng]}
          zoom={2}
          style={{ height: '400px', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            // @ts-ignore
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {heatPoints.map((point, i) => {
            const intensity = point.count / maxCount;
            const radius = 10 + intensity * 30;
            const color = getHeatColor(intensity);
            return (
              <CircleMarker
                key={i}
                // @ts-ignore
                center={[point.lat, point.lng]}
                // @ts-ignore
                radius={radius}
                // @ts-ignore
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.4 + intensity * 0.4,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="p-1 max-w-[200px]">
                    {point.topStory.media_urls?.[0] && (
                      <img src={point.topStory.media_urls[0]} alt="" className="w-full h-20 object-cover rounded-md mb-2" />
                    )}
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3 text-primary" />
                      <span className="font-bold text-sm">{point.location}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {point.count} {point.count === 1 ? t('heatmap.story') : t('heatmap.stories')}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </CardContent>
    </Card>
  );
};
