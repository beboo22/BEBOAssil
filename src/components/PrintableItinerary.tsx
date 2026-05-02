import React from "react";
import { format, isValid, addDays } from "date-fns";
import { calculateDayTripStats } from "@/utils/itineraryUtils";
import { QRCodeSVG } from "qrcode.react";

function safeFormat(value: string | Date | undefined | null, fmt: string): string {
  try {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (!isValid(d)) return "—";
    return format(d, fmt);
  } catch {
    return "—";
  }
}

function safeDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return isValid(value) ? value : new Date();
  const d = new Date(value);
  return isValid(d) ? d : new Date();
}

interface PrintableItineraryProps {
  itinerary: any;
  showQRCodes?: boolean;
  fastMode?: boolean;
  fuelSettings?: { efficiency: number; price: number };
  weatherData?: any;
  emergencyNumbers?: any;
  forecast?: any[];
  shareUrl?: string;
}

const getPlaceImageForPrint = (activity: any): string => {
  if (activity.imageUrl && activity.imageUrl !== '/placeholder.svg') return activity.imageUrl;
  return `https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=300&h=200&fit=crop&q=80`;
};

const getActivityTipsForPrint = (activity: any): string[] => {
  if (activity.tips?.length) return activity.tips;
  const cat = (activity.type || activity.category || '').toLowerCase();
  if (cat === 'food' || cat === 'restaurant' || cat === 'cafe') {
    return ["احجز مسبقاً خاصة في أوقات الذروة", "اسأل عن الأطباق الخاصة لليوم"];
  } else if (cat === 'attraction' || cat === 'museum') {
    return ["اشترِ التذاكر مسبقاً عبر الإنترنت", "خصص وقتاً كافياً للاستمتاع بالمكان"];
  } else if (cat === 'shopping') {
    return ["قارن الأسعار قبل الشراء", "اسأل عن التخفيضات والعروض"];
  }
  return ["تحقق من ساعات العمل قبل الزيارة", "احمل مياه كافية"];
};

const getActivityEmoji = (activity: any): string => {
  const map: Record<string, string> = {
    attraction: '🏛️', food: '🍽️', restaurant: '🍽️', cafe: '☕', shopping: '🛍️',
    entertainment: '🎭', cultural: '🎨', nature: '🌿', museum: '🏛️', hotel: '🏨', transport: '🚗',
    breakfast: '🥐', lunch: '🥗', dinner: '🍲', snack: '🍿', dessert: '🍰', street_food: '🌮',
    beach: '🏖️', sea: '🌊', mall: '🛍️', park: '🌳', mountain: '⛰️', mosque: '🕌', market: '🏪',
  };

  const category = String(activity?.type || activity?.category || '').toLowerCase();
  if (map[category]) return map[category];

  const content = `${activity?.title || ''} ${activity?.name || ''} ${activity?.description || ''}`.toLowerCase();
  if (/beach|sea|coast|بحر|شاطئ/.test(content)) return '🏖️';
  if (/mall|shopping|مول|تسوق/.test(content)) return '🛍️';
  if (/museum|متحف/.test(content)) return '🏛️';
  if (/park|حديقة/.test(content)) return '🌳';
  if (/restaurant|food|مطعم|غداء|عشاء|فطور/.test(content)) return '🍽️';
  return '📍';
};

const getMapUrl = (activity: any): string => {
  const placeName = String(activity.title || activity.name || '').trim();
  const address = String(activity.address || activity.location || '').trim();
  const placeId = activity.place_id || activity.placeId;

  // Prefer stable place_id when available — link opens the same venue across languages.
  if (placeId && placeName) {
    const query = address ? `${placeName}, ${address}` : placeName;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  // Reuse pre-built URL from generator if it isn't a raw coords link.
  const direct = activity.googleMapsUrl || activity.googleMapsLink;
  if (typeof direct === 'string' && /^https?:\/\//i.test(direct) && !/query=-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?(&|$)/i.test(direct)) {
    return direct;
  }

  const query = `${placeName} ${address}`.trim();
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  // Internal-only coordinate fallback (never exposed as text).
  if (activity.latitude && activity.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }
  return '#';
};

const normalizeExternalUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const toTelHref = (phone?: string): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
};

