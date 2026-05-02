import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Heart, MessageCircle, ExternalLink, Navigation, CalendarClock, Clock3, Map as MapIcon } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { enrichItineraryWithActivityMedia } from "@/utils/storyTrip";

interface Story {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  likes_count: number;
  comments_count?: number;
  media_urls?: string[];
  trip_data?: any;
  profiles?: { full_name?: string; avatar_url?: string };
  user_id?: string;
}

interface StoryMapViewProps {
  stories: Story[];
  onStoryClick: (story: Story) => void;
}

interface StoryMapPoint {
  id: string;
  story: Story;
  latitude: number;
  longitude: number;
  title: string;
  locationLabel?: string;
  mediaUrl?: string;
  summary?: string;
  timeLabel?: string;
  pointType: "activity" | "story";
  dayLabel?: string;
}

const normalizePopupSummary = (value: unknown, maxLength = 120) => {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[📍📌⏰]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
};

const normalizeLocationLabel = (value: unknown, maxLength = 88) => {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[📍📌⏰]/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
};

const extractClock = (rawValue: unknown): string | null => {
  if (typeof rawValue !== "string") return null;
  const match = rawValue.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
};

const getActivityTimeLabel = (activity: any): string | undefined => {
  const start = extractClock(activity?.startTime);
  const end = extractClock(activity?.endTime);
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (end) return end;

  const fallbackCandidates = [
    activity?.time,
    activity?.visitTime,
    activity?.visit_time,
    activity?.hours,
    activity?.opening_hours,
  ];

  for (const value of fallbackCandidates) {
    const extracted = extractClock(value);
    if (extracted) return extracted;
  }

  return undefined;
};

