
import { Marker, Popup } from "react-leaflet";
import { Activity } from "@/utils/mapUtils";
import { MapPin, Clock, ExternalLink, Star, DollarSign, Tag, Navigation } from "lucide-react";
import L from "leaflet";

interface MapMarkerProps {
  activity: Activity;
  onMarkerClick: (activity: Activity) => void;
  index: number;
}

const MapMarker = ({ activity, onMarkerClick, index }: MapMarkerProps) => {
  if (!activity.coordinates) return null;

  const color = getColorForIndex(index);
  const customIcon = new L.DivIcon({
    className: "custom-marker-icon",
    html: `<div class="marker-pin" style="background: linear-gradient(135deg, #${color}, #${getDarkerColor(color)}); box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
             <span class="marker-number">${index + 1}</span>
           </div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  });

  const formatTime = (time: string) => {
    if (!time) return '';
    // Clean up any raw ISO-like dates (e.g. 02T00:00:00.000Z, 2026-01-02T00:00:00)
    if (/T00:00:00/.test(time)) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(time) && !time.includes(' ')) {
      // Full ISO date without meaningful time
      const match = time.match(/T(\d{1,2}:\d{2})/);
      if (match && match[1] !== '00:00') return match[1];
      return '';
    }
    // Extract just HH:MM from any string
    const match = time.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : '';
  };

  const startFormatted = formatTime(activity.startTime);
  const endFormatted = formatTime(activity.endTime);
  const timeDisplay = startFormatted && endFormatted 
    ? `${startFormatted} - ${endFormatted}` 
    : startFormatted || endFormatted || '';

  const ext = activity as any;

  return (
    <Marker 
      position={activity.coordinates}
      // @ts-ignore
      icon={customIcon}
      // @ts-ignore
      eventHandlers={{
        click: () => onMarkerClick(activity),
      }}
    >
      <Popup 
        // @ts-ignore
        className="modern-popup"
        // @ts-ignore
        maxWidth={280}
        minWidth={240}
      >
        <div className="popup-card">
          {/* Gradient header with step number */}
          <div className="popup-header" style={{ background: `linear-gradient(135deg, #${color}, #${getDarkerColor(color)})` }}>
            <div className="popup-step-badge">{index + 1}</div>
            <h3 className="popup-title">{activity.title}</h3>
          </div>
          
          <div className="popup-body">
            {/* Info rows */}
            {timeDisplay && (
              <div className="popup-info-row">
                <div className="popup-icon-wrapper popup-icon-blue">
                  <Clock size={12} />
                </div>
                <span>{timeDisplay}</span>
              </div>
            )}
            
            {activity.address && (
              <div className="popup-info-row">
                <div className="popup-icon-wrapper popup-icon-red">
                  <MapPin size={12} />
                </div>
                <span className="popup-address">{activity.address}</span>
              </div>
            )}

            {/* Tags row */}
            <div className="popup-tags">
              {ext.rating && (
                <span className="popup-tag popup-tag-amber">
                  <Star size={10} className="popup-star-fill" />
                  {ext.rating}
                </span>
              )}
              {ext.cost > 0 && (
                <span className="popup-tag popup-tag-green">
                  <DollarSign size={10} />
                  ~{ext.cost}
                </span>
              )}
              {ext.category && (
                <span className="popup-tag popup-tag-purple">
                  {ext.category}
                </span>
              )}
            </div>

            {/* Description */}
            {activity.description && (
              <p className="popup-description">{activity.description}</p>
            )}
            
            {/* Action button */}
            <button 
              className="popup-action-btn"
              style={{ color: `#${color}` }}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick(activity);
              }}
            >
              <Navigation size={12} />
              Google Maps
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

function getColorForIndex(index: number): string {
  const colors = [
    "3b82f6", "ef4444", "10b981", "f59e0b", "8b5cf6", "ec4899", "0ea5e9",
    "14b8a6", "f97316", "6366f1"
  ];
  return colors[index % colors.length];
}

function getDarkerColor(hex: string): string {
  const darkerMap: Record<string, string> = {
    "3b82f6": "2563eb", "ef4444": "dc2626", "10b981": "059669",
    "f59e0b": "d97706", "8b5cf6": "7c3aed", "ec4899": "db2777",
    "0ea5e9": "0284c7", "14b8a6": "0d9488", "f97316": "ea580c",
    "6366f1": "4f46e5"
  };
  return darkerMap[hex] || hex;
}

export default MapMarker;