const getCalendarBridgeUrl = (activity: any, date: any): string => {
  const title = activity.title || activity.name || 'Activity';
  const location = activity.address || activity.location || '';
  const description = activity.description || '';
  const safeD = safeDate(date);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aseelaitrip.com';
  return `${origin}/calendar/add?title=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(description)}&start=${safeD.toISOString()}&end=${new Date(safeD.getTime() + 2 * 3600000).toISOString()}&pref=auto`;
};

const getMealBadge = (activity: any): { icon: string; label: string } | null => {
  const category = String(activity?.type || activity?.category || '').toLowerCase();
  if (!['food', 'restaurant', 'cafe', 'breakfast', 'lunch', 'dinner'].includes(category)) return null;

  const timeValue = String(activity?.startTime || activity?.time || '').toUpperCase();
  const match = timeValue.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);

  if (!match) return { icon: '🍽️', label: 'وجبة' };

  let hour = Number(match[1]);
  const meridiem = match[3] || '';
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  if (hour < 11) return { icon: '☕', label: 'فطور' };
  if (hour < 16) return { icon: '🥗', label: 'غداء' };
  return { icon: '🍲', label: 'عشاء' };
};

const weatherIconUrl = (icon?: string) => icon ? `https://openweathermap.org/img/wn/${icon}@2x.png` : '';

// Use the centralized team-flag registry so the print/PDF view matches the
// itinerary cards and the events/promotions pages.
import { getTeamFlag, isMissingFlag } from '@/lib/teamFlags';
const printLookupFlag = (name: string): string => {
  const f = getTeamFlag(name);
  // For print we prefer a soccer ball over the white flag fallback so the PDF
  // never shows an empty banner.
  return isMissingFlag(f) ? '⚽' : f;
};

const inferPrintMatch = (activity: any): {
  teams?: { a: string; b: string; flagA: string; flagB: string };
  venue?: string;
  kickoff?: string;
} => {
  const blob = [activity.matchReason, activity.description, activity.name, activity.title, activity.aiSourceQuery]
    .filter(Boolean).join(" \n ");
  if (!blob) return {};
  const vs = blob.match(/([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)\s+(?:vs\.?|v\.?|ضد)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)(?=\s+(?:at|@|في|on|بتاريخ)\b|\s*[،,\-—–\(\n]|\s*$)/i);
  let teams: { a: string; b: string; flagA: string; flagB: string } | undefined;
  if (vs) {
    const a = vs[1].trim().replace(/[.,;:]+$/, "");
    const b = vs[2].trim().replace(/[.,;:]+$/, "");
    teams = { a, b, flagA: printLookupFlag(a), flagB: printLookupFlag(b) };
  }
  let venue: string | undefined;
  const vm = blob.match(/(?:\bat\s+|@\s*|\bفي\s+)([A-Za-z\u0600-\u06FF][^\n,–—]{2,80}?)(?=\s+(?:on|بتاريخ|at\s+\d|في\s+\d|—|–|\(|$))/i);
  if (vm) venue = vm[1].trim().replace(/[.,;:]+$/, "");
  let kickoff: string | undefined;
  const tm = blob.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*UTC[+-]?\d{0,2})?)\b/);
  if (tm) kickoff = tm[1].trim();
  return { teams, venue, kickoff };
};

const isPrintMatchActivity = (activity: any): boolean => {
  if (activity.isMatchAnchor) return true;
  const blob = `${activity.matchReason || ''} ${activity.description || ''} ${activity.name || ''} ${activity.title || ''}`.toLowerCase();
  return /\b(?:vs\.?|v\.?)\b|\bmatch schedule\b|\bمباراة\b|\bضد\b|\bkickoff\b/i.test(blob);
};

