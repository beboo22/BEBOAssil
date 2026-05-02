import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths (Vite/Webpack break Leaflet's default URL detection)
const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Props {
  value: { lat: number; lon: number } | null;
  initialCenter?: { lat: number; lon: number } | null;
  radiusKm?: number;
  onChange: (point: { lat: number; lon: number }) => void;
  hintLabel?: string;
  inaccurate?: boolean;
}

const ClickToPin = ({ onChange }: { onChange: Props["onChange"] }) => {
  useMapEvents({
    click: (e) => onChange({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
};

const RecenterOnChange = ({ point }: { point: { lat: number; lon: number } | null }) => {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    map.panTo([point.lat, point.lon], { animate: true });
  }, [point?.lat, point?.lon, map]);
  return null;
};

export const CenterPointMapPicker = ({ value, initialCenter, radiusKm, onChange, hintLabel, inaccurate }: Props) => {
  const center: [number, number] = useMemo(() => {
    if (value) return [value.lat, value.lon];
    if (initialCenter) return [initialCenter.lat, initialCenter.lon];
    return [25.2048, 55.2708]; // Dubai fallback
  }, [value, initialCenter]);

  const initialZoom = value || initialCenter ? 13 : 4;
  const markerRef = useRef<L.Marker | null>(null);

  return (
    <div
      className={`relative rounded-lg overflow-hidden border ${inaccurate ? 'border-destructive ring-2 ring-destructive/40' : 'border-border'}`}
      style={{ height: 260 }}
    >
      {hintLabel && (
        <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-[500] pointer-events-none backdrop-blur-sm border rounded-full px-3 py-1 text-[10px] font-semibold shadow-md ${inaccurate ? 'bg-destructive/95 border-destructive text-destructive-foreground' : 'bg-background/95 border-border text-foreground'}`}>
          {hintLabel}
        </div>
      )}
      <MapContainer
        className="h-full w-full"
        // @ts-ignore - react-leaflet type defs are out of sync
        scrollWheelZoom={true}
        // @ts-ignore - react-leaflet type defs are out of sync
        center={center}
        // @ts-ignore - react-leaflet type defs are out of sync
        zoom={initialZoom}
      >
        <TileLayer
          // @ts-ignore - react-leaflet type defs are out of sync
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          // @ts-ignore - react-leaflet type defs are out of sync
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ClickToPin onChange={onChange} />
        <RecenterOnChange point={value} />
        {value && (
          <>
            <Marker
              position={[value.lat, value.lon]}
              ref={(m) => { markerRef.current = m as L.Marker | null; }}
              eventHandlers={{
                dragend: () => {
                  const m = markerRef.current;
                  if (!m) return;
                  const ll = m.getLatLng();
                  onChange({ lat: ll.lat, lon: ll.lng });
                },
              }}
              // @ts-ignore - react-leaflet type defs are out of sync
              draggable
              // @ts-ignore - react-leaflet type defs are out of sync
              icon={defaultIcon}
            />
            {/* Warning ring around the marker when the pin is far from the destination city */}
            {inaccurate && (
              <Circle
                center={[value.lat, value.lon]}
                pathOptions={{ color: "hsl(var(--destructive))", weight: 3, fillOpacity: 0.15, dashArray: "6 6" }}
                // @ts-ignore - react-leaflet type defs are out of sync
                radius={400}
              />
            )}
            {radiusKm && radiusKm > 0 && (
              <Circle
                center={[value.lat, value.lon]}
                pathOptions={
                  inaccurate
                    ? { color: "hsl(var(--destructive))", weight: 2, fillOpacity: 0.05 }
                    : { color: "hsl(var(--primary))", weight: 2, fillOpacity: 0.08 }
                }
                // @ts-ignore - react-leaflet type defs are out of sync
                radius={radiusKm * 1000}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default CenterPointMapPicker;