const formatPlanDayLabel = (
  rawDay: unknown,
  dayIndex: number,
  language: string,
  isArabic: boolean
) => {
  const fallback = `${isArabic ? "اليوم" : "Day"} ${dayIndex}`;
  if (!rawDay) return fallback;

  const raw = String(rawDay).trim();
  if (!raw) return fallback;

  // 🧹 Clean up raw ISO timestamps or malformed date strings
  const sanitized = raw
    .split('T')[0] // Get only date part if it contains T
    .replace(/[^\w\s-]/g, (m) => (m === '-' || m === '/' || m === '.' ? m : '')) // Remove special chars but Keep separators
    .trim();

  // Try to parse as Date
  const parsedDate = new Date(sanitized);
  
  if (!Number.isNaN(parsedDate.getTime())) {
    try {
      return new Intl.DateTimeFormat(language || "ar-SA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(parsedDate);
    } catch (e) {
      // Fallback if Intl fails
      return sanitized;
    }
  }

  return fallback;
};

const createStoryIcon = (imageUrl?: string, pointType: "activity" | "story" = "story") =>
  new L.DivIcon({
    className: "story-map-marker",
    html: `<div style="width:46px;height:46px;border-radius:999px;border:3px solid ${
      pointType === "activity" ? "hsl(var(--accent))" : "hsl(var(--primary))"
    };overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,0.28);background:hsl(var(--muted));">
      ${
        imageUrl
          ? `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;" />`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:hsl(var(--foreground));font-size:18px;">📍</div>`
      }
    </div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 46],
    popupAnchor: [0, -46],
  });

export const StoryMapView = ({ stories, onStoryClick }: StoryMapViewProps) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith("ar");

  const points = useMemo<StoryMapPoint[]>(() => {
    return stories.flatMap((story) => {
      const itinerary = enrichItineraryWithActivityMedia(story.trip_data);

      const activityPoints: StoryMapPoint[] = itinerary.flatMap((day: any, dayIndex: number) =>
        (Array.isArray(day?.activities) ? day.activities : [])
          .map((activity: any, activityIndex: number) => {
            const lat = Number(activity?.latitude);
            const lng = Number(activity?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            const mediaUrl = Array.isArray(activity?.media) && activity.media.length > 0
              ? activity.media[0]
              : story.media_urls?.[0];

            return {
              id: `${story.id}-a-${dayIndex}-${activityIndex}`,
              story,
              latitude: lat,
              longitude: lng,
              title: activity?.name || activity?.title || story.title,
              locationLabel: normalizeLocationLabel(activity?.location || activity?.address || story.location_name),
              mediaUrl,
              summary: normalizePopupSummary(activity?.description || activity?.notes),
              timeLabel: getActivityTimeLabel(activity),
              pointType: "activity",
              dayLabel: formatPlanDayLabel(day?.date, dayIndex + 1, i18n.language, isArabic),
            } as StoryMapPoint;
          })
          .filter(Boolean) as StoryMapPoint[]
      );

      if (activityPoints.length > 0) return activityPoints;

      if (Number.isFinite(story.latitude) && Number.isFinite(story.longitude)) {
        return [
          {
            id: `${story.id}-story`,
            story,
            latitude: Number(story.latitude),
            longitude: Number(story.longitude),
            title: story.title,
            locationLabel: normalizeLocationLabel(story.location_name),
            mediaUrl: story.media_urls?.[0],
            summary: normalizePopupSummary(story.content),
            pointType: "story",
          },
        ];
      }

      return [];
    });
  }, [stories, isArabic, i18n.language]);

  if (points.length === 0) {
    return (
      <Card className="p-12 text-center bg-card border-border rounded-2xl">
        <MapPin className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {isArabic ? "لا توجد مواقع للقصص بعد" : "No mapped story locations yet"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isArabic
            ? "اربط القصة أو الفعالية بموقع لتظهر تلقائيًا على الخريطة"
            : "Tag stories or activities with location to show them on the map"}
        </p>
      </Card>
    );
  }

  const centerLat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const centerLng = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;

  return (
    <Card className="overflow-hidden border-border rounded-2xl">
      <MapContainer
        // @ts-ignore
        center={[centerLat, centerLng]}
        zoom={4}
        style={{ height: "70dvh", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          // @ts-ignore
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points.map((point) => (
          <Marker
            key={point.id}
            // @ts-ignore
            position={[point.latitude, point.longitude]}
            // @ts-ignore
            icon={createStoryIcon(point.mediaUrl, point.pointType)}
          >
            <Popup
              // @ts-ignore
              className="story-popup"
              maxWidth={330}
            >
              <div 
                dir={isArabic ? "rtl" : "ltr"}
                style={{ 
                  width: 290, 
                  fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif",
                  textAlign: isArabic ? "right" : "left",
                  padding: "4px 2px"
                }}
              >
                {point.mediaUrl && (
                  <div style={{ position: "relative", margin: "-12px -20px 14px", overflow: "hidden", borderRadius: "14px 14px 0 0", boxShadow: "0 4px 15px rgba(0,0,0,0.1)" }}>
                    <img src={point.mediaUrl} alt={point.title} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} loading="lazy" />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }} />
                    <div style={{ position: "absolute", top: 12, [isArabic ? "right" : "left"]: 12, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", borderRadius: 24, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#0d9488", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                      {point.pointType === "activity" ? (isArabic ? "فعالية" : "Activity") : (isArabic ? "قصة" : "Story")}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#0d9488", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.025em", opacity: 0.85 }}>
                      {point.pointType === "activity"
                        ? isArabic
                          ? "فعالية مرتبطة بالخطة"
                          : "Plan linked activity"
                        : isArabic
                        ? "قصة مسافر"
                        : "Traveler Story"}
                    </p>
                    <h4 style={{ 
                      fontSize: 18, 
                      fontWeight: 800, 
                      color: "#111827", 
                      lineHeight: 1.25, 
                      margin: 0, 
                      display: "-webkit-box", 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: "vertical", 
                      overflow: "hidden" 
                    }}>
                      {point.title}
                    </h4>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {point.dayLabel && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 30, background: "#f0fdf9", border: "1px solid #ccfbf1", padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#0f766e" }}>
                        <CalendarClock style={{ width: 14, height: 14 }} />
                        {point.dayLabel}
                      </span>
                    )}
                    {point.timeLabel && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 30, background: "#f0f9ff", border: "1px solid #e0f2fe", padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#0369a1" }}>
                        <Clock3 style={{ width: 14, height: 14 }} />
                        {point.timeLabel}
                      </span>
                    )}
                  </div>

                  {point.locationLabel && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 14, border: "1px solid #f3f4f6", background: "#f9fafb", padding: "10px 12px", marginTop: 2 }}>
                      <Navigation style={{ width: 16, height: 16, marginTop: 2, color: "#0d9488", flexShrink: 0, transform: isArabic ? "scaleX(-1)" : "none" }} />
                      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>{point.locationLabel}</p>
                    </div>
                  )}

                  {point.summary && (
                    <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "2px 2px", fontWeight: 400 }}>{point.summary}</p>
                  )}

                  <div style={{ height: "1px", background: "#f3f4f6", margin: "4px 0" }} />

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                      onClick={() => point.story.user_id && !point.story.user_id.startsWith("demo") && navigate(`/profile/${point.story.user_id}`)}
                    >
                      <div style={{ position: "relative" }}>
                        <img
                          src={point.story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${point.story.user_id || point.story.id}`}
                          alt={point.story.profiles?.full_name || (isArabic ? "مسافر" : "Traveler")}
                          style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
                        />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>
                        {point.story.profiles?.full_name || (isArabic ? "مسافر" : "Traveler")}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart style={{ width: 15, height: 15, color: "#ef4444" }} />{point.story.likes_count}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle style={{ width: 15, height: 15, color: "#3b82f6" }} />{point.story.comments_count || 0}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    <button
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, height: 42, borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)", transition: "all 0.2s" }}
                      onClick={() => onStoryClick(point.story)}
                    >
                      <ExternalLink style={{ width: 16, height: 16 }} />
                      {isArabic ? "عرض التفاصيل" : "View Details"}
                    </button>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&hl=${i18n.language?.split("-")[0] || "ar"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700, height: 42, borderRadius: 12, border: "1px solid #e5e7eb", cursor: "pointer", background: "#fff", color: "#374151", textDecoration: "none", boxShadow: "0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s" }}
                    >
                      <Navigation style={{ width: 16, height: 16, transform: isArabic ? "scaleX(-1)" : "none" }} />
                      {isArabic ? "الاتجاهات" : "Directions"}
                    </a>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </Card>
  );
};
