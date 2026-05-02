import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronsDown, Clock, ArrowDown, Route } from "lucide-react";

interface Activity {
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  name?: string;
  address?: string;
  googleMapsUrl?: string;
  googleMapsLink?: string;
}

interface TravelLegBadgeProps {
  from: Activity;
  to: Activity;
}

// Haversine distance in kilometers.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildDirectionsUrl(from: Activity, to: Activity): string {
  const origin = (from.latitude != null && from.longitude != null)
    ? `${from.latitude},${from.longitude}`
    : encodeURIComponent(from.address || from.title || from.name || "");
  const dest = (to.latitude != null && to.longitude != null)
    ? `${to.latitude},${to.longitude}`
    : encodeURIComponent(to.address || to.title || to.name || "");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
}

export const TravelLegBadge: React.FC<TravelLegBadgeProps> = ({ from, to }) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");

  if (
    from?.latitude == null || from?.longitude == null ||
    to?.latitude == null || to?.longitude == null
  ) {
    return null;
  }

  const straightKm = haversineKm(
    Number(from.latitude), Number(from.longitude),
    Number(to.latitude), Number(to.longitude),
  );
  // Skip when essentially the same location (< 80m straight-line).
  if (!Number.isFinite(straightKm) || straightKm < 0.08) return null;
  // Apply a ~1.3 detour factor so the displayed value approximates the actual
  // driving route distance (Google Maps style) rather than crow-flies distance.
  const km = straightKm * 1.3;

  // Tiered urban driving heuristic: dense city (<3 km @ 18 km/h),
  // mixed (<15 km @ 28 km/h), highway (>=15 km @ 55 km/h) + 3-min buffer
  // for parking / walking from car. Closer to real-world Google Maps ETA.
  const speedKmh = km < 3 ? 18 : km < 15 ? 28 : 55;
  const minutes = Math.max(3, Math.round((km / speedKmh) * 60) + 3);
  const distanceLabel = km < 1
    ? `${Math.round(km * 1000)} ${isArabic ? "م" : "m"}`
    : `${km.toFixed(km < 10 ? 1 : 0)} ${isArabic ? "كم" : "km"}`;

  const rawTime = minutes < 60
    ? `${minutes} ${isArabic ? "د" : "min"}`
    : `${Math.floor(minutes / 60)}${isArabic ? "س" : "h"} ${minutes % 60}${isArabic ? "د" : "m"}`;
  // Prefix with ~ and an explicit "approx" label so the user knows this is an
  // estimate (not a live Google Maps ETA) — matches the user's request.
  const approxLabel = isArabic ? "تقريبًا" : "approx";
  const timeLabel = `~${rawTime}`;

  const url = buildDirectionsUrl(from, to);

  return (
    <div className="flex flex-col items-center my-2 gap-1" dir={isArabic ? "rtl" : "ltr"}>
      {/* Prominent downward arrow above the badge — visualizes "previous → next". */}
      <ChevronsDown
        className="w-5 h-5 text-primary/70 -mb-0.5"
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 hover:bg-primary/10 border border-border/50 hover:border-primary/40 text-[11px] font-medium text-muted-foreground hover:text-primary transition-all"
        title={isArabic
          ? `المسافة بالطريق من النشاط السابق إلى التالي ≈ ${distanceLabel} • المدة تقريبية`
          : `Driving distance from previous → next activity ≈ ${distanceLabel} • duration is approximate`}
      >
        <Route className="w-3 h-3" />
        <span>{distanceLabel}</span>
        <span className="opacity-50">•</span>
        <Clock className="w-3 h-3" />
        <span>{timeLabel}</span>
        <span className="opacity-60 text-[9px] uppercase tracking-wide">{approxLabel}</span>
      </a>
      {/* Reinforce the downward flow under the badge as well. */}
      <ArrowDown
        className="w-4 h-4 text-primary/60"
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </div>
  );
};

export default TravelLegBadge;