// Format opening hours cleanly
const formatHours = (hours: string): string => {
  if (!hours) return '';
  const normalized = hours
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Open\s*24[^a-zA-Z\u0600-\u06FF]*hours/gi, 'Open 24 hours')
    .trim();

  if (!normalized) return '';
  if (/open\s*24\s*hours/i.test(normalized) || normalized === '24/7') return 'مفتوح 24 ساعة';

  const dayLabels: Record<string, string> = {
    monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
    friday: 'الجمعة', saturday: 'السبت', sunday: 'الأحد',
  };

  const entries = Array.from(
    normalized.matchAll(/"?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?\s*[:=]\s*"?([^",}]+(?:\s*[-–]\s*[^",}]+)?|open\s*24\s*hours)/gi)
  ).map((m) => [m[1].toLowerCase(), m[2].replace(/"/g, '').trim()] as [string, string]);

  if (entries.length > 0) {
    const normalizedValues = entries.map(([, value]) => value.replace(/\s+/g, ' '));
    const uniqueValues = [...new Set(normalizedValues.map((v) => (/open\s*24\s*hours/i.test(v) ? 'مفتوح 24 ساعة' : v)))];
    if (uniqueValues.length === 1) return uniqueValues[0];

    return entries
      .slice(0, 7)
      .map(([day, value]) => `${dayLabels[day] || day}: ${/open\s*24\s*hours/i.test(value) ? 'مفتوح 24 ساعة' : value}`)
      .join(' | ');
  }

  return normalized.substring(0, 140);
};

const PrintableItinerary = ({ itinerary, showQRCodes = true, fastMode = false, fuelSettings = { efficiency: 8, price: 2.5 }, weatherData, emergencyNumbers, forecast, shareUrl: externalShareUrl }: PrintableItineraryProps) => {
  if (!itinerary) return null;

  const totalActivitiesCost = itinerary.days.reduce((total: number, day: any) =>
    total + day.activities.reduce((s: number, a: any) => s + (a.cost || 0), 0), 0);

  const totalTripStats = itinerary.days.reduce((acc: any, day: any) => {
    const dayStats = calculateDayTripStats(day.activities, fuelSettings.efficiency, fuelSettings.price);
    return { totalDistance: acc.totalDistance + dayStats.totalDistance, fuelCost: acc.fuelCost + dayStats.fuelCost };
  }, { totalDistance: 0, fuelCost: 0 });

  const flightCost = itinerary.flightDetails
    ? (itinerary.flightDetails.departure?.price || 0) + (itinerary.flightDetails.return?.price || 0) : 0;
  const hotelCost = itinerary.estimatedHotelCost || (itinerary.wantHotel ? itinerary.duration * 120 : 0);
  const transportCost = totalTripStats.fuelCost || (itinerary.duration * 30);
  const mealCost = itinerary.mealPreferences ? calculateMealCost(itinerary.mealPreferences, itinerary.duration) : 0;
  const grandTotal = totalActivitiesCost + flightCost + hotelCost + transportCost + mealCost;

  const shareUrl = externalShareUrl || (typeof window !== 'undefined' ? window.location.href : '');

  const sectionStyle: React.CSSProperties = { pageBreakInside: 'avoid', breakInside: 'avoid' };
  const linkStyle: React.CSSProperties = { color: '#0d9488', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' };

  // Build a full-trip calendar bridge URL that adds all activities
  const allActivitiesCalendarUrls = itinerary.days.flatMap((day: any, di: number) =>
    day.activities.map((act: any) => {
      const title = act.title || act.name || 'Activity';
      const location = act.address || act.location || '';
      const d = safeDate(day.date);
      return {
        title,
        location,
        url: getCalendarBridgeUrl(act, day.date),
        mapUrl: getMapUrl(act),
        day: di + 1,
      };
    })
  );

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#1a1a1a', backgroundColor: '#fff', padding: '32px', maxWidth: '794px', margin: '0 auto', direction: 'rtl' }}>
      
      {/* Header with Logo */}
      <div data-pdf-section style={{ ...sectionStyle, textAlign: 'center', borderBottom: '3px solid #0d9488', paddingBottom: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <img src="/logo.png" alt="ASEEL AI TRIP" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#0d9488', letterSpacing: '2px' }}>ASEEL AI TRIP</span>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 8px 0' }}>
          خطة رحلة: {itinerary.destination}
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
          {safeFormat(itinerary.startDate, "MMM dd, yyyy")} — {safeFormat(itinerary.endDate, "MMM dd, yyyy")} · {itinerary.duration} أيام
        </p>
        {itinerary.aiGenerated && (
          <span style={{ display: 'inline-block', marginTop: '8px', background: '#f0fdf4', color: '#15803d', fontSize: '12px', padding: '4px 12px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            ⭐ مُولّد بالذكاء الاصطناعي
          </span>
        )}
        {showQRCodes && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px' }}>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', textAlign: 'center' }}>
              <QRCodeSVG value={shareUrl} size={120} />
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>📱 مشاركة الرحلة</div>
            </a>
          </div>
        )}
      </div>

      {/* Calendar QR section removed - individual activity QR codes are sufficient */}

      {/* Weather Section */}
      {weatherData && (
        <div data-pdf-section style={{ ...sectionStyle, marginBottom: '32px' }}>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>🌤️ الطقس الحالي</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {weatherData.icon && <img src={weatherIconUrl(weatherData.icon)} alt="" style={{ width: '40px', height: '40px' }} />}
              <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0c4a6e' }}>{weatherData.temp}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{weatherData.condition}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              💧 {weatherData.humidity} · 💨 {weatherData.wind_speed}
            </div>
          </div>
        </div>
      )}

      {/* Weather Forecast for Trip Days — one card per trip day, mapped by date */}
      {(() => {
        const tripDays = Array.isArray(itinerary.days) ? itinerary.days : [];
        if (!tripDays.length) return null;
        const forecastByDate = new Map<string, any>();
        (forecast || []).forEach((f: any) => {
          if (f?.date) forecastByDate.set(String(f.date).slice(0, 10), f);
        });
        const dayCards = tripDays.map((d: any, i: number) => {
          const dateKey = (d?.date ? new Date(d.date).toISOString().slice(0, 10) : '');
          const fc = forecastByDate.get(dateKey);
          return { idx: i, dateKey, label: safeFormat(d?.date, 'MMM dd') || `يوم ${i + 1}`, fc };
        });
        const hasAny = dayCards.some(c => !!c.fc);
        if (!hasAny && !forecast?.length) return null;
        const cols = Math.min(Math.max(dayCards.length, 1), 7);
        return (
          <div data-pdf-section style={{ ...sectionStyle, marginBottom: '32px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', marginBottom: '12px' }}>📅 توقعات الطقس لأيام الرحلة</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px' }}>
              {dayCards.map(({ idx, label, fc }) => (
                <div key={idx} style={{ textAlign: 'center', background: 'white', borderRadius: '8px', padding: '8px 4px', border: '1px solid #e0f2fe' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>{label}</div>
                  {fc?.icon ? <img src={weatherIconUrl(fc.icon)} alt="" style={{ width: '30px', height: '30px', margin: '0 auto' }} /> : <div style={{ height: '30px', lineHeight: '30px', fontSize: '18px' }}>—</div>}
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#0c4a6e' }}>{fc?.temp_max || '—'}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{fc?.temp_min || ''}</div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>{fc?.condition || ''}</div>
                </div>
              ))}
            </div>
            {!hasAny && (
              <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
                التوقعات الدقيقة تتوفر قبل الرحلة بـ 5 أيام
              </div>
            )}
          </div>
        );
      })()}


      {/* Cost Summary */}
      <div data-pdf-section style={{ ...sectionStyle, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#ffffff' }}>💰 ملخص التكاليف</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px 0', color: '#64748b', fontSize: '14px' }}>🎯 الأنشطة والمعالم</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>${totalActivitiesCost}</td>
            </tr>
            {flightCost > 0 && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontSize: '14px' }}>✈️ الطيران</td>
                <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>${flightCost}</td>
              </tr>
            )}
            {hotelCost > 0 && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontSize: '14px' }}>🏨 السكن ({itinerary.duration} ليالي)</td>
                <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>${hotelCost}</td>
              </tr>
            )}
            {mealCost > 0 && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontSize: '14px' }}>🍽️ الوجبات ({itinerary.duration} أيام)</td>
                <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>${mealCost}</td>
              </tr>
            )}
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px 0', color: '#64748b', fontSize: '14px' }}>⛽ المواصلات والوقود ({Number(totalTripStats.totalDistance).toFixed(0)} كم)</td>
              <td style={{ padding: '8px 0', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>${Number(transportCost).toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 0', fontWeight: 'bold', fontSize: '16px', color: '#0d9488' }}>الإجمالي التقديري</td>
              <td style={{ padding: '12px 0', textAlign: 'left', fontWeight: 'bold', fontSize: '18px', color: '#0d9488' }}>${Number(grandTotal).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Meal Preferences */}
      {itinerary.mealPreferences && (itinerary.mealPreferences.breakfast || itinerary.mealPreferences.lunch || itinerary.mealPreferences.dinner || itinerary.mealPreferences.snacks) && (
        <div data-pdf-section style={{ ...sectionStyle, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#92400e' }}>🍽️ تفضيلات الوجبات</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {itinerary.mealPreferences.breakfast && (
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500' }}>☕ فطور</span>
            )}
            {itinerary.mealPreferences.lunch && (
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500' }}>🥗 غداء</span>
            )}
            {itinerary.mealPreferences.dinner && (
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500' }}>🍲 عشاء</span>
            )}
            {itinerary.mealPreferences.snacks && (
              <span style={{ background: '#fef3c7', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500' }}>🍿 وجبات خفيفة</span>
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#78350f' }}>
            مستوى الميزانية: {itinerary.mealPreferences.budgetPerMeal === 'premium' ? '⭐ فاخر' : itinerary.mealPreferences.budgetPerMeal === 'moderate' ? '🍽️ متوسط' : '💰 اقتصادي'}
            {mealCost > 0 && <span style={{ marginRight: '12px' }}> · التكلفة التقديرية: ${mealCost}</span>}
          </div>
        </div>
      )}

      {/* Flight Info */}
      {itinerary.flightDetails && (
        <div data-pdf-section style={{ ...sectionStyle, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#ffffff' }}>✈️ معلومات الطيران</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>رحلة الذهاب</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{safeFormat(itinerary.flightDetails.departure.date, "MMM dd")} · {itinerary.flightDetails.departure.time}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{itinerary.flightDetails.departure.flightNumber}</div>
              <div style={{ fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>${itinerary.flightDetails.departure.price}</div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>رحلة العودة</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{safeFormat(itinerary.flightDetails.return.date, "MMM dd")} · {itinerary.flightDetails.return.time}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{itinerary.flightDetails.return.flightNumber}</div>
              <div style={{ fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>${itinerary.flightDetails.return.price}</div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Itinerary */}
      {itinerary.days.map((day: any, dayIndex: number) => {
        const dayStats = calculateDayTripStats(day.activities, fuelSettings.efficiency, fuelSettings.price);
        const dayCost = day.activities.reduce((s: number, a: any) => s + (a.cost || 0), 0);
        const dayDateKey = day?.date ? new Date(day.date).toISOString().slice(0, 10) : '';
        const dayForecast = (forecast || []).find((f: any) => f?.date && String(f.date).slice(0, 10) === dayDateKey) || forecast?.[dayIndex];

        return (
          <div key={dayIndex} data-pdf-day-section style={{ marginBottom: '32px' }}>
            {/* Day Header */}
            <div data-pdf-section style={{ ...sectionStyle, background: '#0d9488', color: 'white', padding: '12px 16px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>اليوم {dayIndex + 1}</span>
                <span style={{ marginRight: '12px', opacity: 0.8, fontSize: '13px' }}>{safeFormat(day.date, "EEEE, MMMM d")}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', opacity: 0.9 }}>
                {dayForecast && (
                  <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>
                    🌡️ {dayForecast.temp_min} — {dayForecast.temp_max} · {dayForecast.condition}
                  </span>
                )}
                <span>💰 ${dayCost}</span>
                {dayStats.totalDistance > 0 && <span>🚗 {dayStats.totalDistance} كم</span>}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              {day.activities.map((activity: any, actIdx: number) => {
                const tips = getActivityTipsForPrint(activity);
                const emoji = getActivityEmoji(activity);
                const imgUrl = getPlaceImageForPrint(activity);
                const mapUrl = getMapUrl(activity);
                const calendarWebUrl = getCalendarBridgeUrl(activity, day.date);
                const isCompleted = activity.completed;
                const hours = formatHours(activity.openingHours || '');
                const websiteUrl = normalizeExternalUrl(activity.website);
                const phoneHref = toTelHref(activity.phone);
                const mealBadge = getMealBadge(activity);

                return (
                  <div key={actIdx} data-pdf-activity data-pdf-card style={{ 
                    ...sectionStyle,
                    padding: '16px', 
                    borderBottom: actIdx < day.activities.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: isCompleted ? 0.6 : 1,
                    background: isCompleted ? '#f0fdf4' : 'transparent',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid'
                  }}>
                    <div style={{ display: 'flex', gap: '14px' }}>
                      {/* Image */}
                      <div style={{ width: '100px', height: '75px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: '#f1f5f9' }}>
                        {fastMode ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>{emoji}</div>
                        ) : (
                          <img src={imgUrl} alt={activity.title || activity.name} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            crossOrigin="anonymous"
                          />
                        )}
                      </div>
                      
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15px', fontWeight: '600', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                            {emoji} {activity.title || activity.name}
                          </span>
                          {mealBadge && (
                            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                              {mealBadge.icon} {mealBadge.label}
                            </span>
                          )}
                          {isCompleted && (
                            <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600' }}>✅ منجز</span>
                          )}
                          {activity.rating && (
                            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '11px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600' }}>⭐ {activity.rating}</span>
                          )}
                          <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '10px', padding: '2px 8px', borderRadius: '8px' }}>{activity.type || activity.category}</span>
                        </div>
                        
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0d9488', textDecoration: 'none' }}>📍 {activity.address || activity.location}</a>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span>🕐 {activity.startTime || activity.time}{activity.endTime ? ` - ${activity.endTime}` : ''}</span>
                          {hours && <span style={{ maxWidth: '100%', whiteSpace: 'normal' }}>🏪 {hours}</span>}
                          {activity.phone && phoneHref && <a href={phoneHref} style={{ color: '#0d9488', textDecoration: 'none' }}>📞 {activity.phone}</a>}
                        </div>

                        {activity.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>{activity.description}</div>
                        )}

                        {/* Match Banner (Teams + Venue + Kickoff) */}
                        {(() => {
                          const inferred = inferPrintMatch(activity);
                          const rawT = activity.matchTeams || inferred.teams;
                          const teams = rawT
                            ? {
                                a: rawT.a,
                                b: rawT.b,
                                flagA: isMissingFlag(rawT.flagA) ? printLookupFlag(rawT.a) : rawT.flagA,
                                flagB: isMissingFlag(rawT.flagB) ? printLookupFlag(rawT.b) : rawT.flagB,
                              }
                            : undefined;
                          const venue = activity.matchVenue || inferred.venue;
                          const kickoff = activity.matchKickoff || inferred.kickoff || activity.startTime || activity.time;
                          const show = !!teams && (activity.isMatchAnchor || isPrintMatchActivity(activity));
                          if (!show || !teams) return null;
                          return (
                            <div style={{ marginTop: '8px', borderRadius: '16px', border: '2px solid rgba(20, 184, 166, 0.3)', background: '#ffffff', padding: '12px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)' }}>
                              {kickoff && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                                  🕐 {kickoff}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                                  <div style={{ fontSize: '28px', lineHeight: 1 }}>{teams.flagA}</div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{teams.a}</div>
                                </div>
                                <div style={{ flexShrink: 0, padding: '0 8px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '2px', textTransform: 'uppercase' }}>vs</div>
                                  <div style={{ width: '24px', height: '1px', background: '#e2e8f0', margin: '4px auto 0' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                                  <div style={{ fontSize: '28px', lineHeight: 1 }}>{teams.flagB}</div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{teams.b}</div>
                                </div>
                              </div>
                              {venue && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#334155', fontWeight: 500 }}>
                                  📍 <span>{venue}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Clickable links row */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>📍 فتح الخريطة</a>
                          <a href={calendarWebUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>📅 إضافة للتقويم</a>
                          {activity.phone && phoneHref && <a href={phoneHref} style={linkStyle}>📞 اتصال</a>}
                          {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>🌐 الموقع</a>}
                        </div>
                      </div>
                      
                      {/* Cost + QR */}
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: activity.cost === 0 ? '#16a34a' : '#1e293b', marginBottom: '8px' }}>
                          {activity.cost === 0 ? 'مجاني' : `$${activity.cost || 0}`}
                        </div>
                        {showQRCodes && !fastMode && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
                              <QRCodeSVG value={mapUrl} size={120} />
                              <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>📍 الموقع</span>
                            </a>
                            <a href={calendarWebUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
                              <QRCodeSVG value={calendarWebUrl} size={120} />
                              <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>📅 التقويم</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tips */}
                    {tips.length > 0 && (
                      <div style={{ marginTop: '8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>💡 نصائح:</div>
                        {tips.map((tip, i) => (
                          <div key={i} style={{ fontSize: '11px', color: '#78350f', lineHeight: '1.6' }}>✓ {tip}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Day distance segments */}
            {dayStats.segments.length > 0 && (
              <div data-pdf-section style={{ ...sectionStyle, marginTop: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#065f46', marginBottom: '6px' }}>🚗 المسافات بين النقاط:</div>
                {dayStats.segments.map((seg, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#047857', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{seg.from} → {seg.to}</span>
                    <span style={{ fontWeight: '600' }}>{seg.distance} كم</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Emergency Numbers (bottom of document) */}
      {emergencyNumbers && (
        <div data-pdf-section style={{ ...sectionStyle, background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626', marginBottom: '12px' }}>🚨 أرقام الطوارئ - {itinerary.destination}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {emergencyNumbers.police && (
              <div style={{ textAlign: 'center', background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🚔</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>الشرطة</div>
                <a href={`tel:${emergencyNumbers.police}`} style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', textDecoration: 'none', display: 'block', marginTop: '4px' }}>{emergencyNumbers.police}</a>
              </div>
            )}
            {emergencyNumbers.ambulance && (
              <div style={{ textAlign: 'center', background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🚑</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>الإسعاف</div>
                <a href={`tel:${emergencyNumbers.ambulance}`} style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', textDecoration: 'none', display: 'block', marginTop: '4px' }}>{emergencyNumbers.ambulance}</a>
              </div>
            )}
            {emergencyNumbers.fire && (
              <div style={{ textAlign: 'center', background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🚒</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>الإطفاء</div>
                <a href={`tel:${emergencyNumbers.fire}`} style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', textDecoration: 'none', display: 'block', marginTop: '4px' }}>{emergencyNumbers.fire}</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tips */}
      {itinerary.tips?.length > 0 && (
        <div data-pdf-section style={{ ...sectionStyle, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#92400e' }}>💡 نصائح السفر</h2>
          <ul style={{ margin: 0, paddingRight: '20px' }}>
            {itinerary.tips.map((tip: string, i: number) => (
              <li key={i} style={{ fontSize: '13px', color: '#78350f', marginBottom: '6px', lineHeight: '1.5' }}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div data-pdf-section style={{ ...sectionStyle, textAlign: 'center', color: '#94a3b8', fontSize: '12px', borderTop: '2px solid #0d9488', paddingTop: '16px', marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <img src="/logo.png" alt="ASEEL AI TRIP" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0d9488' }}>ASEEL AI TRIP</span>
        </div>
        {showQRCodes && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '12px' }}>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', textAlign: 'center' }}>
              <QRCodeSVG value={shareUrl} size={110} />
              <div style={{ fontSize: '10px', marginTop: '4px', color: '#94a3b8' }}>🔗 مشاركة</div>
            </a>
          </div>
        )}
        <p style={{ margin: 0 }}>تم الإنشاء في {safeFormat(new Date(), "MMMM d, yyyy")} · ASEEL AI TRIP .COM</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#cbd5e1' }}>
          بيانات الطقس من OpenWeatherMap · المعلومات من Wikipedia
        </p>
      </div>
    </div>
  );
};

// Calculate meal cost helper
function calculateMealCost(prefs: any, duration: number): number {
  const MEAL_COSTS: Record<string, Record<string, number>> = {
    budget: { breakfast: 5, lunch: 8, dinner: 12, snacks: 3 },
    moderate: { breakfast: 12, lunch: 20, dinner: 35, snacks: 8 },
    premium: { breakfast: 25, lunch: 45, dinner: 80, snacks: 15 },
  };
  const costs = MEAL_COSTS[prefs.budgetPerMeal || 'moderate'];
  if (!costs) return 0;
  let daily = 0;
  if (prefs.breakfast) daily += costs.breakfast;
  if (prefs.lunch) daily += costs.lunch;
  if (prefs.dinner) daily += costs.dinner;
  if (prefs.snacks) daily += costs.snacks;
  return daily * duration;
}

export default PrintableItinerary;
