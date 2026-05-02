import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { Sparkles as SparklesIcon2 } from "lucide-react";
import { toast } from "sonner";
import {
  MapPin, Calendar as CalendarIcon, Users, DollarSign, Clock,
  Plane, Car, Hotel, Baby, Zap, Coffee, ChevronRight, ChevronLeft,
  Loader2, Utensils, Mountain, ShoppingBag, Waves, History,
  Palette, Gamepad2, Heart, TreePine, Sun, Moon, Star, Bus, Train, Fuel, Sparkles, Save, Lock, Crown,
  Compass, Footprints, Bike, Globe2, Search, AlertCircle, CheckCircle2
} from "lucide-react";
import PaymentModal from "@/components/PaymentModal";
import SmartBookingStep from "@/components/booking/SmartBookingStep";
import QuickTripTypes, { type QuickTripType } from "@/components/planning/QuickTripTypes";
import TripTemplates, { type TripTemplate } from "@/components/planning/TripTemplates";
import MealOptions from "@/components/planning/MealOptions";
import BudgetBreakdown, { buildBudgetItems } from "@/components/planning/BudgetBreakdown";
import MultiCityProgress from "@/components/planning/MultiCityProgress";
import AIRequestsAnalysis from "@/components/planning/AIRequestsAnalysis";
import { type MealPreferences } from "@/components/planning/usePlanningOptions";
import CenterPointMapPicker from "@/components/map/CenterPointMapPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import CitySearch from "./CitySearch";
import { getActivityImage, getActivityMapLink, normalizeWebsiteUrl } from "@/utils/activityHelpers";
import { useCurrency } from "@/hooks/useCurrency";
import { applyBookingToItinerary } from "@/utils/bookingReminders";
import { buildBookingsRoute } from "@/utils/bookingsRouting";
import { applyStrictDaySchedule, parseWakeSleep } from "@/utils/strictDayScheduler";
import { auditItineraryPreferences } from "@/utils/auditItineraryPreferences";
import { enforceDailyItemLimit } from "@/utils/enforceDailyItemLimit";
import { getFriendlyGenerationError } from "@/lib/generationErrors";
import { getGuestIdentifier } from "@/utils/deviceFingerprint";

const PREVIEW_PREF_LABELS: Record<string, Record<string, string>> = {
  en: { preferenceMatch: 'Preference Match', matched: 'matched', failed: 'failed', because: 'because', day: 'Day', meal_breakfast: 'Breakfast', meal_lunch: 'Lunch', meal_dinner: 'Dinner', meal_snack: 'Snack' },
  ar: { preferenceMatch: 'مطابقة التفضيلات', matched: 'مطابق', failed: 'غير مطابق', because: 'لأن', day: 'اليوم', meal_breakfast: 'فطور', meal_lunch: 'غداء', meal_dinner: 'عشاء', meal_snack: 'سناك' },
  fr: { preferenceMatch: 'Correspondance des préférences', matched: 'ok', failed: 'non', because: 'car', day: 'Jour', meal_breakfast: 'Petit-déjeuner', meal_lunch: 'Déjeuner', meal_dinner: 'Dîner', meal_snack: 'Snack' },
  es: { preferenceMatch: 'Coincidencia de preferencias', matched: 'ok', failed: 'falló', because: 'porque', day: 'Día', meal_breakfast: 'Desayuno', meal_lunch: 'Almuerzo', meal_dinner: 'Cena', meal_snack: 'Snack' },
  de: { preferenceMatch: 'Präferenz-Match', matched: 'passt', failed: 'fehlt', because: 'weil', day: 'Tag', meal_breakfast: 'Frühstück', meal_lunch: 'Mittagessen', meal_dinner: 'Abendessen', meal_snack: 'Snack' },
  ru: { preferenceMatch: 'Совпадение предпочтений', matched: 'совпало', failed: 'не совпало', because: 'потому что', day: 'День', meal_breakfast: 'Завтрак', meal_lunch: 'Обед', meal_dinner: 'Ужин', meal_snack: 'Перекус' },
  zh: { preferenceMatch: '偏好匹配', matched: '已匹配', failed: '未匹配', because: '原因', day: '第', meal_breakfast: '早餐', meal_lunch: '午餐', meal_dinner: '晚餐', meal_snack: '小吃' },
  ur: { preferenceMatch: 'ترجیحی میچ', matched: 'مطابق', failed: 'نامطابق', because: 'کیونکہ', day: 'دن', meal_breakfast: 'ناشتہ', meal_lunch: 'دوپہر کا کھانا', meal_dinner: 'رات کا کھانا', meal_snack: 'ہلکا کھانا' },
};

// Team flag map is centralized in src/lib/teamFlags.ts so all surfaces
// (TripWizard, ItinerarySchedule, EventsPage, PromotionDetailPage) stay in sync.
import { getTeamFlag } from '@/lib/teamFlags';

const parseEventMatchAnchors = (text = '', tripStart?: Date) => {
  const source = String(text || '');
  const pattern = /(?:Match(?:\s+schedule)?|MANDATORY\s+EVENT|EVENT|Event\s+schedule|الحدث|مباراة|موعد)?\s*:?\s*([\p{L}\p{M}.\s'’\-]{2,80})\s+vs\.?\s+([\p{L}\p{M}.\s'’\-]{2,80})\s+at\s+([^,;\n]+?)\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s+at\s+([0-9:apmAPM\s]+(?:UTC[+-]?\d*)?))?/giu;
  const anchors: Array<{ teamA: string; teamB: string; venue: string; date: string; kickoff: string; dayIndex: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const [, teamA, teamB, venue, date, kickoff = ''] = match;
    const target = new Date(`${date}T12:00:00`);
    const start = tripStart ? new Date(tripStart) : target;
    const dayIndex = Math.max(0, Math.floor((target.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)) / 86400000));
    anchors.push({ teamA: teamA.trim(), teamB: teamB.trim(), venue: venue.trim(), date, kickoff: kickoff.trim(), dayIndex });
  }
  return anchors;
};

// Localized labels for the "Distance between activities" preference card.
// Covers all 8 supported UI languages: en, ar, ur, de, fr, es, zh, ru.
type DistanceLabel = {
  title: string; optional: string; help: string; clear: string;
  any: string; compact: string; medium: string; wide: string; custom: string;
  anyHint: string; compactHint: string; mediumHint: string; wideHint: string; customHint: string;
  radiusLabel: string; km: string; mi: string; unitLabel: string; minMaxError: string; invalidNumberError: string;
  centerLabel: string; centerPlaceholder: string; centerHelp: string;
  pickFromMap: string; pickFromCity: string; pickerTitle: string; pickerHelp: string; useThis: string; cancel: string;
  livePreviewTitle: string; perDayRange: string; cityWide: string; nearAnchor: string;
  searching: string; noResults: string; previewOnMap: string; suggestions: string;
};
// Map-picker specific labels — translated for all 8 languages
const MAP_PICKER_LABELS: Record<string, { tabSearch: string; tabMap: string; tapToDrop: string; useMyLocation: string; locating: string; locationDenied: string; pinnedHere: string; farFromCity: string; checkingAccuracy: string; distanceFromCity: (d: string, unit: string, city: string) => string; thresholdNote: (limit: string, unit: string) => string; selectMorePrecisely: string; confirmOverride: string; pinAccurate: string; }> = {
  en: { tabSearch: 'Search', tabMap: 'Map', tapToDrop: 'Tap on the map to drop a pin', useMyLocation: 'My location', locating: 'Locating…', locationDenied: 'Location unavailable', pinnedHere: 'Pinned location', farFromCity: 'The pinned location seems far from your destination city.', checkingAccuracy: 'Checking accuracy…', distanceFromCity: (d, u, c) => `Pin is ${d} ${u} from ${c}`, thresholdNote: (l, u) => `Recommended limit: ${l} ${u}`, selectMorePrecisely: 'Select more precisely', confirmOverride: 'Use it anyway', pinAccurate: 'Pin is within the recommended range' },
  ar: { tabSearch: 'بحث', tabMap: 'خريطة', tapToDrop: 'اضغط على الخريطة لوضع دبوس', useMyLocation: 'موقعي الحالي', locating: 'جاري تحديد الموقع…', locationDenied: 'تعذّر تحديد الموقع', pinnedHere: 'الموقع المحدد', farFromCity: 'الموقع المحدد يبدو بعيدًا عن مدينة الوجهة.', checkingAccuracy: 'جاري التحقق من الدقة…', distanceFromCity: (d, u, c) => `الدبوس يبعد ${d} ${u} عن ${c}`, thresholdNote: (l, u) => `الحد الموصى به: ${l} ${u}`, selectMorePrecisely: 'تحديد أدق', confirmOverride: 'استخدامه على أي حال', pinAccurate: 'الدبوس ضمن النطاق الموصى به' },
  ur: { tabSearch: 'تلاش', tabMap: 'نقشہ', tapToDrop: 'پن لگانے کے لیے نقشے پر ٹیپ کریں', useMyLocation: 'میرا مقام', locating: 'مقام تلاش کیا جا رہا ہے…', locationDenied: 'مقام دستیاب نہیں', pinnedHere: 'پن کیا گیا مقام', farFromCity: 'پن کیا گیا مقام منزل شہر سے دور لگتا ہے۔', checkingAccuracy: 'درستگی کی جانچ ہو رہی ہے…', distanceFromCity: (d, u, c) => `پن ${c} سے ${d} ${u} پر ہے`, thresholdNote: (l, u) => `تجویز کردہ حد: ${l} ${u}`, selectMorePrecisely: 'مزید درست منتخب کریں', confirmOverride: 'پھر بھی استعمال کریں', pinAccurate: 'پن تجویز کردہ حد کے اندر ہے' },
  de: { tabSearch: 'Suche', tabMap: 'Karte', tapToDrop: 'Auf die Karte tippen, um eine Markierung zu setzen', useMyLocation: 'Mein Standort', locating: 'Standort wird ermittelt…', locationDenied: 'Standort nicht verfügbar', pinnedHere: 'Markierter Standort', farFromCity: 'Der markierte Ort scheint weit von Ihrer Zielstadt entfernt zu sein.', checkingAccuracy: 'Genauigkeit wird geprüft…', distanceFromCity: (d, u, c) => `Pin ist ${d} ${u} von ${c} entfernt`, thresholdNote: (l, u) => `Empfohlenes Limit: ${l} ${u}`, selectMorePrecisely: 'Genauer auswählen', confirmOverride: 'Trotzdem verwenden', pinAccurate: 'Pin liegt im empfohlenen Bereich' },
  fr: { tabSearch: 'Recherche', tabMap: 'Carte', tapToDrop: 'Touchez la carte pour placer un marqueur', useMyLocation: 'Ma position', locating: 'Localisation…', locationDenied: 'Position indisponible', pinnedHere: 'Position épinglée', farFromCity: 'La position épinglée semble éloignée de votre ville de destination.', checkingAccuracy: 'Vérification de la précision…', distanceFromCity: (d, u, c) => `Marqueur à ${d} ${u} de ${c}`, thresholdNote: (l, u) => `Limite recommandée : ${l} ${u}`, selectMorePrecisely: 'Sélectionner plus précisément', confirmOverride: 'Utiliser quand même', pinAccurate: 'Le marqueur est dans la plage recommandée' },
  es: { tabSearch: 'Buscar', tabMap: 'Mapa', tapToDrop: 'Toca el mapa para colocar un marcador', useMyLocation: 'Mi ubicación', locating: 'Localizando…', locationDenied: 'Ubicación no disponible', pinnedHere: 'Ubicación fijada', farFromCity: 'La ubicación marcada parece lejos de tu ciudad de destino.', checkingAccuracy: 'Comprobando precisión…', distanceFromCity: (d, u, c) => `Pin a ${d} ${u} de ${c}`, thresholdNote: (l, u) => `Límite recomendado: ${l} ${u}`, selectMorePrecisely: 'Seleccionar con más precisión', confirmOverride: 'Usar de todas formas', pinAccurate: 'El pin está dentro del rango recomendado' },
  ru: { tabSearch: 'Поиск', tabMap: 'Карта', tapToDrop: 'Нажмите на карту, чтобы поставить метку', useMyLocation: 'Мое местоположение', locating: 'Определение местоположения…', locationDenied: 'Местоположение недоступно', pinnedHere: 'Отмеченное место', farFromCity: 'Отмеченное место далеко от вашего города назначения.', checkingAccuracy: 'Проверка точности…', distanceFromCity: (d, u, c) => `Метка в ${d} ${u} от ${c}`, thresholdNote: (l, u) => `Рекомендуемый предел: ${l} ${u}`, selectMorePrecisely: 'Выбрать точнее', confirmOverride: 'Все равно использовать', pinAccurate: 'Метка в рекомендуемых пределах' },
  zh: { tabSearch: '搜索', tabMap: '地图', tapToDrop: '点击地图放置标记', useMyLocation: '我的位置', locating: '正在定位…', locationDenied: '位置不可用', pinnedHere: '已标记位置', farFromCity: '所选位置似乎远离目的地城市。', checkingAccuracy: '正在检查准确性…', distanceFromCity: (d, u, c) => `标记距离${c} ${d} ${u}`, thresholdNote: (l, u) => `建议范围：${l} ${u}`, selectMorePrecisely: '更精确选择', confirmOverride: '仍然使用', pinAccurate: '标记在建议范围内' },
};
const getMapPickerLabels = (lng?: string) => {
  const code = (lng || 'en').slice(0, 2).toLowerCase();
  return MAP_PICKER_LABELS[code] || MAP_PICKER_LABELS.en;
};
const DISTANCE_LABELS: Record<string, DistanceLabel> = {
  en: { title: 'Distance between activities', optional: 'Optional', help: 'Choose how close activities should be on the same day. Default: search across the whole city.', clear: 'Clear',
    any: 'Anywhere', compact: 'Compact', medium: 'Medium', wide: 'Wide', custom: 'Custom',
    anyHint: 'Whole city', compactHint: '~1.5 km', mediumHint: '~5 km', wideHint: '~12 km', customHint: 'Set distance',
    radiusLabel: 'Search radius', km: 'km', mi: 'mi', unitLabel: 'Unit', minMaxError: 'Enter a value between 0.5 and 50 km (0.3–31 mi)', invalidNumberError: 'Please enter a valid number',
    centerLabel: 'Center point (optional)', centerPlaceholder: 'e.g. Burj Khalifa, my hotel, downtown...', centerHelp: 'Activities will be picked near this anchor instead of spread across the city.',
    pickFromMap: 'Open in maps', pickFromCity: 'Search address', pickerTitle: 'Choose your daily anchor', pickerHelp: 'Search a landmark, hotel, or address. We will use it as the center for all daily activities.', useThis: 'Use this place', cancel: 'Cancel',
    livePreviewTitle: 'Daily range preview', perDayRange: 'Per-day search radius', cityWide: 'No limit (whole city)', nearAnchor: 'around your anchor',
    searching: 'Searching addresses…', noResults: 'No matching addresses found', previewOnMap: 'Preview on map', suggestions: 'Suggestions' },
  ar: { title: 'مدى المسافة بين الأنشطة', optional: 'اختياري', help: 'حدّد كم تريد أن تكون الأنشطة قريبة من بعضها في اليوم الواحد. الافتراضي: البحث في كل المدينة.', clear: 'تفريغ',
    any: 'الوضع العادي', compact: 'مسافات صغيرة', medium: 'مسافات متوسطة', wide: 'مسافات كبيرة', custom: 'مخصص',
    anyHint: 'كل المدينة', compactHint: '~1.5 كم', mediumHint: '~5 كم', wideHint: '~12 كم', customHint: 'حدّد المسافة',
    radiusLabel: 'نصف قطر البحث', km: 'كم', mi: 'ميل', unitLabel: 'الوحدة', minMaxError: 'أدخل قيمة بين 0.5 و 50 كم (0.3–31 ميل)', invalidNumberError: 'الرجاء إدخال رقم صالح',
    centerLabel: 'نقطة المركز (اختياري)', centerPlaceholder: 'مثال: برج خليفة، فندقي، وسط المدينة...', centerHelp: 'سيختار النظام أنشطة قريبة من هذا المكان بدلاً من توزيعها في كل المدينة.',
    pickFromMap: 'فتح في الخرائط', pickFromCity: 'بحث عن عنوان', pickerTitle: 'اختر مركز رحلتك اليومية', pickerHelp: 'ابحث عن معلم أو فندق أو عنوان. سنستخدمه كمركز لجميع أنشطة اليوم.', useThis: 'استخدام هذا المكان', cancel: 'إلغاء',
    livePreviewTitle: 'معاينة المدى اليومي', perDayRange: 'نصف قطر البحث اليومي', cityWide: 'بدون حد (كل المدينة)', nearAnchor: 'حول مركزك',
    searching: 'جاري البحث عن العناوين…', noResults: 'لم يتم العثور على عناوين مطابقة', previewOnMap: 'معاينة على الخريطة', suggestions: 'الاقتراحات' },
  ur: { title: 'سرگرمیوں کے درمیان فاصلہ', optional: 'اختیاری', help: 'منتخب کریں کہ ایک ہی دن میں سرگرمیاں کتنی قریب ہونی چاہئیں۔ ڈیفالٹ: پورے شہر میں تلاش۔', clear: 'صاف کریں',
    any: 'کہیں بھی', compact: 'مختصر', medium: 'درمیانی', wide: 'وسیع', custom: 'حسب ضرورت',
    anyHint: 'پورا شہر', compactHint: '~1.5 کلومیٹر', mediumHint: '~5 کلومیٹر', wideHint: '~12 کلومیٹر', customHint: 'فاصلہ مقرر کریں',
    radiusLabel: 'تلاش کا رداس', km: 'کلومیٹر', mi: 'میل', unitLabel: 'یونٹ', minMaxError: '0.5 اور 50 کلومیٹر کے درمیان قیمت درج کریں (0.3–31 میل)', invalidNumberError: 'براہ کرم درست نمبر درج کریں',
    centerLabel: 'مرکزی نقطہ (اختیاری)', centerPlaceholder: 'مثلاً: برج خلیفہ، میرا ہوٹل، شہر کا مرکز...', centerHelp: 'سرگرمیاں اس مرکز کے قریب منتخب کی جائیں گی۔',
    pickFromMap: 'نقشے میں کھولیں', pickFromCity: 'پتہ تلاش کریں', pickerTitle: 'اپنا روزانہ مرکز منتخب کریں', pickerHelp: 'کوئی نشانی، ہوٹل، یا پتہ تلاش کریں۔ ہم اسے روزانہ کی سرگرمیوں کے مرکز کے طور پر استعمال کریں گے۔', useThis: 'یہ جگہ استعمال کریں', cancel: 'منسوخ کریں',
    livePreviewTitle: 'روزانہ کی حد کا پیش منظر', perDayRange: 'روزانہ کی تلاش کا رداس', cityWide: 'کوئی حد نہیں (پورا شہر)', nearAnchor: 'آپ کے مرکز کے گرد',
    searching: 'پتے تلاش کیے جا رہے ہیں…', noResults: 'کوئی مماثل پتہ نہیں ملا', previewOnMap: 'نقشے پر پیش منظر', suggestions: 'تجاویز' },
  de: { title: 'Distanz zwischen Aktivitäten', optional: 'Optional', help: 'Wählen Sie, wie nah Aktivitäten am selben Tag sein sollen. Standard: Suche in der ganzen Stadt.', clear: 'Zurücksetzen',
    any: 'Überall', compact: 'Kompakt', medium: 'Mittel', wide: 'Weit', custom: 'Benutzerdefiniert',
    anyHint: 'Ganze Stadt', compactHint: '~1,5 km', mediumHint: '~5 km', wideHint: '~12 km', customHint: 'Distanz festlegen',
    radiusLabel: 'Suchradius', km: 'km', mi: 'mi', unitLabel: 'Einheit', minMaxError: 'Bitte einen Wert zwischen 0,5 und 50 km (0,3–31 mi) eingeben', invalidNumberError: 'Bitte gültige Zahl eingeben',
    centerLabel: 'Mittelpunkt (optional)', centerPlaceholder: 'z. B. Brandenburger Tor, mein Hotel, Innenstadt...', centerHelp: 'Aktivitäten werden in der Nähe dieses Ankers ausgewählt.',
    pickFromMap: 'In Karten öffnen', pickFromCity: 'Adresse suchen', pickerTitle: 'Tagesanker wählen', pickerHelp: 'Suchen Sie nach einem Wahrzeichen, Hotel oder einer Adresse.', useThis: 'Diesen Ort verwenden', cancel: 'Abbrechen',
    livePreviewTitle: 'Tagesreichweite-Vorschau', perDayRange: 'Täglicher Suchradius', cityWide: 'Keine Begrenzung (ganze Stadt)', nearAnchor: 'um Ihren Anker',
    searching: 'Adressen werden gesucht…', noResults: 'Keine passenden Adressen gefunden', previewOnMap: 'Auf Karte anzeigen', suggestions: 'Vorschläge' },
  fr: { title: 'Distance entre les activités', optional: 'Optionnel', help: 'Choisissez à quel point les activités doivent être proches le même jour. Par défaut : toute la ville.', clear: 'Effacer',
    any: 'Partout', compact: 'Compact', medium: 'Moyen', wide: 'Large', custom: 'Personnalisé',
    anyHint: 'Toute la ville', compactHint: '~1,5 km', mediumHint: '~5 km', wideHint: '~12 km', customHint: 'Définir la distance',
    radiusLabel: 'Rayon de recherche', km: 'km', mi: 'mi', unitLabel: 'Unité', minMaxError: 'Saisissez une valeur entre 0,5 et 50 km (0,3–31 mi)', invalidNumberError: 'Veuillez saisir un nombre valide',
    centerLabel: 'Point central (optionnel)', centerPlaceholder: 'ex. Tour Eiffel, mon hôtel, centre-ville...', centerHelp: 'Les activités seront choisies près de ce point d\'ancrage.',
    pickFromMap: 'Ouvrir dans la carte', pickFromCity: 'Rechercher une adresse', pickerTitle: 'Choisissez votre point d\'ancrage', pickerHelp: 'Recherchez un monument, un hôtel ou une adresse.', useThis: 'Utiliser cet endroit', cancel: 'Annuler',
    livePreviewTitle: 'Aperçu de la portée quotidienne', perDayRange: 'Rayon de recherche quotidien', cityWide: 'Aucune limite (toute la ville)', nearAnchor: 'autour de votre point',
    searching: 'Recherche d\'adresses…', noResults: 'Aucune adresse correspondante trouvée', previewOnMap: 'Aperçu sur la carte', suggestions: 'Suggestions' },
  es: { title: 'Distancia entre actividades', optional: 'Opcional', help: 'Elige qué tan cerca deben estar las actividades el mismo día. Por defecto: toda la ciudad.', clear: 'Limpiar',
    any: 'Cualquier lugar', compact: 'Compacto', medium: 'Medio', wide: 'Amplio', custom: 'Personalizado',
    anyHint: 'Toda la ciudad', compactHint: '~1,5 km', mediumHint: '~5 km', wideHint: '~12 km', customHint: 'Definir distancia',
    radiusLabel: 'Radio de búsqueda', km: 'km', mi: 'mi', unitLabel: 'Unidad', minMaxError: 'Introduce un valor entre 0,5 y 50 km (0,3–31 mi)', invalidNumberError: 'Por favor introduce un número válido',
    centerLabel: 'Punto central (opcional)', centerPlaceholder: 'ej. Sagrada Familia, mi hotel, centro...', centerHelp: 'Las actividades se elegirán cerca de este ancla.',
    pickFromMap: 'Abrir en el mapa', pickFromCity: 'Buscar dirección', pickerTitle: 'Elige tu ancla diaria', pickerHelp: 'Busca un monumento, hotel o dirección.', useThis: 'Usar este lugar', cancel: 'Cancelar',
    livePreviewTitle: 'Vista previa del rango diario', perDayRange: 'Radio de búsqueda diario', cityWide: 'Sin límite (toda la ciudad)', nearAnchor: 'alrededor de tu ancla',
    searching: 'Buscando direcciones…', noResults: 'No se encontraron direcciones', previewOnMap: 'Vista previa en mapa', suggestions: 'Sugerencias' },
  ru: { title: 'Расстояние между активностями', optional: 'Необязательно', help: 'Выберите, насколько близко должны быть активности в один день. По умолчанию: весь город.', clear: 'Очистить',
    any: 'Везде', compact: 'Компактно', medium: 'Средне', wide: 'Широко', custom: 'Свой',
    anyHint: 'Весь город', compactHint: '~1,5 км', mediumHint: '~5 км', wideHint: '~12 км', customHint: 'Задать расстояние',
    radiusLabel: 'Радиус поиска', km: 'км', mi: 'миль', unitLabel: 'Единица', minMaxError: 'Введите значение от 0,5 до 50 км (0,3–31 миль)', invalidNumberError: 'Введите действительное число',
    centerLabel: 'Центральная точка (необязательно)', centerPlaceholder: 'например: Красная площадь, мой отель...', centerHelp: 'Активности будут выбраны рядом с этой точкой.',
    pickFromMap: 'Открыть на карте', pickFromCity: 'Найти адрес', pickerTitle: 'Выберите якорь дня', pickerHelp: 'Найдите достопримечательность, отель или адрес.', useThis: 'Использовать это место', cancel: 'Отмена',
    livePreviewTitle: 'Предпросмотр дневного радиуса', perDayRange: 'Радиус поиска на день', cityWide: 'Без ограничений (весь город)', nearAnchor: 'вокруг вашей точки',
    searching: 'Поиск адресов…', noResults: 'Совпадений не найдено', previewOnMap: 'Просмотр на карте', suggestions: 'Подсказки' },
  zh: { title: '活动之间的距离', optional: '可选', help: '选择同一天活动的接近程度。默认：全市搜索。', clear: '清除',
    any: '任何地方', compact: '紧凑', medium: '中等', wide: '宽广', custom: '自定义',
    anyHint: '整个城市', compactHint: '~1.5 公里', mediumHint: '~5 公里', wideHint: '~12 公里', customHint: '设置距离',
    radiusLabel: '搜索半径', km: '公里', mi: '英里', unitLabel: '单位', minMaxError: '请输入 0.5 到 50 公里之间的值（0.3–31 英里）', invalidNumberError: '请输入有效数字',
    centerLabel: '中心点（可选）', centerPlaceholder: '例如：外滩、我的酒店、市中心...', centerHelp: '活动将在此锚点附近选择。',
    pickFromMap: '在地图中打开', pickFromCity: '搜索地址', pickerTitle: '选择您的每日锚点', pickerHelp: '搜索地标、酒店或地址。', useThis: '使用此地点', cancel: '取消',
    livePreviewTitle: '每日范围预览', perDayRange: '每日搜索半径', cityWide: '无限制（整个城市）', nearAnchor: '在您的锚点周围',
    searching: '正在搜索地址…', noResults: '未找到匹配的地址', previewOnMap: '在地图上预览', suggestions: '建议' },
};
const getDistanceLabels = (lng?: string): DistanceLabel => {
  const code = (lng || 'en').slice(0, 2).toLowerCase();
  return DISTANCE_LABELS[code] || DISTANCE_LABELS.en;
};

const TRIP_TYPES = [
  { value: "family", labelKey: "wizard.family", icon: Users, color: "bg-blue-500" },
  { value: "economic", labelKey: "wizard.budgetType", icon: DollarSign, color: "bg-green-500" },
  { value: "luxury", labelKey: "wizard.luxuryType", icon: Star, color: "bg-amber-500" },
  { value: "adventure", labelKey: "wizard.adventure", icon: Mountain, color: "bg-red-500" },
  { value: "romantic", labelKey: "wizard.romantic", icon: Heart, color: "bg-pink-500" },
  { value: "solo", labelKey: "wizard.solo", icon: Sun, color: "bg-purple-500" },
];

const INTERCITY_TRANSPORT = [
  { value: "flight", labelKey: "wizard.flight", icon: Plane, descKey: "wizard.flightDesc" },
  { value: "personal_car", labelKey: "wizard.personalCar", icon: Car, descKey: "wizard.personalCarDesc" },
  { value: "rental_car", labelKey: "wizard.rentalCar", icon: Car, descKey: "wizard.rentalCarDesc" },
];

const LOCAL_TRANSPORT = [
  { value: "taxi", labelKey: "wizard.taxiUber", icon: Car },
  { value: "public", labelKey: "wizard.publicTransit", icon: Bus },
  { value: "rental", labelKey: "wizard.rentalCar", icon: Car },
  { value: "walking", labelKey: "wizard.walking", icon: MapPin },
];

// Animated generating messages — full i18n support across all 8 languages
const GENERATING_MESSAGES_BY_LANG: Record<string, string[]> = {
  en: [
    "Searching for the best places...",
    "Picking the finest restaurants & cafes...",
    "Carefully organizing your schedule...",
    "Calculating estimated costs...",
    "Adding local travel tips...",
    "Final touches on your plan...",
  ],
  ar: [
    "جاري البحث عن أفضل الأماكن...",
    "نختار لك أجمل المطاعم والمقاهي...",
    "نرتب جدولك الزمني بعناية...",
    "نحسب التكاليف التقديرية...",
    "نضيف نصائح السفر المحلية...",
    "اللمسات الأخيرة على خطتك...",
  ],
  fr: [
    "Recherche des meilleurs endroits...",
    "Sélection des meilleurs restaurants et cafés...",
    "Organisation soignée de votre programme...",
    "Calcul des coûts estimés...",
    "Ajout de conseils de voyage locaux...",
    "Dernières touches à votre plan...",
  ],
  es: [
    "Buscando los mejores lugares...",
    "Seleccionando los mejores restaurantes y cafés...",
    "Organizando cuidadosamente tu agenda...",
    "Calculando los costos estimados...",
    "Agregando consejos de viaje locales...",
    "Toques finales a tu plan...",
  ],
  de: [
    "Suche nach den besten Orten...",
    "Auswahl der besten Restaurants und Cafés...",
    "Sorgfältige Organisation Ihres Zeitplans...",
    "Berechnung der geschätzten Kosten...",
    "Hinzufügen lokaler Reisetipps...",
    "Letzter Schliff an Ihrem Plan...",
  ],
  ru: [
    "Ищем лучшие места...",
    "Подбираем лучшие рестораны и кафе...",
    "Тщательно составляем ваш график...",
    "Рассчитываем ориентировочные расходы...",
    "Добавляем местные советы для путешествий...",
    "Последние штрихи к вашему плану...",
  ],
  zh: [
    "正在搜索最佳地点...",
    "为您挑选最棒的餐厅和咖啡馆...",
    "正在精心安排您的行程...",
    "正在计算预估费用...",
    "正在添加本地旅行小贴士...",
    "您的计划即将完成...",
  ],
  ur: [
    "بہترین مقامات تلاش کیے جا رہے ہیں...",
    "بہترین ریستوران اور کیفے کا انتخاب...",
    "آپ کے شیڈول کو ترتیب دیا جا رہا ہے...",
    "تخمینی اخراجات کا حساب لگایا جا رہا ہے...",
    "مقامی سفری نکات شامل کیے جا رہے ہیں...",
    "آپ کے پلان پر آخری ٹچ...",
  ],
};

const PREPARING_LABELS: Record<string, (dest: string) => string> = {
  en: (d) => `✈️ Preparing your dream trip to ${d}`,
  ar: (d) => `✈️ جاري تجهيز رحلة أحلامك إلى ${d}`,
  fr: (d) => `✈️ Préparation de votre voyage de rêve à ${d}`,
  es: (d) => `✈️ Preparando tu viaje soñado a ${d}`,
  de: (d) => `✈️ Wir bereiten Ihre Traumreise nach ${d} vor`,
  ru: (d) => `✈️ Готовим ваше путешествие мечты в ${d}`,
  zh: (d) => `✈️ 正在为您准备前往 ${d} 的梦想之旅`,
  ur: (d) => `✈️ ${d} کا آپ کا خوابوں کا سفر تیار کیا جا رہا ہے`,
};

const GENERATION_PROGRESS_STEPS: Record<string, Array<{ key: string; label: string; detail: string; progress: number }>> = {
  en: [
    { key: "prepare", label: "Preparing data", detail: "Reading your dates, cities, meals and special requests.", progress: 12 },
    { key: "special", label: "Applying special requests", detail: "Checking every condition before choosing places.", progress: 28 },
    { key: "generate", label: "Building the plan", detail: "Selecting activities and restaurants for each day.", progress: 48 },
    { key: "hours", label: "Arranging hours", detail: "Ordering times and validating opening hours.", progress: 68 },
    { key: "dedupe", label: "Removing duplicates", detail: "Keeping every activity and meal visible once.", progress: 84 },
    { key: "maps", label: "Fetching maps", detail: "Adding addresses, coordinates and Google Maps links.", progress: 94 },
    { key: "save", label: "Saving itinerary", detail: "Finalizing your trip page.", progress: 100 },
  ],
  ar: [
    { key: "prepare", label: "تحضير البيانات", detail: "نقرأ التواريخ والمدن والوجبات والطلبات الخاصة.", progress: 12 },
    { key: "special", label: "تطبيق الطلبات الخاصة", detail: "نفحص كل شرط قبل اختيار الأماكن.", progress: 28 },
    { key: "generate", label: "بناء الخطة", detail: "نختار الأنشطة والمطاعم لكل يوم.", progress: 48 },
    { key: "hours", label: "ترتيب الساعات", detail: "نرتب الأوقات ونتحقق من ساعات العمل.", progress: 68 },
    { key: "dedupe", label: "إزالة التكرار", detail: "نضمن ظهور كل نشاط ووجبة مرة واحدة فقط.", progress: 84 },
    { key: "maps", label: "جلب خرائط", detail: "نضيف العناوين والإحداثيات وروابط Google Maps.", progress: 94 },
    { key: "save", label: "حفظ الخطة", detail: "نجهّز صفحة رحلتك النهائية.", progress: 100 },
  ],
};

const getGenerationProgressSteps = (language?: string) => {
  const code = (language || "en").slice(0, 2).toLowerCase();
  return GENERATION_PROGRESS_STEPS[code] || GENERATION_PROGRESS_STEPS.en;
};

const GENERATION_STEP_ORDER = ["prepare", "special", "generate", "hours", "dedupe", "maps", "save"];

const shouldAdvanceGenerationStep = (current: string, next: string) => {
  const currentIndex = GENERATION_STEP_ORDER.indexOf(current);
  const nextIndex = GENERATION_STEP_ORDER.indexOf(next);
  if (nextIndex === -1) return false;
  if (currentIndex === -1) return true;
  return nextIndex >= currentIndex;
};

const isGenerationCompleteStep = (step: string) =>
  step === GENERATION_STEP_ORDER[GENERATION_STEP_ORDER.length - 1];

const GeneratingMessages = ({ destination, progressStep, backendProgress }: { destination: string; progressStep: string; backendProgress?: number | null }) => {
  const { i18n } = useTranslation();
  const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
  const messages = GENERATING_MESSAGES_BY_LANG[code] || GENERATING_MESSAGES_BY_LANG.en;
  const prepLabel = (PREPARING_LABELS[code] || PREPARING_LABELS.en)(destination);
  const steps = getGenerationProgressSteps(i18n.language);
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === progressStep));
  const activeStep = steps[activeIndex] || steps[0];
  const nextStep = steps[Math.min(steps.length - 1, activeIndex + 1)] || activeStep;
  const [msgIndex, setMsgIndex] = useState(0);
  // Always start the bar at 0% so users see it fill from empty → full,
  // not jumping straight to the first step's checkpoint (e.g. 12%).
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [visualProgress, setVisualProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [messages.length]);

  useEffect(() => {
    setSmoothProgress(prev => Math.max(prev, activeStep.progress));
    if (activeIndex >= steps.length - 1) return;
    const softCaps: Record<string, number> = {
      prepare: 24,
      special: 44,
      generate: 80,
      hours: 90,
      dedupe: 94,
      maps: 98,
    };
    const target = Math.max(activeStep.progress + 1, softCaps[activeStep.key] ?? (nextStep.progress - 2));
    const start = Math.max(smoothProgress, activeStep.progress);
    const span = Math.max(1, target - start);
    const stepDurationMs = activeStep.key === "generate" ? 90000 : 24000;
    const tickMs = 600;
    const ticks = Math.max(1, Math.floor(stepDurationMs / tickMs));
    const increment = span / ticks;
    let current = start;
    const id = setInterval(() => {
      current = Math.min(target, current + increment);
      setSmoothProgress(prev => Math.max(prev, Math.round(current)));
      if (current >= target) clearInterval(id);
    }, tickMs);
    return () => clearInterval(id);
  }, [activeIndex, activeStep.progress, activeStep.key, nextStep.progress, steps.length]);

  // Real backend events take priority — show whichever number is highest so
  // the bar never goes backwards but always reflects true progress when the
  // edge function emits a checkpoint.
  const rawDisplayProgress = Math.max(
    activeStep.progress,
    smoothProgress,
    typeof backendProgress === "number" ? backendProgress : 0,
  );

  useEffect(() => {
    setVisualProgress(prev => Math.min(100, Math.max(prev, rawDisplayProgress)));
  }, [rawDisplayProgress]);

  const displayProgress = visualProgress;
  const isComplete = displayProgress >= 100 || isGenerationCompleteStep(activeStep.key);

  return (
    <div className="space-y-3">
      <p className="text-lg font-bold text-primary">
        {prepLabel}
      </p>
      <div className="max-w-md mx-auto text-start space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold">
          <span className="text-foreground">{activeStep.label}</span>
          <span className={cn(isComplete ? "text-success" : "text-primary")}>{isComplete ? 100 : displayProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full transition-colors duration-500", isComplete ? "bg-success" : "bg-primary")}
            initial={false}
            animate={{ width: `${isComplete ? 100 : displayProgress}%` }}
            transition={{ duration: isComplete ? 0.7 : 0.5, ease: "easeOut" }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center sm:text-start">{activeStep.detail}</p>
        <div className="grid grid-cols-7 gap-1 overflow-hidden" aria-hidden="true">
          {steps.map((step, index) => (
            <div key={step.key} className={cn(
              "h-1 min-w-0 rounded-full transition-colors duration-500",
              isComplete || index < activeIndex ? "bg-success" : index === activeIndex ? "bg-primary/70 animate-pulse" : "bg-muted"
            )} />
          ))}
        </div>
        {isComplete && (
          <motion.div
            className="mx-auto mt-2 h-2 w-2 rounded-full bg-success"
            initial={{ scale: 0.7, opacity: 0.7 }}
            animate={{ scale: [0.7, 1.35, 1], opacity: [0.7, 1, 0.9] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={msgIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-muted-foreground"
        >
          {messages[msgIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

// Food preferences are now handled entirely by MealOptions component (cuisineTypes)

const ACTIVITY_PREFS = [
  { value: "nature", labelKey: "wizard.nature", icon: TreePine },
  { value: "shopping", labelKey: "wizard.shopping", icon: ShoppingBag },
  { value: "culture", labelKey: "wizard.culture", icon: History },
  { value: "beach", labelKey: "wizard.beaches", icon: Waves },
  { value: "adventure", labelKey: "wizard.adventureAct", icon: Mountain },
  { value: "art", labelKey: "wizard.artMuseums", icon: Palette },
  { value: "entertainment", labelKey: "wizard.entertainment", icon: Gamepad2 },
  { value: "relaxation", labelKey: "wizard.relaxation", icon: Coffee },
  { value: "nightlife", labelKey: "wizard.nightlife", icon: Moon },
  { value: "sports", labelKey: "wizard.sports", icon: Zap },
];

// Auto-select activity preferences based on trip type
const TRIP_TYPE_ACTIVITY_MAP: Record<string, string[]> = {
  family: ["entertainment", "nature", "culture", "shopping"],
  economic: ["nature", "culture", "shopping"],
  luxury: ["relaxation", "art", "shopping", "nightlife"],
  adventure: ["adventure", "nature", "sports"],
  romantic: ["relaxation", "art", "nature", "nightlife"],
  solo: ["adventure", "culture", "nightlife", "nature"],
};

const PACE_OPTIONS = [
  { value: "fast", labelKey: "wizard.fastPaced", icon: Zap },
  { value: "moderate", labelKey: "wizard.moderate", icon: Sun },
  { value: "relaxed", labelKey: "wizard.relaxed", icon: Coffee },
];

const DEFAULT_FREE_LIMIT = 3;
const PREFILL_TOAST_KEY = "trip_wizard_last_prefill";
const TRIP_WIZARD_DRAFT_KEY = "trip_wizard_last_draft";
const TRIP_WIZARD_PENDING_KEY = "trip_wizard_last_pending_request";
const TRIP_WIZARD_LAST_RESULT_KEY = "trip_wizard_last_result";
const TRIP_WIZARD_SEEN_PREFIX = "trip_wizard_seen_activities_";

const buildSeenKey = (destination: string) => {
  const normalized = String(destination || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
  return `${TRIP_WIZARD_SEEN_PREFIX}${normalized || 'unknown'}`;
};

const readSeenActivities = (destination: string): string[] => {
  try {
    const raw = localStorage.getItem(buildSeenKey(destination));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
};

const appendSeenActivities = (destination: string, names: string[]) => {
  try {
    const key = buildSeenKey(destination);
    const existing = readSeenActivities(destination);
    const merged = Array.from(new Set([...existing, ...names.filter(Boolean)]));
    // Cap at 300 to avoid bloat
    const trimmed = merged.slice(-300);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {}
};

const getTodayKey = () => `trip_gen_count_${new Date().toISOString().split('T')[0]}`;

const stableSerialize = (value: any): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

const buildRequestSignature = (payload: Record<string, any>) => stableSerialize(payload);

const readFunctionErrorPayload = async (functionError: any): Promise<any | null> => {
  try {
    const response = functionError?.context;
    if (!response || typeof response.clone !== 'function') return null;
    const clone = response.clone();
    try {
      return await clone.json();
    } catch {
      const text = await clone.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }
  } catch {
    return null;
  }
};

// Fetch real daily usage count from DB (rows today, not sum of quantities)
const fetchTodayUsageFromDB = async (userId: string): Promise<number> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('usage_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('used_at', today.toISOString());
    return count || 0;
  } catch { return 0; }
};

const getTodayGenerationCount = (): number => {
  try { return parseInt(localStorage.getItem(getTodayKey()) || '0', 10); } catch { return 0; }
};

const incrementGenerationCount = () => {
  try { localStorage.setItem(getTodayKey(), String(getTodayGenerationCount() + 1)); } catch { }
};

const TripWizard = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { t, i18n } = useTranslation();
  const { currency, formatPrice } = useCurrency();
  const { user } = useAuth();
  const { maxActivitiesPerDay, remainingActivities, maxTotalActivities, usedActivities, hasPlan, planName, planNameAr, serpapiHotelsEnabled, canUseSerpapiHotels, remainingSerpapiHotels } = useSubscriptionLimits();
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgressStep, setGenerationProgressStep] = useState("prepare");
  // Real-time progress driven by the edge function's broadcast events.
  // When the backend emits a checkpoint, we lift the bar to that exact %,
  // overriding the time-based smoothing so users see actual milestones.
  const [backendProgress, setBackendProgress] = useState<{ step: string; progress: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [generationsUsed, setGenerationsUsed] = useState(getTodayGenerationCount());
  const [userDailyLimit, setUserDailyLimit] = useState(DEFAULT_FREE_LIMIT);
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null);
  const [generatedItineraryId, setGeneratedItineraryId] = useState<string>("");
  const lastAutoFillSearchRef = useRef<string | null>(null);
  const stepCardRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const refreshGenerationLimits = async () => {
    if (!user) {
      const { data: siteSettings } = await supabase
        .from("site_settings")
        .select("free_user_daily_limit")
        .eq("id", "default")
        .maybeSingle();
      setUserDailyLimit(siteSettings?.free_user_daily_limit || DEFAULT_FREE_LIMIT);
      return;
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, subscription_plans(max_daily_generations)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let limit = DEFAULT_FREE_LIMIT;
    if (sub?.subscription_plans) {
      limit = (sub.subscription_plans as any).max_daily_generations || DEFAULT_FREE_LIMIT;
    } else {
      const { data: siteSettings } = await supabase
        .from("site_settings")
        .select("free_user_daily_limit")
        .eq("id", "default")
        .maybeSingle();
      limit = siteSettings?.free_user_daily_limit || DEFAULT_FREE_LIMIT;
    }

    const { data: overrides } = await supabase
      .from("user_generation_overrides")
      .select("value")
      .eq("user_id", user.id)
      .eq("override_type", "bonus_generations");

    if (overrides?.length) {
      limit += overrides.reduce((sum: number, row: any) => sum + (row.value || 0), 0);
    }

    setUserDailyLimit(limit);
  };

  // Refresh daily count from DB for logged-in users
  const refreshDailyCountFromDB = async () => {
    if (!user) return;
    const dbCount = await fetchTodayUsageFromDB(user.id);
    setGenerationsUsed(dbCount);
    localStorage.setItem(getTodayKey(), String(dbCount));
  };

  useEffect(() => {
    refreshGenerationLimits();
    refreshDailyCountFromDB();
  }, [user]);

  // Step 1
  const [destination, setDestination] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [finalArrivalCity, setFinalArrivalCity] = useState("");
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();
  const [duration, setDuration] = useState(3);
  const [travelers, setTravelers] = useState(2);
  const [children, setChildren] = useState(0);
  const [tripType, setTripType] = useState("");
  const [budget, setBudget] = useState("");

  // Multi-city
  interface CityLeg {
    city: string;
    transport: string;
    days: number;
    // Optional per-leg center point so multi-city trips can anchor each city
    // to a specific landmark/area (e.g. "Old Town" in Prague, "Shibuya" in Tokyo).
    centerPoint?: string;
    centerPointCoords?: { lat: number; lon: number };
  }
  const [multiCity, setMultiCity] = useState(false);
  const [cityLegs, setCityLegs] = useState<CityLeg[]>([]);
  // Fair auto-split: when ON, distribute total trip days evenly across cities and
  // never let total exceed the selected date range.
  const [autoSplitDays, setAutoSplitDays] = useState(true);

  // Helper: evenly distribute `total` days across `n` legs (remainder goes to first legs)
  const evenSplit = (total: number, n: number): number[] => {
    if (n <= 0) return [];
    const safeTotal = Math.max(n, total); // at least 1 per city
    const base = Math.floor(safeTotal / n);
    const remainder = safeTotal - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
  };

  const addCityLeg = () => {
    setCityLegs(prev => {
      const next = [...prev, { city: "", transport: "flight", days: 2 }];
      if (autoSplitDays && duration > 0) {
        const split = evenSplit(duration, next.length);
        return next.map((leg, i) => ({ ...leg, days: split[i] }));
      }
      return next;
    });
  };
  const removeCityLeg = (index: number) => {
    setCityLegs(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (autoSplitDays && duration > 0 && next.length > 0) {
        const split = evenSplit(duration, next.length);
        return next.map((leg, i) => ({ ...leg, days: split[i] }));
      }
      return next;
    });
    // If removing makes it empty, disable multi-city
    if (cityLegs.length <= 1) setMultiCity(false);
  };
  const updateCityLeg = (index: number, field: keyof CityLeg, value: string | number) => {
    setCityLegs(prev => {
      // When changing days with auto-split ON: clamp so total never exceeds date range,
      // and rebalance the rest of the cities to absorb the difference.
      if (field === 'days' && autoSplitDays && duration > 0 && prev.length > 1) {
        const target = duration;
        const otherCount = prev.length - 1;
        // Each other city must have at least 1 day → cap requested value
        const requested = Math.max(1, Number(value) || 1);
        const maxForThis = Math.max(1, target - otherCount);
        const newDays = Math.min(requested, maxForThis);
        const remainingForOthers = Math.max(otherCount, target - newDays);
        const split = evenSplit(remainingForOthers, otherCount);
        let k = 0;
        return prev.map((leg, i) => {
          if (i === index) return { ...leg, days: newDays };
          const d = split[k++];
          return { ...leg, days: d };
        });
      }
      return prev.map((leg, i) => i === index ? { ...leg, [field]: value } : leg);
    });
  };

  // When auto-split is turned ON, immediately distribute evenly across existing cities
  useEffect(() => {
    if (autoSplitDays && multiCity && cityLegs.length > 0 && duration > 0) {
      const split = evenSplit(duration, cityLegs.length);
      const current = cityLegs.map(l => l.days).join(',');
      const next = split.join(',');
      if (current !== next) {
        setCityLegs(prev => prev.map((leg, i) => ({ ...leg, days: split[i] })));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSplitDays, duration, multiCity, cityLegs.length]);
  const moveCityLeg = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= cityLegs.length) return;
    setCityLegs(prev => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated;
    });
  };

  // When multi-city is active (not tour mode), first cityLeg is the destination
  const effectiveMultiCityDestination = multiCity && cityLegs.length > 0 && cityLegs[0].city ? cityLegs[0].city : '';

  // Save current multi-city setup as custom template
  const saveAsCustomTemplate = () => {
    if (cityLegs.length < 2 || !cityLegs.every(l => l.city)) {
      toast.error(i18n.language?.startsWith('ar') ? 'يجب إضافة مدينتين على الأقل' : 'Add at least 2 cities');
      return;
    }
    const templateName = prompt(i18n.language?.startsWith('ar') ? 'اسم القالب:' : 'Template name:');
    if (!templateName) return;
    const customTemplates = JSON.parse(localStorage.getItem('custom_trip_templates') || '[]');
    const newTemplate = {
      id: `custom-${Date.now()}`,
      label: templateName,
      labelAr: templateName,
      cities: cityLegs.map(l => ({ city: l.city, days: l.days })),
      duration: cityLegs.reduce((s, l) => s + l.days, 0),
      type: 'region-tour' as const,
      gradient: 'from-violet-500 to-purple-600',
      emoji: '📌',
      isCustom: true,
    };
    customTemplates.push(newTemplate);
    localStorage.setItem('custom_trip_templates', JSON.stringify(customTemplates));
    // Silent save - no toast
  };

  // Auto-update total duration when multi-city changes (only when auto-split is OFF —
  // in manual mode the trip duration follows the sum of city days). When auto-split is ON,
  // the date range is the source of truth and city days are derived from it.
  useEffect(() => {
    if (multiCity && cityLegs.length > 0 && !autoSplitDays) {
      const legDays = cityLegs.reduce((sum, l) => sum + l.days, 0);
      setDuration(legDays);
    }
  }, [cityLegs, multiCity, autoSplitDays]);

  // Transport
  const [intercityTransport, setIntercityTransport] = useState("");
  const [localTransport, setLocalTransport] = useState<string[]>([]);
  const [fuelEfficiency, setFuelEfficiency] = useState("8");
  const [fuelPrice, setFuelPrice] = useState("2.5");

  // Booking preferences
  const [wantHotel, setWantHotel] = useState(true);
  const [wantFlight, setWantFlight] = useState(false);
  const [flightTripType, setFlightTripType] = useState<"round" | "oneway">("round");
  // Hotel filters (used for SerpAPI auto-pick + booking)
  const [accommodationType, setAccommodationType] = useState<'any' | 'hotel' | 'apartment' | 'resort' | 'villa' | 'hostel'>('any');
  const [hotelStarRating, setHotelStarRating] = useState<number>(0); // 0 = any
  const [maxBudgetPerNight, setMaxBudgetPerNight] = useState<string>(""); // empty = no cap

  // Step 2
  // foodPrefs removed - now using mealPreferences.cuisineTypes from MealOptions
  const [activityPrefs, setActivityPrefs] = useState<string[]>([]);
  const [pace, setPace] = useState("moderate");
  const [wakeTime, setWakeTime] = useState("08:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [specialRequests, setSpecialRequests] = useState("");
  const [minRating, setMinRating] = useState("4");
  const [hasChildren, setHasChildren] = useState(false);
  const [activitiesPerDay, setActivitiesPerDay] = useState(0); // 0 = auto

  // Distance preferences (optional)
  // 'any' = default — search the whole city. 'compact' / 'medium' / 'wide' = preset radii.
  // 'custom' = use customRadiusKm. Optional centerPoint anchors all activities near a chosen landmark.
  const [distanceMode, setDistanceMode] = useState<'any' | 'compact' | 'medium' | 'wide' | 'custom'>('any');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [customRadiusKm, setCustomRadiusKm] = useState<string>("3");
  const [centerPoint, setCenterPoint] = useState<string>("");
  const [centerPointCoords, setCenterPointCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [centerPickerOpen, setCenterPickerOpen] = useState(false);
  const [centerPickerQuery, setCenterPickerQuery] = useState("");
  const [centerPickerResults, setCenterPickerResults] = useState<Array<{ name: string; display: string; lat: number; lon: number }>>([]);
  const [centerPickerLoading, setCenterPickerLoading] = useState(false);
  const [centerPickerSelected, setCenterPickerSelected] = useState<{ name: string; lat: number; lon: number } | null>(null);
  // Tab inside the picker dialog: 'search' (autocomplete) or 'map' (interactive Leaflet)
  const [pickerMode, setPickerMode] = useState<'search' | 'map'>('search');
  const [geolocating, setGeolocating] = useState(false);
  // Live distance check between pinned coords and the destination city.
  // distanceKm = null → not yet computed; cityCoords used to avoid refetching for the same destination.
  const [pickerDistanceKm, setPickerDistanceKm] = useState<number | null>(null);
  const [pickerCityCoords, setPickerCityCoords] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [pickerCheckingDistance, setPickerCheckingDistance] = useState(false);
  // When set, the center-point picker is editing a specific multi-city leg
  // (per-leg anchor) instead of the global single-city centerPoint.
  const [legCenterPickerIndex, setLegCenterPickerIndex] = useState<number | null>(null);
  const [overrideAccepted, setOverrideAccepted] = useState(false);
  const ACCURACY_THRESHOLD_KM = 80;

  // Meal preferences
  const [mealPreferences, setMealPreferences] = useState<MealPreferences>({
    breakfast: false, lunch: false, dinner: false, snacks: false, budgetPerMeal: 'moderate',
  });

  // Quick trip type
  const [quickTripType, setQuickTripType] = useState<QuickTripType | null>(null);

  // Cost breakdown
  const [costBreakdown, setCostBreakdown] = useState({
    flights: 0, hotels: 0, meals: 0, activities: 0, carRental: 0,
  });

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(TRIP_WIZARD_DRAFT_KEY);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      if (draft.destination) setDestination(draft.destination);
      if (draft.departureCity) setDepartureCity(draft.departureCity);
      if (typeof draft.finalArrivalCity === 'string') setFinalArrivalCity(draft.finalArrivalCity);
      if (draft.eventName) setEventName(draft.eventName);
      if (draft.startDate) {
        const parsed = new Date(draft.startDate);
        if (!isNaN(parsed.getTime())) setStartDate(parsed);
      }
      if (draft.returnDate) {
        const parsed = new Date(draft.returnDate);
        if (!isNaN(parsed.getTime())) setReturnDate(parsed);
      }
      if (typeof draft.duration === 'number') setDuration(draft.duration);
      if (typeof draft.travelers === 'number') setTravelers(draft.travelers);
      if (typeof draft.children === 'number') setChildren(draft.children);
      if (typeof draft.tripType === 'string') setTripType(draft.tripType);
      if (typeof draft.budget === 'string') setBudget(draft.budget);
      if (typeof draft.multiCity === 'boolean') setMultiCity(draft.multiCity);
      if (Array.isArray(draft.cityLegs)) setCityLegs(draft.cityLegs);
      if (typeof draft.autoSplitDays === 'boolean') setAutoSplitDays(draft.autoSplitDays);
      if (typeof draft.intercityTransport === 'string') setIntercityTransport(draft.intercityTransport);
      if (Array.isArray(draft.localTransport)) setLocalTransport(draft.localTransport);
      if (typeof draft.fuelEfficiency === 'string') setFuelEfficiency(draft.fuelEfficiency);
      if (typeof draft.fuelPrice === 'string') setFuelPrice(draft.fuelPrice);
      if (typeof draft.wantHotel === 'boolean') setWantHotel(draft.wantHotel);
      if (typeof draft.wantFlight === 'boolean') setWantFlight(draft.wantFlight);
      if (draft.flightTripType === 'round' || draft.flightTripType === 'oneway') setFlightTripType(draft.flightTripType);
      if (typeof draft.accommodationType === 'string') setAccommodationType(draft.accommodationType);
      if (typeof draft.hotelStarRating === 'number') setHotelStarRating(draft.hotelStarRating);
      if (typeof draft.maxBudgetPerNight === 'string') setMaxBudgetPerNight(draft.maxBudgetPerNight);
      if (Array.isArray(draft.activityPrefs)) setActivityPrefs(draft.activityPrefs);
      if (typeof draft.pace === 'string') setPace(draft.pace);
      if (typeof draft.wakeTime === 'string') setWakeTime(draft.wakeTime);
      if (typeof draft.sleepTime === 'string') setSleepTime(draft.sleepTime);
      if (typeof draft.specialRequests === 'string') setSpecialRequests(draft.specialRequests);
      if (typeof draft.minRating === 'string') setMinRating(draft.minRating);
      if (typeof draft.hasChildren === 'boolean') setHasChildren(draft.hasChildren);
      if (typeof draft.activitiesPerDay === 'number') setActivitiesPerDay(draft.activitiesPerDay);
      if (typeof draft.distanceMode === 'string' && ['any','compact','medium','wide','custom'].includes(draft.distanceMode)) setDistanceMode(draft.distanceMode);
      if (typeof draft.distanceUnit === 'string' && ['km','mi'].includes(draft.distanceUnit)) setDistanceUnit(draft.distanceUnit);
      if (typeof draft.customRadiusKm === 'string') setCustomRadiusKm(draft.customRadiusKm);
      if (typeof draft.centerPoint === 'string') setCenterPoint(draft.centerPoint);
      if (draft.centerPointCoords && typeof draft.centerPointCoords.lat === 'number' && typeof draft.centerPointCoords.lon === 'number') setCenterPointCoords(draft.centerPointCoords);
      if (draft.mealPreferences && typeof draft.mealPreferences === 'object') setMealPreferences(draft.mealPreferences);
      if (typeof draft.quickTripType === 'string') setQuickTripType(draft.quickTripType as QuickTripType);
      if (draft.costBreakdown && typeof draft.costBreakdown === 'object') setCostBreakdown(draft.costBreakdown);
    } catch {
      // ignore corrupted draft
    }
  }, []);

  useEffect(() => {
    try {
      const pendingRaw = localStorage.getItem(TRIP_WIZARD_PENDING_KEY);
      const cachedRaw = localStorage.getItem(TRIP_WIZARD_LAST_RESULT_KEY);
      if (!pendingRaw || !cachedRaw) return;

      const pending = JSON.parse(pendingRaw);
      const cached = JSON.parse(cachedRaw);
      if (!pending?.requestSignature || pending.requestSignature !== cached?.requestSignature || !cached?.itineraryId) return;

      const savedItineraryRaw = localStorage.getItem(`itinerary-${cached.itineraryId}`);
      if (!savedItineraryRaw) return;

      const savedItinerary = JSON.parse(savedItineraryRaw);
      setGeneratedItinerary(savedItinerary);
      setGeneratedItineraryId(cached.itineraryId);
      localStorage.removeItem(TRIP_WIZARD_PENDING_KEY);
      navigate(`/itinerary/${cached.itineraryId}`);
    } catch {
      // ignore restore errors
    }
  }, [navigate]);

  useEffect(() => {
    try {
      localStorage.setItem(TRIP_WIZARD_DRAFT_KEY, JSON.stringify({
        destination,
        departureCity,
        finalArrivalCity,
        eventName,
        startDate: startDate?.toISOString() || null,
        returnDate: returnDate?.toISOString() || null,
        duration,
        travelers,
        children,
        tripType,
        budget,
        multiCity,
        cityLegs,
        autoSplitDays,
        intercityTransport,
        localTransport,
        fuelEfficiency,
        fuelPrice,
        wantHotel,
        wantFlight,
        flightTripType,
        accommodationType,
        hotelStarRating,
        maxBudgetPerNight,
        activityPrefs,
        pace,
        wakeTime,
        sleepTime,
        specialRequests,
        minRating,
        hasChildren,
        activitiesPerDay,
        distanceMode,
        distanceUnit,
        customRadiusKm,
        centerPoint,
        centerPointCoords,
        mealPreferences,
        quickTripType,
        costBreakdown,
      }));
    } catch {
      // ignore storage errors
    }
  }, [
    destination, departureCity, finalArrivalCity, eventName, startDate, returnDate, duration, travelers, children, tripType, budget,
    multiCity, cityLegs, autoSplitDays, intercityTransport, localTransport, fuelEfficiency, fuelPrice,
    wantHotel, wantFlight, flightTripType, accommodationType, hotelStarRating, maxBudgetPerNight, activityPrefs, pace, wakeTime, sleepTime, specialRequests,
    minRating, hasChildren, activitiesPerDay, distanceMode, distanceUnit, customRadiusKm, centerPoint, centerPointCoords, mealPreferences, quickTripType, costBreakdown,
  ]);

  // Photon (OSM) autocomplete for the daily-anchor center-point picker.
  // Debounced 300ms; fetches up to 6 suggestions, biased toward the chosen destination.
  useEffect(() => {
    const q = centerPickerQuery.trim();
    if (!centerPickerOpen || q.length < 2) {
      setCenterPickerResults([]);
      setCenterPickerLoading(false);
      return;
    }
    setCenterPickerLoading(true);
    const ctrl = new AbortController();
    const tmr = setTimeout(async () => {
      try {
        const lang = (i18n.language || 'en').slice(0, 2).toLowerCase();
        const apiLang = ['en','de','fr','it','es','ru'].includes(lang) ? lang : 'en';
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${apiLang}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error('photon failed');
        const json = await res.json();
        const out: Array<{ name: string; display: string; lat: number; lon: number }> = (json?.features || [])
          .map((f: any) => {
            const p = f?.properties || {};
            const c = f?.geometry?.coordinates;
            if (!Array.isArray(c) || c.length < 2) return null;
            const name = p.name || p.street || p.city || q;
            const parts = [p.name, p.street, p.city, p.state, p.country].filter(Boolean);
            return { name, display: parts.join(', '), lat: c[1], lon: c[0] };
          })
          .filter(Boolean) as Array<{ name: string; display: string; lat: number; lon: number }>;
        setCenterPickerResults(out);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setCenterPickerResults([]);
      } finally {
        setCenterPickerLoading(false);
      }
    }, 300);
    return () => { ctrl.abort(); clearTimeout(tmr); };
  }, [centerPickerQuery, centerPickerOpen, i18n.language]);

  // Fetch destination city coords once when the picker opens (used for accuracy distance calc).
  useEffect(() => {
    if (!centerPickerOpen) return;
    const dest = (destination || '').trim();
    if (!dest) { setPickerCityCoords(null); return; }
    if (pickerCityCoords && pickerCityCoords.name.toLowerCase() === dest.toLowerCase()) return;
    const ctrl = new AbortController();
    setPickerCheckingDistance(true);
    (async () => {
      try {
        const url = `https://kphgbuxwtggnnnakpodh.supabase.co/functions/v1/search-cities?q=${encodeURIComponent(dest)}&limit=1`;
        const res = await fetch(url, { signal: ctrl.signal });
        const json = await res.json();
        const top = json?.results?.[0];
        if (top && typeof top.latitude === 'number' && typeof top.longitude === 'number') {
          setPickerCityCoords({ name: dest, lat: top.latitude, lon: top.longitude });
        } else {
          setPickerCityCoords(null);
        }
      } catch { /* non-blocking */ }
      finally { setPickerCheckingDistance(false); }
    })();
    return () => ctrl.abort();
  }, [centerPickerOpen, destination]);

  // Recompute pinned-pin distance whenever the pin or city coords change.
  useEffect(() => {
    if (!centerPickerSelected || !pickerCityCoords) { setPickerDistanceKm(null); return; }
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(pickerCityCoords.lat - centerPickerSelected.lat);
    const dLon = toRad(pickerCityCoords.lon - centerPickerSelected.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerPickerSelected.lat)) * Math.cos(toRad(pickerCityCoords.lat)) * Math.sin(dLon / 2) ** 2;
    setPickerDistanceKm(2 * R * Math.asin(Math.sqrt(a)));
    setOverrideAccepted(false); // any movement resets override
  }, [centerPickerSelected?.lat, centerPickerSelected?.lon, pickerCityCoords?.lat, pickerCityCoords?.lon]);

  // Auto-save the pinned center to the live form state on every change so it persists across re-opens.
  // When the picker was opened to edit a specific multi-city leg, write the
  // result onto that leg instead of the global single-city center point.
  useEffect(() => {
    if (!centerPickerOpen || !centerPickerSelected) return;
    if (legCenterPickerIndex !== null) {
      setCityLegs((prev) =>
        prev.map((leg, i) =>
          i === legCenterPickerIndex
            ? { ...leg, centerPoint: centerPickerSelected.name, centerPointCoords: { lat: centerPickerSelected.lat, lon: centerPickerSelected.lon } }
            : leg
        )
      );
    } else {
      setCenterPoint(centerPickerSelected.name);
      setCenterPointCoords({ lat: centerPickerSelected.lat, lon: centerPickerSelected.lon });
    }
  }, [centerPickerOpen, centerPickerSelected?.lat, centerPickerSelected?.lon, centerPickerSelected?.name, legCenterPickerIndex]);

  // Auto-fill from URL params (e.g. from "Plan Similar Trip" in Stories)
  useEffect(() => {
    const params = new URLSearchParams(routeLocation.search);

    const decodeParam = (value: string | null) =>
      value ? decodeURIComponent(value).replace(/\+/g, " ").trim() : "";

    const normalizeDestinationText = (value: string) =>
      value.replace(/\s*#.*$/g, "").replace(/\s+[A-Z]$/g, "").trim();

    const mapTripType = (rawType: string) => {
      const normalized = rawType.toLowerCase().trim();
      if (["family", "economic", "luxury", "adventure", "romantic", "solo"].includes(normalized)) {
        return normalized;
      }
      if (["beach", "mountain", "camping", "diving", "desert", "hiking", "sports"].includes(normalized)) {
        return "adventure";
      }
      if (["city", "cultural", "culture", "food"].includes(normalized)) {
        return "solo";
      }
      return "adventure";
    };

    const mapInterest = (value: string) => {
      const v = value.toLowerCase().trim();
      if (["hiking", "mountain", "sports", "adventure"].some((k) => v.includes(k))) return "adventure";
      if (["nature", "alps", "outdoor", "park"].some((k) => v.includes(k))) return "nature";
      if (["beach", "diving", "swimming", "ocean"].some((k) => v.includes(k))) return "beach";
      if (["food", "restaurant", "cuisine"].some((k) => v.includes(k))) return "culture";
      if (["shopping", "mall", "market"].some((k) => v.includes(k))) return "shopping";
      if (["nightlife", "party"].some((k) => v.includes(k))) return "nightlife";
      return "";
    };

    const rawDestination = decodeParam(params.get("destination"));
    const stateDestination = (routeLocation.state as { prefillDestination?: string } | null)?.prefillDestination || "";
    const destinationFromParams = rawDestination ? normalizeDestinationText(rawDestination) : "";
    const destinationFromState = stateDestination ? normalizeDestinationText(stateDestination) : "";
    const finalDestination = destinationFromParams || destinationFromState;

    const dep = decodeParam(params.get("departure"));
    const budgetParam = decodeParam(params.get("budget"));
    const durationParam = decodeParam(params.get("duration"));
    const typeParam = decodeParam(params.get("tripType"));
    const travelersParam = decodeParam(params.get("travelers"));
    const transportParam = decodeParam(params.get("transport"));
    const interestsParam = decodeParam(params.get("interests"));
    const eventParam = decodeParam(params.get("event"));
    const startDateParam = decodeParam(params.get("startDate"));
    const specialPlacesParam = decodeParam(params.get("specialPlaces"));

    if (finalDestination) {
      setDestination(finalDestination);
      setQuickTripType(null);
    }
      if (eventParam) {
        setEventName(eventParam);
        if (!activityPrefs.includes("entertainment")) {
          setActivityPrefs(prev => [...new Set([...prev, "entertainment"])]);
        }
      }
      if (specialPlacesParam) {
        const existing = specialRequests ? specialRequests + '\n' : '';
        setSpecialRequests(existing + specialPlacesParam);

        // Auto-extract dates from special requests (e.g. "Match schedule: ... on YYYY-MM-DD ...")
        const dateMatches = Array.from(specialPlacesParam.matchAll(/(\d{4})-(\d{2})-(\d{2})/g));
        if (dateMatches.length > 0) {
          const dates = dateMatches
            .map((m) => new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`))
            .filter((d) => !isNaN(d.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
          if (dates.length > 0) {
            const first = dates[0];
            const last = dates[dates.length - 1];
            setStartDate(first);
            // Span = last event day inclusive (+1 to include return day after last event)
            const spanDays = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86400000) + 1);
            setReturnDate(new Date(first.getTime() + spanDays * 86400000));
            setDuration(spanDays);
          }
        }
      }

      // Handle multi-city from promotions
      const multiCitiesParam = decodeParam(params.get("multiCities"));
      if (multiCitiesParam) {
        const cities = multiCitiesParam.split('|').filter(Boolean);
        if (cities.length > 1) {
          setMultiCity(true);
          const legs = cities.map((city, i) => ({
            city,
            transport: i === 0 ? 'flight' : 'flight',
            days: Math.max(2, Math.floor((durationParam ? parseInt(durationParam) : 7) / cities.length)),
          }));
          setCityLegs(legs);
        }
      }
    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (!isNaN(parsed.getTime())) setStartDate(parsed);
    }
    if (dep) setDepartureCity(dep);
    if (budgetParam) setBudget(budgetParam);

    const parsedDuration = Number.parseInt(durationParam, 10);
    if (!Number.isNaN(parsedDuration) && parsedDuration > 0) setDuration(parsedDuration);

    if (typeParam) setTripType(mapTripType(typeParam));

    const parsedTravelers = Number.parseInt(travelersParam, 10);
    if (!Number.isNaN(parsedTravelers) && parsedTravelers > 0) setTravelers(parsedTravelers);

    if (transportParam) {
      setIntercityTransport(transportParam);
      setWantFlight(transportParam === "flight");
    }

    if (interestsParam) {
      const availablePrefs = new Set(ACTIVITY_PREFS.map((p) => p.value));
      const mapped = interestsParam
        .split(",")
        .map((item) => mapInterest(item))
        .filter((item) => availablePrefs.has(item));
      if (mapped.length > 0) {
        setActivityPrefs(Array.from(new Set(mapped)));
      }
    }

    // Multi-city support from URL params OR route-text fallback
    const multiCityParam = params.get("multiCity");
    const citiesParam = params.get("cities");
    const routeCitiesFromText = finalDestination
      .split(/(?:\s*→\s*|\s*->\s*|\s*➜\s*)/g)
      .map((part) => normalizeDestinationText(part))
      .filter(Boolean);

    let parsedLegs: CityLeg[] = [];

    if (citiesParam) {
      try {
        const parsedCities = JSON.parse(citiesParam);
        if (Array.isArray(parsedCities)) {
          parsedLegs = parsedCities
            .map((c: any) => ({
              city: normalizeDestinationText(String(c?.name || c?.city || c || "")),
              days: Number(c?.days || c?.duration) || 0,
              transport: c?.transport || transportParam || "flight",
            }))
            .filter((leg: CityLeg) => !!leg.city);
        }
      } catch (e) {
        console.warn("Failed to parse cities param:", e);
      }
    }

    if (parsedLegs.length === 0 && routeCitiesFromText.length > 1 && (multiCityParam === "true" || citiesParam)) {
      const fallbackDays = Math.max(
        1,
        Math.ceil((!Number.isNaN(parsedDuration) && parsedDuration > 0 ? parsedDuration : duration) / routeCitiesFromText.length)
      );
      parsedLegs = routeCitiesFromText.map((city) => ({
        city,
        days: fallbackDays,
        transport: transportParam || "flight",
      }));
    }

    if ((multiCityParam === "true" || parsedLegs.length > 1) && parsedLegs.length > 0) {
      setMultiCity(true);
      setCityLegs(parsedLegs);
      if (parsedLegs[0]?.city) setDestination(parsedLegs[0].city);
    }

    if (finalDestination) {
      const prefillSignature = routeLocation.search || `state:${finalDestination}`;
      const alreadyShown = sessionStorage.getItem(PREFILL_TOAST_KEY);

      if (alreadyShown !== prefillSignature && lastAutoFillSearchRef.current !== prefillSignature) {
        // Silent prefill - no toast
        sessionStorage.setItem(PREFILL_TOAST_KEY, prefillSignature);
        lastAutoFillSearchRef.current = prefillSignature;
      }

      setTimeout(() => {
        document.getElementById("plan-trip")?.scrollIntoView({ behavior: "smooth" });
      }, 250);
    }

    if (stateDestination) {
      window.history.replaceState({}, document.title);
    }
  }, [routeLocation.search, routeLocation.state, t]);

  const handleQuickTripSelect = (type: QuickTripType | null) => {
    setQuickTripType(type);
    if (type) {
      const durationMap: Record<QuickTripType, number> = {
        short: 2, weekend: 3, 'in-city': 1, nearby: 2, random: 3, free: 1,
        'country-tour': 10, 'region-tour': 14,
      };
      setDuration(durationMap[type]);
      if (type === 'free') {
        setBudget('0');
        setWantHotel(false);
        setWantFlight(false);
        setIntercityTransport('');
        setCostBreakdown({ flights: 0, hotels: 0, meals: 0, activities: 0, carRental: 0 });
      }
      if (type === 'in-city') {
        setWantFlight(false);
        setWantHotel(false);
        setIntercityTransport('');
      }
      if (type === 'country-tour' || type === 'region-tour') {
        setMultiCity(true);
        setWantHotel(true);
        setWantFlight(true);
        setIntercityTransport('flight');
        if (cityLegs.length === 0) {
          addCityLeg();
          addCityLeg();
        }
      }
    }
  };

  const handleTemplateSelect = (template: TripTemplate) => {
    // Set tour type
    setQuickTripType(template.type);
    setMultiCity(true);
    setWantHotel(true);
    setWantFlight(true);
    setIntercityTransport('flight');
    setDuration(template.duration);
    setDestination(template.country || template.region || '');
    
    // Set city legs
    const legs = template.cities.map(c => ({
      city: c.city,
      transport: 'flight' as string,
      days: c.days,
    }));
    setCityLegs(legs);

    const isAr = i18n.language?.startsWith('ar');
    // Silent template load - no toast
  };

  const updateMealPreferences = (prefs: MealPreferences) => {
    setMealPreferences(prefs);
    const MEAL_COSTS: Record<string, Record<string, number>> = {
      budget: { breakfast: 5, lunch: 8, dinner: 12, snacks: 3 },
      moderate: { breakfast: 12, lunch: 20, dinner: 35, snacks: 8 },
      premium: { breakfast: 25, lunch: 45, dinner: 80, snacks: 15 },
    };
    const costs = MEAL_COSTS[prefs.budgetPerMeal];
    let dailyCost = 0;
    if (prefs.breakfast) dailyCost += costs.breakfast;
    if (prefs.lunch) dailyCost += costs.lunch;
    if (prefs.dinner) dailyCost += costs.dinner;
    if (prefs.snacks) dailyCost += costs.snacks;
    setCostBreakdown(prev => ({ ...prev, meals: dailyCost * duration }));
  };

  // Update cost breakdown when transport/hotel options change
  const budgetItems = useMemo(() => {
    const breakdown = { ...costBreakdown };
    const budgetNum = parseFloat(budget) || 0;
    if (wantFlight || intercityTransport === 'flight') breakdown.flights = budgetNum > 0 ? Math.round(budgetNum * 0.3) : 300;
    else breakdown.flights = 0;
    if (wantHotel) breakdown.hotels = budgetNum > 0 ? Math.round(budgetNum * 0.35) : 200 * duration;
    else breakdown.hotels = 0;
    if (intercityTransport === 'rental_car') breakdown.carRental = 150;
    else if (intercityTransport === 'personal_car') breakdown.carRental = 50;
    else breakdown.carRental = 0;
    return buildBudgetItems({ ...breakdown });
  }, [costBreakdown, wantFlight, wantHotel, intercityTransport, budget, duration]);

  const estimatedTotal = useMemo(() => {
    return budgetItems.reduce((sum, item) => sum + item.amount, 0);
  }, [budgetItems]);

  const handleDateChange = (date: Date | undefined, type: "start" | "return") => {
    if (type === "start") {
      setStartDate(date);
      if (date && returnDate) {
        if (returnDate <= date) {
          setReturnDate(undefined);
        } else {
          const newDuration = Math.ceil((returnDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          setDuration(newDuration);
          // Auto-redistribute days across city legs proportionally
          if (multiCity && cityLegs.length > 0) {
            const oldTotal = cityLegs.reduce((s, l) => s + l.days, 0);
            if (oldTotal !== newDuration && newDuration > 0) {
              const ratio = newDuration / oldTotal;
              let remaining = newDuration;
              setCityLegs(prev => prev.map((leg, idx) => {
                if (idx === prev.length - 1) return { ...leg, days: Math.max(1, remaining) };
                const newDays = Math.max(1, Math.round(leg.days * ratio));
                remaining -= newDays;
                return { ...leg, days: newDays };
              }));
            }
          }
        }
      }
    } else {
      setReturnDate(date);
      if (date && startDate) {
        const newDuration = Math.ceil((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        setDuration(newDuration);
        // Auto-redistribute days across city legs proportionally
        if (multiCity && cityLegs.length > 0) {
          const oldTotal = cityLegs.reduce((s, l) => s + l.days, 0);
          if (oldTotal !== newDuration && newDuration > 0) {
            const ratio = newDuration / oldTotal;
            let remaining = newDuration;
            setCityLegs(prev => prev.map((leg, idx) => {
              if (idx === prev.length - 1) return { ...leg, days: Math.max(1, remaining) };
              const newDays = Math.max(1, Math.round(leg.days * ratio));
              remaining -= newDays;
              return { ...leg, days: newDays };
            }));
          }
        }
      }
    }
  };

  const toggleArrayItem = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const calculateEndTime = (startTime: string, durationStr: string): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const durationMatch = durationStr?.match(/(\d+\.?\d*)\s*hour/i);
    const durationHours = durationMatch ? parseFloat(durationMatch[1]) : 1;
    const totalMinutes = hours * 60 + (minutes || 0) + durationHours * 60;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = Math.round(totalMinutes % 60);
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  const normalizeKickoffTime = (raw?: string) => {
    const cleaned = String(raw || '18:00').replace(/\s*UTC[+\-]?\d*\s*/i, '').trim();
    const ampm = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      let h = Number(ampm[1]);
      const m = Number(ampm[2] || 0);
      const p = ampm[3].toLowerCase();
      if (p === 'pm' && h < 12) h += 12;
      if (p === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const h24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    return h24 ? `${String(Number(h24[1])).padStart(2, '0')}:${h24[2]}` : '18:00';
  };

  const ensureMatchCardsInDays = (days: any[], sourceText: string, perDayTarget?: number) => {
    const anchors = parseEventMatchAnchors(sourceText, startDate);
    if (anchors.length === 0) return days;

    const nextDays = days.map((day) => ({ ...day, activities: [...(day.activities || [])] }));
    anchors.forEach((anchor, idx) => {
      const targetIndex = Math.min(Math.max(anchor.dayIndex, 0), Math.max(0, nextDays.length - 1));
      const day = nextDays[targetIndex];
      if (!day) return;
      const exists = day.activities.some((activity: any) => {
        const text = `${activity.title || activity.name || ''} ${activity.description || ''} ${activity.matchVenue || activity.address || ''}`.toLowerCase();
        return text.includes(anchor.teamA.toLowerCase()) && text.includes(anchor.teamB.toLowerCase());
      });
      if (exists) return;
      const kickoff = normalizeKickoffTime(anchor.kickoff);
      const flagA = getTeamFlag(anchor.teamA);
      const flagB = getTeamFlag(anchor.teamB);
      day.activities.unshift({
        id: `event-match-${targetIndex + 1}-${idx + 1}`,
        title: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB}`,
        name: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB}`,
        description: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB} • ${kickoff}`,
        startTime: kickoff,
        endTime: calculateEndTime(kickoff, '3 hours'),
        address: anchor.venue,
        location: anchor.venue,
        googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anchor.venue)}`,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anchor.venue)}`,
        imageUrl: getActivityImage({ name: anchor.venue, category: 'sports' }, day.cityName || destination),
        openingHours: kickoff,
        isOpen: true,
        cost: 80,
        type: 'sports',
        category: 'sports',
        duration: '3 hours',
        rating: 4.8,
        matchReason: `MANDATORY EVENT: ${anchor.teamA} vs ${anchor.teamB}`,
        isMatchAnchor: true,
        matchVenue: anchor.venue,
        matchKickoff: kickoff,
        matchTeams: { a: anchor.teamA, b: anchor.teamB, flagA, flagB },
      });
      const target = Math.max(1, Number(perDayTarget) || 0);
      while (target > 0 && day.activities.length > target) {
        const removableIndex = [...day.activities]
          .map((activity: any, activityIndex: number) => ({ activity, activityIndex }))
          .reverse()
          .find(({ activity }: any) => !activity?.isMatchAnchor && !activity?.isSpecialRequest && !String(activity?.matchReason || '').includes('طلب خاص'))?.activityIndex;
        if (removableIndex === undefined) break;
        day.activities.splice(removableIndex, 1);
      }
    });
    return nextDays;
  };

  const isCarTrip = intercityTransport === 'personal_car' || intercityTransport === 'rental_car';

  const [seenActivitiesCount, setSeenActivitiesCount] = useState(0);

  // Refresh seen-count whenever destination/legs change
  useEffect(() => {
    const dest = (multiCity && cityLegs.length > 0)
      ? cityLegs.map(l => l.city).filter(Boolean).join('_')
      : destination;
    setSeenActivitiesCount(readSeenActivities(dest).length);
  }, [destination, multiCity, cityLegs, generatedItinerary]);

  const handleGenerate = async (forceFresh: boolean = false) => {
    const isCountryOrRegionTour = quickTripType === 'country-tour' || quickTripType === 'region-tour';
    // In multi-city normal mode, first city = destination, rest = legs
    const multiCityAllCities = multiCity && cityLegs.length > 0 ? cityLegs.map(l => l.city).filter(Boolean) : [];
    const effectiveDestination = quickTripType === 'random' ? 'Surprise Me' 
      : quickTripType === 'in-city' ? departureCity 
      : isCountryOrRegionTour ? (multiCity && cityLegs.length > 0 ? `${destination} (${multiCityAllCities.join(', ')})` : destination)
      : multiCity && multiCityAllCities.length > 0 ? multiCityAllCities.join(', ')
      : destination;
    if (!effectiveDestination) { toast.error(t('wizard.selectDestination')); return; }
    if (!startDate) { toast.error(t('wizard.selectStartDate')); return; }
    // Require departure city when flight is enabled
    if ((wantFlight || intercityTransport === 'flight') && !departureCity) {
      toast.error(i18n.language?.startsWith('ar') ? 'يجب تحديد مدينة المغادرة عند اختيار الطيران' : 'Departure city is required when flight is selected');
      setStep(0);
      return;
    }

    // Validate custom radius if user picked "custom" distance mode (min/max + numeric).
    // The input field shows the value in the selected unit (km or mi); we convert to km before checking.
    if (distanceMode === 'custom') {
      const _dl = getDistanceLabels(i18n.language);
      const parsedDisp = parseFloat(customRadiusKm);
      if (isNaN(parsedDisp)) { toast.error(_dl.invalidNumberError); return; }
      const parsedKm = distanceUnit === 'mi' ? parsedDisp * 1.609344 : parsedDisp;
      if (parsedKm < 0.5 || parsedKm > 50) { toast.error(_dl.minMaxError); return; }
    }

    // Check daily limit - use DB count for accuracy
    let todayCount = getTodayGenerationCount();
    if (user) {
      todayCount = await fetchTodayUsageFromDB(user.id);
      setGenerationsUsed(todayCount);
    }
    if (todayCount >= userDailyLimit) {
      setGenerationsUsed(todayCount);
      setShowPaymentModal(true);
      return;
    }

    // Check remaining subscription activities
    if (hasPlan && remainingActivities !== null && remainingActivities <= 0) {
      toast.error(i18n.language?.startsWith('ar') 
        ? '⚠️ لقد استنفدت جميع الأنشطة المتاحة في باقتك. يرجى ترقية الباقة للمتابعة.' 
        : '⚠️ You have used all available activities in your plan. Please upgrade to continue.');
      navigate('/pricing');
      return;
    }

    setIsGenerating(true);
    setGenerationProgressStep("prepare");
    setBackendProgress(null);
    // Silent generating - no toast

    // ── Real-time progress via Supabase Realtime broadcast ──────────────
    // Subscribe BEFORE we invoke so we don't miss the first checkpoint.
    const progressToken = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `pt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const progressChannel = supabase.channel(`trip-progress:${progressToken}`, {
      config: { broadcast: { self: false } },
    });
    progressChannel
      .on("broadcast", { event: "progress" }, (msg: any) => {
        const payload = msg?.payload || {};
        const step = typeof payload.step === "string" ? payload.step : null;
        const progress = typeof payload.progress === "number" ? payload.progress : null;
        if (step) setGenerationProgressStep(prev => shouldAdvanceGenerationStep(prev, step) ? step : prev);
        if (progress != null) {
          setBackendProgress(prev => (prev && prev.progress > progress ? prev : { step: step || (prev?.step ?? ""), progress }));
        }
      })
      .subscribe();

    try {
      const budgetNum = parseFloat(budget) || 0;
      const budgetBreakdown = budgetNum > 0 ? `
CRITICAL BUDGET CONSTRAINT: Total budget is ${budgetNum} ${currency} for the ENTIRE trip.
${wantFlight ? `- Allocate ~${Math.round(budgetNum * 0.3)} ${currency} for flights.` : ""}
${wantHotel ? `- Allocate ~${Math.round(budgetNum * 0.35)} ${currency} for hotels (${duration} nights).` : ""}
- Allocate ~${Math.round(budgetNum * (wantFlight || wantHotel ? 0.35 : 1))} ${currency} for activities, food, and transport.
- Each activity cost MUST fit within the daily budget of ~${Math.round(budgetNum / duration)} ${currency}.
- DO NOT exceed the total budget.` : "";

      const mealInfo = [
        mealPreferences.breakfast && 'breakfast',
        mealPreferences.lunch && 'lunch',
        mealPreferences.dinner && 'dinner',
        mealPreferences.snacks && 'snacks',
      ].filter(Boolean);
      const cuisineHint = mealPreferences.cuisineTypes?.length ? ` Preferred cuisines: ${mealPreferences.cuisineTypes.join(', ')}.` : '';
      const mealPrompt = mealInfo.length > 0
        ? `MANDATORY MEAL REQUIREMENTS (DO NOT IGNORE):
For EVERY single day of the trip, you MUST include these meals as SEPARATE activities:
${mealPreferences.breakfast ? '- BREAKFAST (category: "breakfast"): Must be a REAL breakfast restaurant/cafe that actually serves breakfast. Schedule between 07:00-10:00.' : ''}
${mealPreferences.lunch ? '- LUNCH (category: "lunch"): Must be a REAL lunch restaurant that actually serves lunch/main meals. Schedule between 12:00-14:00.' : ''}
${mealPreferences.dinner ? '- DINNER (category: "dinner"): Must be a REAL dinner restaurant that actually serves dinner. Schedule between 19:00-21:00.' : ''}
${mealPreferences.snacks ? '- SNACKS (category: "snack"): Must be a REAL cafe, bakery, or snack shop. Schedule between 15:00-17:00.' : ''}
CRITICAL RULES FOR MEALS:
1. Each meal MUST be at a DIFFERENT real restaurant - NO duplicates across the same day.
2. Each restaurant must ACTUALLY serve the meal type (breakfast place for breakfast, NOT a dinner restaurant).
3. Include real address, real phone, real opening hours, and Google Maps link.
4. The "category" field MUST match the meal type exactly: "breakfast", "lunch", "dinner", or "snack".
5. DO NOT skip any meal on any day.${cuisineHint}`
        : '';

      const quickTripPrompt = quickTripType ? ({
        short: 'This is a SHORT trip (1-2 days) with light activities.',
        weekend: 'This is a WEEKEND getaway (Fri-Sun).',
        'in-city': 'Explore WITHIN the city - cafes, parks, local events, hidden gems.',
        nearby: 'Find NEARBY destinations within 2-3 hours drive.',
        random: 'SURPRISE the user with a random unique destination.',
        free: 'Focus on FREE activities only - parks, free museums, walking tours.',
        'country-tour': `COMPREHENSIVE COUNTRY TOUR: Create a FULL tour across the ENTIRE country "${destination}". Visit the most famous cities, landmarks, cultural sites, and natural wonders. Distribute days across major cities/regions. Include travel between cities. The AI should automatically select the BEST cities to visit in this country and plan activities in each one. This is a complete national tour covering the country's highlights.`,
        'region-tour': `COMPREHENSIVE REGION/CONTINENT TOUR: Create a FULL tour across the region/continent "${destination}". Visit multiple countries and their major cities. Plan a logical route minimizing backtracking. Include border crossings, visa tips, and inter-country transport. This is a grand tour covering multiple destinations across the region.`,
      } as Record<QuickTripType, string>)[quickTripType] || '' : '';

      // Detect current site language
      const currentLang = document.documentElement.lang || navigator.language || 'en';
      const isArabic = currentLang.startsWith('ar');
      const languageInstruction = isArabic
        ? 'IMPORTANT: Generate ALL content (activity names, descriptions, tips, city overview) in Arabic (العربية).'
        : `IMPORTANT: Generate ALL content in ${currentLang.split('-')[0]} language.`;

      // Build a precise day-by-city assignment so the AI knows EXACTLY which day belongs to which city
      const dayCityAssignment: string[] = [];
      if (multiCity && cityLegs.length > 0) {
        cityLegs.forEach(leg => {
          for (let k = 0; k < (leg.days || 1); k++) dayCityAssignment.push(leg.city);
        });
      }
      const multiCityInstructions = multiCity && cityLegs.length > 0
        ? `\nCRITICAL MULTI-CITY TRIP — STRICT DAY-CITY MAPPING:
The traveler starts from ${departureCity || 'their home city'} and visits ${cityLegs.length} cities over ${duration} days.
Route: ${departureCity || 'Origin'} → ${cityLegs.map(l => `${l.city} (${l.days} days, by ${l.transport})`).join(' → ')}

MANDATORY DAY-BY-CITY ASSIGNMENT (you MUST follow this exact mapping):
${dayCityAssignment.map((city, i) => {
  const leg = cityLegs.find(l => l.city === city);
  const anchor = leg?.centerPoint
    ? ` — anchor activities near "${leg.centerPoint}"${leg.centerPointCoords ? ` (${leg.centerPointCoords.lat.toFixed(5)}, ${leg.centerPointCoords.lon.toFixed(5)})` : ''}`
    : '';
  return `- Day ${i + 1}: ALL activities, restaurants, and attractions MUST be located in ${city}${anchor}`;
}).join('\n')}

RULES:
1. Each day's activities MUST be physically located in the city assigned to that day above.
2. Set "cityName" field on EACH day to the assigned city name.
3. On the FIRST day of each new city (except the first city), include ONE travel/transit activity (e.g., "Travel from ${cityLegs[0]?.city || 'previous city'} to ${cityLegs[1]?.city || 'next city'} by ${cityLegs[1]?.transport || 'flight'}") as the first item.
4. Do NOT mix activities from different cities on the same day.
5. Generate REAL, well-known places for EACH city — not just the first one.` : '';

      // activitiesPerDay = INCLUSIVE total per day (meals + attractions).
      // Meals are counted WITHIN this number, not added on top of it.
      const _mealSlots = (mealPreferences.breakfast ? 1 : 0) + (mealPreferences.lunch ? 1 : 0) + (mealPreferences.dinner ? 1 : 0) + (mealPreferences.snacks ? 1 : 0);
      const _totalDailyItemsTarget = activitiesPerDay > 0 ? activitiesPerDay : 0;
      const _effectiveDailyItemsTarget = _totalDailyItemsTarget || 3;
      const _activityNonMealTarget = Math.max(0, _totalDailyItemsTarget - _mealSlots);

      // Distance / radius constraint (optional). Translates the UI choice into a strict
      // instruction so the generator clusters each day's activities within walking/driving
      // distance of one another (and optionally near a user-chosen anchor landmark).
      const _radiusKmMap: Record<string, number> = { compact: 1.5, medium: 5, wide: 12 };
      let _radiusKm = 0;
      if (distanceMode === 'custom') {
        const parsed = parseFloat(customRadiusKm);
        if (!isNaN(parsed) && parsed > 0) {
          // Convert mi → km when the user picked the imperial display unit.
          _radiusKm = distanceUnit === 'mi' ? parsed * 1.609344 : parsed;
        }
      } else if (distanceMode in _radiusKmMap) {
        _radiusKm = _radiusKmMap[distanceMode];
      }
      const _centerName = (centerPoint || '').trim();
      const _centerCoords = centerPointCoords && typeof centerPointCoords.lat === 'number' && typeof centerPointCoords.lon === 'number'
        ? ` (coordinates: ${centerPointCoords.lat.toFixed(5)}, ${centerPointCoords.lon.toFixed(5)})`
        : '';
      const distanceInstruction = _radiusKm > 0
        ? `LOCATION CLUSTERING (STRICT): All activities within the SAME day MUST be located within approximately ${_radiusKm} km of one another${_centerName ? `, and centered around "${_centerName}"${_centerCoords}` : ''}. Prefer walkable / short-drive distances and reject venues that are far outside this radius. If unable to find enough nearby venues for a category, choose the next-closest match — do NOT scatter the day across the city.${_centerName ? ` Use "${_centerName}"${_centerCoords} as the daily anchor reference point.` : ''} ANTI-REPEAT WITHIN RADIUS (CRITICAL): Even though activities cluster geographically, NEVER reuse the same place / address across different days OR within the same day, and NEVER reuse a place from a previous regeneration of this trip — pick distinct venues each time inside the allowed ${_radiusKm} km zone${_centerName ? ` around "${_centerName}"` : ''}. If you genuinely cannot find enough distinct venues inside the radius, return fewer activities for that day rather than repeating a place; the UI will surface a clear "no alternatives in radius" message to the user.`
        : '';

      const additionalPreferences = `
${languageInstruction}
Trip type: ${tripType}. ${quickTripPrompt}
${multiCityInstructions}
Intercity transport: ${intercityTransport}. Local transport: ${localTransport.join(", ")}.
${isCarTrip ? `Car fuel efficiency: ${fuelEfficiency} L/100km. Fuel price: ${fuelPrice} ${currency}/L.` : ""}
${children > 0 ? `Has ${children} children - include family-friendly activities.` : ""}
Food preferences: ${mealPreferences.cuisineTypes?.join(", ") || "any"}. 
${mealPrompt}
Activity preferences (STRICT — every day MUST include activities matching these categories): ${activityPrefs.join(", ") || "general sightseeing"}.
${activitiesPerDay > 0
  ? `STRICT DAILY COUNT (MEALS COUNT INSIDE): Each day MUST contain EXACTLY ${_totalDailyItemsTarget} TOTAL items per day, where the ${_mealSlots} selected meal(s) are COUNTED WITHIN this total (NOT added on top). That means ${_activityNonMealTarget} non-meal activities + ${_mealSlots} meal(s) = ${_totalDailyItemsTarget} items per day. Do NOT generate ${_totalDailyItemsTarget + 1} items.`
  : 'AUTO MODE: Each day MUST contain EXACTLY 3 total items (meals counted inside this total). Fill remaining slots with non-meal activities that match the selected preferences.'}
DIVERSITY RULES (MANDATORY):
- Within a single day: vary categories (no two consecutive items of the same subtype, e.g. don't schedule two museums back-to-back).
- Across days: NEVER repeat the same place name. Each activity name must be unique across the WHOLE itinerary.
- Distribute the activity preferences fairly across all days — don't put all "shopping" on day 1 and all "nature" on day 2; rotate categories so each day reflects a balanced mix of the user's chosen interests.
- If user picked multiple interests (e.g. nature + culture + food), each day should contain at least one activity for AT LEAST 2 different chosen interests when day length allows.
Pace: ${pace}. Wake up: ${wakeTime}, Sleep: ${sleepTime}. ALL activities MUST be scheduled between ${wakeTime} and ${sleepTime}.
Minimum place rating: ${minRating} stars.
${distanceInstruction}
${wantHotel ? "Include hotel recommendations." : ""}
${wantFlight ? "Include flight recommendations." : ""}
${specialRequests ? `CRITICAL SPECIAL REQUESTS (MUST FOLLOW): ${specialRequests}` : ""}
${budgetBreakdown}
      `.trim();

      const requestFingerprintPayload = {
        destination,
        departureCity: departureCity || undefined,
        duration,
        travelers: travelers + children,
        budget: budgetNum || undefined,
        interests: [...activityPrefs].sort(),
        tripType,
        travelStyle: pace,
        specialRequests,
        mealPreferences: {
          ...mealPreferences,
          cuisineTypes: [...(mealPreferences.cuisineTypes || [])].sort(),
        },
        activitiesPerDay,
        distanceMode,
        customRadiusKm: distanceMode === 'custom' ? customRadiusKm : undefined,
        centerPoint: centerPoint?.trim() || undefined,
        centerPointCoords: centerPointCoords || undefined,
        distanceUnit,
        startDate: startDate.toISOString().split('T')[0],
        eventName: eventName || undefined,
        cityLegs: multiCity && cityLegs.length > 0
          ? cityLegs.map(l => ({ city: l.city, days: l.days, transport: l.transport, centerPoint: l.centerPoint, centerPointCoords: l.centerPointCoords }))
          : undefined,
        maxActivitiesPerDay,
        wantHotel,
        wantFlight,
        accommodationType,
        hotelStarRating,
        maxBudgetPerNight: maxBudgetPerNight ? Number(maxBudgetPerNight) : undefined,
        currency,
        lang: i18n.language || 'en',
        ...(forceFresh ? { freshSalt: Date.now() } : {}),
      };
      const requestSignature = buildRequestSignature(requestFingerprintPayload);

      // Compute exclude list once (used for cache-skip + payload)
      const seenDestKey = (multiCity && cityLegs.length > 0)
        ? cityLegs.map(l => l.city).filter(Boolean).join('_')
        : destination;
      // Always exclude previously seen activities for this destination so the
      // user gets fresh suggestions on subsequent generations for the same place.
      // The edge function treats this list as a soft preference and will reuse
      // an item only if no alternative matches the user's preferences.
      const excludeActivityNames = readSeenActivities(seenDestKey);

      try {
        // Skip the cached result if we have any previously seen activities for
        // this destination — we want a fresh plan with new activities.
        const skipCache = forceFresh || excludeActivityNames.length > 0;
        setGenerationProgressStep("special");
        const cachedRaw = skipCache ? null : localStorage.getItem(TRIP_WIZARD_LAST_RESULT_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.requestSignature === requestSignature && cached?.itineraryId) {
            const savedItineraryRaw = localStorage.getItem(`itinerary-${cached.itineraryId}`);
            if (savedItineraryRaw) {
              const savedItinerary = JSON.parse(savedItineraryRaw);
              setGeneratedItinerary(savedItinerary);
              setGeneratedItineraryId(cached.itineraryId);
              setIsGenerating(false);
              if (wantFlight || wantHotel || intercityTransport === 'rental_car') {
                navigate(buildBookingsRoute({
                  tab: wantFlight || intercityTransport === 'flight' ? 'flights' : wantHotel ? 'hotels' : 'cars',
                  from: departureCity,
                  to: savedItinerary.destination || destination,
                  date: startDate,
                  returnDate: returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000),
                  guests: travelers,
                  itineraryId: cached.itineraryId,
                }));
              } else {
                navigate(`/itinerary/${cached.itineraryId}`);
              }
              return;
            }
          }
        }
      } catch {
        // ignore cache read errors
      }

      try {
        localStorage.setItem(TRIP_WIZARD_PENDING_KEY, JSON.stringify({
          requestSignature,
          requestFingerprintPayload,
          createdAt: new Date().toISOString(),
        }));
      } catch {
        // ignore storage errors
    }

      console.log("[TripWizard] Invoking generate-trip with details:", {
        destination, departureCity: departureCity || 'Not Specified', duration,
        travelers: travelers + children, budget: budgetNum || 'No Budget Set', 
        interests: activityPrefs,
        activitiesPerDay,
        maxActivitiesPerDay,
        totalDailyItemsTarget: _effectiveDailyItemsTarget,
        mealPreferences,
        cuisineTypes: mealPreferences.cuisineTypes || [],
        cityLegs: multiCity && cityLegs.length > 0 ? cityLegs : undefined,
        startDate: startDate.toISOString().split('T')[0]
      });

      // Auto-retry transient failures (busy edge runtime, gateway timeouts,
      // upstream AI timeouts) with exponential backoff so the user almost
      // never sees the "service was busy" toast.
      const invokeWithRetry = async (maxRetries = 3) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const guestId = user ? undefined : await getGuestIdentifier();
            const result = await supabase.functions.invoke('generate-trip', {
              body: {
                destination: (multiCity && cityLegs.length > 0) ? cityLegs.map(l => l.city).join(' → ') : destination,
                departureCity: departureCity || undefined, finalArrivalCity: finalArrivalCity || undefined, duration,
                travelers: travelers + children, budget: budgetNum || undefined,
                interests: activityPrefs, additionalPreferences,
                tripType,
                travelStyle: pace,
                specialRequests,
                mealPreferences,
                cuisineTypes: mealPreferences.cuisineTypes || [],
                activitiesPerDay,
                startDate: startDate.toISOString().split('T')[0],
                eventName: eventName || undefined,
                cityLegs: multiCity && cityLegs.length > 0 ? cityLegs.map(l => ({ city: l.city, days: l.days, transport: l.transport, centerPoint: l.centerPoint, centerPointCoords: l.centerPointCoords })) : undefined,
                maxActivitiesPerDay: _effectiveDailyItemsTarget,
                totalDailyItemsTarget: _effectiveDailyItemsTarget,
                maxTotalActivitiesRemaining: remainingActivities,
                wantHotel,
                wantFlight,
                flightTripType,
                returnDate: returnDate ? returnDate.toISOString().split('T')[0] : undefined,
                accommodationType,
                hotelStarRating,
                maxBudgetPerNight: maxBudgetPerNight ? Number(maxBudgetPerNight) : undefined,
                currency,
                lang: i18n.language || 'en',
                guestId,
                excludeActivityNames: excludeActivityNames.length ? excludeActivityNames : undefined,
                strictMatch: true,
                strictNoRepeat: true,
                forceFresh: forceFresh || undefined,
                // Variation seed: changes on every regeneration so the engine
                // shuffles candidate pools differently and avoids returning
                // the exact same activities/restaurants on repeat runs.
                variationSeed: forceFresh ? Date.now() : (excludeActivityNames.length ? Date.now() : undefined),
                progressToken,
              },
            });
            const resultError = (result as any)?.error;
            const resultMsg = String(resultError?.message || resultError || '');
            const retryableResult = resultError && /fetch|failed to send|networkerror|aborterror|timeout|timed out|gateway|502|503|504|non-2xx|busy|upstream/i.test(resultMsg);
            if (retryableResult && attempt < maxRetries) {
              const delay = 1800 * Math.pow(2, attempt) + Math.random() * 500;
              console.warn(`[TripWizard] Attempt ${attempt + 1} returned transient error (${resultMsg}), retrying in ${Math.round(delay)}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            return result;
          } catch (err: any) {
            const msg = String(err?.message || err || '');
            const isTransient = /fetch|failed to send|networkerror|aborterror|timeout|timed out|gateway|502|503|504|non-2xx|busy|upstream/i.test(msg);
            if (isTransient && attempt < maxRetries) {
              const delay = 1500 * Math.pow(2, attempt) + Math.random() * 400;
              console.warn(`[TripWizard] Attempt ${attempt + 1} failed (${msg}), retrying in ${Math.round(delay)}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            throw err;
          }
        }
      };

      setGenerationProgressStep("generate");
      let { data, error } = await invokeWithRetry() as any;
      let errorPayload = error ? await readFunctionErrorPayload(error) : null;
      let responsePayload = data ?? errorPayload?.data ?? errorPayload;
      let tripData = responsePayload?.data && Array.isArray(responsePayload.data?.days)
        ? responsePayload.data
        : responsePayload;

      if (error && !Array.isArray(responsePayload?.days)) {
        console.error("Supabase function error (detailed):", error, errorPayload);
        throw new Error(getFriendlyGenerationError(errorPayload?.error || error.message || "Failed to generate trip", i18n.language?.startsWith('ar')));
      }
      if (!responsePayload) {
        console.error("No data returned from AI function");
        throw new Error(getFriendlyGenerationError("no data returned", i18n.language?.startsWith('ar')));
      }
      if (responsePayload?.error && !Array.isArray(responsePayload?.days)) {
        console.error("AI Generation error (from response):", responsePayload.error);
        throw new Error(getFriendlyGenerationError(responsePayload.error, i18n.language?.startsWith('ar')));
      }

      // CRITICAL: ensure days array exists — never persist a half-baked itinerary
      if (!Array.isArray(tripData?.days) || tripData.days.length === 0) {
        console.error("[TripWizard] Generation returned no days after retry:", tripData);
        throw new Error(getFriendlyGenerationError('Trip generation returned no days. Please try again.', i18n.language?.startsWith('ar')));
      }


      const itineraryId = Math.random().toString(36).substring(2, 10);
      const endDate = returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

      // For multi-city: join ALL cities as the displayed destination so the title and itinerary reflect every leg.
      // For single-city: take the cleaned destination.
      const primaryDestination = multiCity && cityLegs.length > 0
        ? cityLegs.map(l => l.city).filter(Boolean).join(' → ')
        : (destination || (typeof tripData.destination === 'string' ? String(tripData.destination).split(/\s*[→\-]+\s*/)[0].trim() : tripData.destination));

      setGenerationProgressStep("hours");
      const rawDays = tripData.days.filter((day: any) => day && typeof day === 'object').map((day: any, idx: number) => {
        let resolvedCityName = day.cityName || undefined;
        if (!resolvedCityName && multiCity && cityLegs.length > 0) {
          let acc = 0;
          for (const leg of cityLegs) {
            acc += Math.max(1, Number(leg.days) || 1);
            if (idx < acc) { resolvedCityName = leg.city; break; }
          }
          if (!resolvedCityName) resolvedCityName = cityLegs[cityLegs.length - 1]?.city;
        }
        return {
          date: day.date || new Date(startDate.getTime() + idx * 24 * 60 * 60 * 1000).toISOString(),
          cityName: resolvedCityName,
          preferenceSummary: day.preferenceSummary,
          activities: (Array.isArray(day.activities) ? day.activities : [])
            .sort((a: any, b: any) => (a.time || "12:00").localeCompare(b.time || "12:00"))
            .map((act: any) => ({
              id: act.id, title: act.name, description: act.description,
              startTime: act.time, endTime: calculateEndTime(act.time, act.duration),
              address: act.address,
              location: act.location || act.address,
              place_id: act.place_id || act.placeId,
              googleMapsLink: act.googleMapsUrl || act.googleMapsLink || getActivityMapLink(act, resolvedCityName || tripData.destination || destination),
              googleMapsUrl: act.googleMapsUrl || act.googleMapsLink,
              googleMapsCoordsUrl: act.googleMapsCoordsUrl,
              imageUrl: getActivityImage(act, resolvedCityName || tripData.destination || destination),
              openingHours: act.openingHours || act.hours || undefined, isOpen: true,
              cost: act.cost, type: act.category, phone: act.phone, website: normalizeWebsiteUrl(act.website),
              rating: act.rating, latitude: act.latitude, longitude: act.longitude,
              enriched: act.enriched,
              matchReason: act.matchReason || undefined,
              preferenceMatch: act.preferenceMatch || undefined,
              isMatchAnchor: !!act.isMatchAnchor,
              matchVenue: act.matchVenue || act.venue || act.address || undefined,
              matchKickoff: act.matchKickoff || act.time || undefined,
              matchTeams: act.matchTeams || undefined,
            })),
        };
      });

      const totalDailyItemsTarget = _effectiveDailyItemsTarget;
      setGenerationProgressStep("dedupe");
      const enforced = enforceDailyItemLimit(rawDays, totalDailyItemsTarget, mealPreferences);
      const audited = auditItineraryPreferences(enforced.days, {
        mealPreferences,
        perDayTarget: totalDailyItemsTarget,
        destination: primaryDestination,
        language: i18n.language || 'en',
      });
      const { wakeHour, sleepHour } = parseWakeSleep(wakeTime, sleepTime);
      setGenerationProgressStep("maps");
      const scheduled = applyStrictDaySchedule(audited.days, {
        perDayTarget: totalDailyItemsTarget,
        wakeHour,
        sleepHour,
        mealPreferences,
      });
      scheduled.days = ensureMatchCardsInDays(scheduled.days, additionalPreferences, totalDailyItemsTarget);

      setGenerationProgressStep("save");
      setBackendProgress({ step: "save", progress: 100 });
      const itineraryToSave = {
        id: itineraryId,
        destination: primaryDestination,
        departureCity, startDate: startDate.toISOString(), endDate: endDate.toISOString(),
        duration, travelers, children, tripType, budget: budgetNum,
        intercityTransport, localTransport,
        fuelSettings: { efficiency: Number(fuelEfficiency), price: Number(fuelPrice) },
        wantHotel, wantFlight,
        // Persist hotel preferences so /bookings can re-apply them on enrichment
        accommodationType,
        hotelStarRating,
        maxBudgetPerNight: maxBudgetPerNight ? Number(maxBudgetPerNight) : undefined,
        interests: activityPrefs,
        activityPrefs,
        mealPreferences, quickTripType,
        cuisinePreferences: mealPreferences.cuisineTypes || [],
        specialRequests,
        travelStyle: pace,
        activitiesPerDay,
        totalDailyItemsTarget: _effectiveDailyItemsTarget,
        wakeTime,
        sleepTime,
        currency,
        budgetBreakdown: costBreakdown,
        multiCity, cityLegs: multiCity ? cityLegs : [],
        // CRITICAL for BookingsPage multi-city detection
        cities: multiCity && cityLegs.length > 0 ? cityLegs.map(l => l.city).filter(Boolean) : undefined,
        citiesVisited: multiCity && cityLegs.length > 0 ? cityLegs.map(l => l.city).filter(Boolean) : undefined,
        tripDetails: {
          from: departureCity,
          finalArrivalCity: finalArrivalCity || undefined,
          destination: primaryDestination,
          accommodationType,
          hotelStarRating,
          maxBudgetPerNight: maxBudgetPerNight ? Number(maxBudgetPerNight) : undefined,
          startDate: startDate.toISOString().split('T')[0],
          endDate: (returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          travelers,
          children,
          cities: multiCity && cityLegs.length > 0 ? cityLegs.map(l => l.city).filter(Boolean) : undefined,
          legs: multiCity && cityLegs.length > 0
            ? cityLegs.map((l, i) => ({
                from: i === 0 ? departureCity : cityLegs[i - 1]?.city,
                to: l.city,
                date: startDate.toISOString().split('T')[0],
                days: l.days,
                transport: l.transport,
              })).filter(l => l.from && l.to)
            : undefined,
        },
        // For multi-city trips, KEEP all days (even empty ones) so the user sees the full city journey.
        // For single-city trips, drop empty days as before.
        days: scheduled.days,
        preferenceMatchSummary: tripData.preferenceMatchSummary,
        estimatedTotalCost: tripData.estimatedTotalCost,
        tips: tripData.tips,
        selectedHotels: Array.isArray(tripData.selectedHotels) ? tripData.selectedHotels : [],
        selectedFlights: Array.isArray(tripData.selectedFlights) ? tripData.selectedFlights : [],
        includesFlights: wantFlight || intercityTransport === "flight",
        includesHotel: wantHotel,
        aiGenerated: true,
      };

      // Diagnostic: confirm what we're actually saving
      console.log("[TripWizard] Saving itinerary:", {
        id: itineraryId,
        destination: itineraryToSave.destination,
        dayCount: itineraryToSave.days?.length,
        cities: itineraryToSave.days?.map((d: any) => d.cityName),
        activitiesPerDay: itineraryToSave.days?.map((d: any) => d.activities?.length),
        firstDayMeals: itineraryToSave.days?.[0]?.activities?.filter((a: any) => ['breakfast','lunch','dinner','snack'].includes(a.type)).map((a: any) => `${a.type}:${a.title}`),
      });

      localStorage.setItem(`itinerary-${itineraryId}`, JSON.stringify(itineraryToSave));
      localStorage.setItem(TRIP_WIZARD_LAST_RESULT_KEY, JSON.stringify({
        requestSignature,
        itineraryId,
        createdAt: new Date().toISOString(),
      }));
      localStorage.removeItem(TRIP_WIZARD_PENDING_KEY);
      setGeneratedItinerary(itineraryToSave);
      setGeneratedItineraryId(itineraryId);

      // Track activity names so a follow-up "Fresh Plan" excludes them
      try {
        const generatedNames: string[] = [];
        for (const day of itineraryToSave.days || []) {
          for (const act of day.activities || []) {
            if (act?.title) generatedNames.push(String(act.title));
          }
        }
        if (generatedNames.length) {
          appendSeenActivities(seenDestKey, generatedNames);
          setSeenActivitiesCount(readSeenActivities(seenDestKey).length);
        }
      } catch {}

      const totalActivitiesGenerated = Number(tripData?.totalActivitiesGenerated)
        || itineraryToSave.days.reduce((sum: number, day: any) => sum + ((day.activities || []).length), 0);

      // QUOTA POLICY: ALWAYS deduct full generated activity count from the
      // user's quota — even when activities are reused from prior trips. The
      // engine still spent compute/SerpAPI calls to evaluate, balance and
      // assemble the day, so the user is billed for the final output count.
      // ─────────────────────────────────────────────────────────────────────
      // CREDIT DEDUCTION GUARANTEE — EVERY GENERATION IS DEDUCTED
      // EN: Credits are deducted on every successful generation, even if the
      //     same trip/activities are repeated. No deduplication is applied.
      // AR: يتم خصم الرصيد عند كل عملية توليد ناجحة، حتى لو تكررت نفس الرحلة
      //     أو الأنشطة. لا يتم تطبيق أي إلغاء للتكرار.
      // FR: Les crédits sont déduits à chaque génération réussie, même si le
      //     voyage est répété. Aucune déduplication n'est appliquée.
      // ES: Los créditos se descuentan en cada generación exitosa, incluso si
      //     se repite el mismo viaje. No se aplica deduplicación.
      // DE: Credits werden bei jeder erfolgreichen Generierung abgezogen, auch
      //     bei Wiederholungen. Es wird keine Deduplizierung angewendet.
      // TR: Her başarılı üretimde krediler düşülür, aynı gezi tekrarlansa
      //     bile. Tekrar engelleme uygulanmaz.
      // RU: Кредиты списываются при каждой успешной генерации, даже при
      //     повторе. Дедупликация не применяется.
      // ZH: 每次成功生成都会扣除积分,即使重复相同行程,也不进行去重。
      // JA: 生成が成功するたびにクレジットが差し引かれます。重複しても
      //     差し引かれます(重複排除なし)。
      // ─────────────────────────────────────────────────────────────────────
      const billableActivities = Math.max(0, totalActivitiesGenerated);

      if (user && billableActivities > 0) {
        await supabase.from('usage_tracking').insert({
          user_id: user.id,
          feature: 'planner',
          quantity: billableActivities,
        });
        window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
      }

      // ALWAYS save to DB for logged-in users (not gated by activity count)
      // — guarantees the itinerary is recoverable even if localStorage is cleared
      if (user) {
        try {
          await (supabase as any).from('saved_trips').upsert({
            user_id: user.id,
            trip_id: itineraryId,
            destination: itineraryToSave.destination,
            trip_data: itineraryToSave as any,
          }, { onConflict: 'trip_id' });
        } catch (dbErr) {
          console.warn('[TripWizard] Failed to persist trip to DB:', dbErr);
        }
      }

      incrementGenerationCount();
      if (user) {
        const freshCount = await fetchTodayUsageFromDB(user.id);
        setGenerationsUsed(freshCount);
      } else {
        setGenerationsUsed(getTodayGenerationCount());
      }

      // Persist last preferences for regeneration recovery
      try {
        localStorage.setItem('lastTripPreferences', JSON.stringify(requestFingerprintPayload));
      } catch {}

      // If user wants flights, hotels, or car rental, use the accurate /bookings page
      // Pass itinerary in navigation state so the next page can hydrate even without localStorage
      if (wantFlight || wantHotel || intercityTransport === 'rental_car') {
        navigate(buildBookingsRoute({
          tab: wantFlight || intercityTransport === 'flight' ? 'flights' : wantHotel ? 'hotels' : 'cars',
          from: departureCity,
          to: itineraryToSave.destination,
          date: startDate,
          returnDate: returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000),
          guests: travelers,
          itineraryId,
        }), { state: { itinerary: itineraryToSave, itineraryId } });
      } else {
        navigate(`/itinerary/${itineraryId}`, { state: { itinerary: itineraryToSave } });
      }

    } catch (error: any) {
      console.error("Error generating plan:", error);
      try {
        const pendingRaw = localStorage.getItem(TRIP_WIZARD_PENDING_KEY);
        const cachedRaw = localStorage.getItem(TRIP_WIZARD_LAST_RESULT_KEY);
        if (pendingRaw && cachedRaw) {
          const pending = JSON.parse(pendingRaw);
          const cached = JSON.parse(cachedRaw);
          if (pending?.requestSignature && pending.requestSignature === cached?.requestSignature && cached?.itineraryId) {
            const savedItineraryRaw = localStorage.getItem(`itinerary-${cached.itineraryId}`);
            if (savedItineraryRaw) {
              const savedItinerary = JSON.parse(savedItineraryRaw);
              setGeneratedItinerary(savedItinerary);
              setGeneratedItineraryId(cached.itineraryId);
              localStorage.removeItem(TRIP_WIZARD_PENDING_KEY);
              if (wantFlight || wantHotel || intercityTransport === 'rental_car') {
                navigate(buildBookingsRoute({
                  tab: wantFlight || intercityTransport === 'flight' ? 'flights' : wantHotel ? 'hotels' : 'cars',
                  from: departureCity,
                  to: savedItinerary.destination || destination,
                  date: startDate,
                  returnDate: returnDate || new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000),
                  guests: travelers,
                  itineraryId: cached.itineraryId,
                }));
              } else {
                navigate(`/itinerary/${cached.itineraryId}`);
              }
              return;
            }
          }
        }
      } catch {
        // ignore cache restore errors
      }

      if (error.message === "TIMEOUT") {
        toast.error("استغرقت العملية وقتاً طويلاً. قد تكون الخدمة مشغولة، يرجى المحاولة مرة أخرى لاحقاً.");
      } else if (error.message?.includes("fetch") || error.message?.includes("NetworkError")) {
        toast.error("خطأ في الاتصال بالخادم. يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً.");
      } else if (error.message?.includes("CORS")) {
        toast.error("فشل الاتصال بسبب سياسة الحماية (CORS). يرجى تحديث الصفحة والمحاولة مجدداً.");
      } else {
        toast.error(error.message || t('wizard.errorGenerate'));
      }
    } finally {
      try { supabase.removeChannel(progressChannel); } catch { /* noop */ }
      setIsGenerating(false);
    }
  };

  const steps = [
    { title: t('wizard.tripInfo'), icon: MapPin },
    { title: t('wizard.preferences'), icon: Heart },
    { title: t('wizard.review'), icon: Star },
    ...(generatedItinerary ? [{ title: t('wizard.booking', { defaultValue: 'احجز' }), icon: Sparkles }] : []),
  ];

  const canProceed = () => {
    if (step === 0) {
      if (quickTripType === 'random') return !!startDate;
      if (quickTripType === 'in-city') return !!departureCity && !!startDate;
      // In multi-city mode, check that at least 1 city is filled
      if (multiCity) return cityLegs.some(l => !!l.city) && !!startDate;
      return !!destination && !!startDate;
    }
    return true;
  };

  const safeUsed = Math.max(0, generationsUsed || 0);
  const safeLimit = Math.max(0, userDailyLimit || 0);
  const safeRemaining = Math.max(0, safeLimit - safeUsed);

  const clearAllSelections = () => {
    setDestination("");
    setDepartureCity("");
    setFinalArrivalCity("");
    setEventName("");
    setStartDate(undefined);
    setReturnDate(undefined);
    setDuration(3);
    setTravelers(2);
    setChildren(0);
    setTripType("");
    setBudget("");
    setMultiCity(false);
    setCityLegs([]);
    setAutoSplitDays(true);
    setIntercityTransport("");
    setLocalTransport([]);
    setFuelEfficiency("8");
    setFuelPrice("2.5");
    setWantHotel(true);
    setWantFlight(false);
    setFlightTripType("round");
    setAccommodationType('any');
    setHotelStarRating(0);
    setMaxBudgetPerNight("");
    setActivityPrefs([]);
    setPace("moderate");
    setWakeTime("08:00");
    setSleepTime("23:00");
    setSpecialRequests("");
    setMinRating("4");
    setHasChildren(false);
    setActivitiesPerDay(0);
    setDistanceMode('any');
    setCustomRadiusKm("3");
    setCenterPoint("");
    setMealPreferences({ breakfast: false, lunch: false, dinner: false, snacks: false, budgetPerMeal: 'moderate' });
    setQuickTripType(null);
    setCostBreakdown({ flights: 0, hotels: 0, meals: 0, activities: 0, carRental: 0 });
    setGeneratedItinerary(null);
    setGeneratedItineraryId("");
    setStep(0);
    localStorage.removeItem(TRIP_WIZARD_DRAFT_KEY);
    localStorage.removeItem(TRIP_WIZARD_PENDING_KEY);
  };

  const scrollToCurrentStep = (behavior: ScrollBehavior = "smooth") => {
    if (!stepCardRef.current) return;

    const headerOffset = 96;
    const targetTop = stepCardRef.current.getBoundingClientRect().top + window.scrollY - headerOffset;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior,
    });
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const frame = window.requestAnimationFrame(() => scrollToCurrentStep());
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-4 space-y-2">
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
          {i18n.language?.startsWith('ar')
            ? `متبقي اليوم: ${safeRemaining} من ${safeLimit} توليد`
            : `Remaining today: ${safeRemaining} of ${safeLimit} generations`}
        </div>
        {hasPlan && maxTotalActivities > 0 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <SparklesIcon2 size={14} />
            {i18n.language?.startsWith('ar')
              ? `الأنشطة المتبقية في الباقة: ${remainingActivities ?? 0} من ${maxTotalActivities}`
              : `Activities remaining in plan: ${remainingActivities ?? 0} of ${maxTotalActivities}`}
            {remainingActivities !== null && remainingActivities <= 0 && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 ms-auto border-emerald-500 text-emerald-700"
                onClick={() => navigate('/pricing')}>
                {i18n.language?.startsWith('ar') ? 'ترقية' : 'Upgrade'}
              </Button>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={clearAllSelections} className="border-destructive/30 text-destructive hover:bg-destructive/10">
            {i18n.language?.startsWith('ar') ? 'تفريغ الاختيارات' : 'Clear selections'}
          </Button>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            <button onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                i === step ? "bg-primary text-primary-foreground shadow-lg scale-105" :
                  i < step ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30" :
                    "bg-muted text-muted-foreground"
              )}>
              <s.icon size={16} />
              <span className="hidden sm:inline">{s.title}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
            {i < steps.length - 1 && <ChevronRight size={16} className="mx-1 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} ref={stepCardRef} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}
          className="scroll-mt-24 md:scroll-mt-28 bg-card border border-border rounded-2xl p-5 md:p-8 shadow-xl">

          {/* STEP 0: Basic Trip Info */}
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <MapPin className="text-primary" size={24} /> {t('wizard.tripInfo')}
              </h2>

              {/* Event Banner */}
              {eventName && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg"><Sparkles className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{i18n.language === 'ar' ? 'رحلة مخصصة لفعالية' : 'Event Trip'}</p>
                    <p className="text-xs text-muted-foreground truncate">{eventName}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEventName("")} className="text-xs">✕</Button>
                </motion.div>
              )}

              {/* Quick Trip Types */}
              <QuickTripTypes selected={quickTripType} onSelect={handleQuickTripSelect} />

              {/* Ready Trip Templates */}
              <TripTemplates onSelect={handleTemplateSelect} />

              {/* Conditional fields based on quick trip type */}
              {(() => {
                const isInCity = quickTripType === 'in-city';
                const isRandom = quickTripType === 'random';
                const isCountryTour = quickTripType === 'country-tour';
                const isRegionTour = quickTripType === 'region-tour';
                const isTourMode = isCountryTour || isRegionTour;
                
                if (isInCity) {
                  return (
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">{t('wizard.yourCity', { defaultValue: 'مدينتك' })}</Label>
                      <CitySearch onSelect={(city) => { setDepartureCity(city); setDestination(city); }} placeholder={t('wizard.selectYourCity', { defaultValue: 'اختر مدينتك' })} initialValue={departureCity} />
                    </div>
                  );
                }
                
                if (isTourMode) {
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <Label className="text-sm font-medium mb-1.5 block">{t('wizard.departureCity')}</Label>
                          <CitySearch onSelect={setDepartureCity} placeholder={t('wizard.whereFrom')} initialValue={departureCity} />
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-1.5 block">
                            {isCountryTour 
                              ? (i18n.language?.startsWith('ar') ? '🌍 اختر الدولة' : '🌍 Select Country') 
                              : (i18n.language?.startsWith('ar') ? '🗺️ اختر المنطقة/القارة' : '🗺️ Select Region/Continent')}
                          </Label>
                          <Input 
                            type="text" 
                            placeholder={isCountryTour 
                              ? (i18n.language?.startsWith('ar') ? 'مثال: السعودية، ألمانيا، تركيا...' : 'e.g. Germany, Saudi Arabia, Turkey...') 
                              : (i18n.language?.startsWith('ar') ? 'مثال: أوروبا، جنوب شرق آسيا...' : 'e.g. Europe, Southeast Asia...')}
                            value={destination} 
                            onChange={(e) => setDestination(e.target.value)} 
                            className="text-base"
                          />
                        </div>
                      </div>
                      
                      {/* Tour cities - optional customization */}
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="border border-primary/20 rounded-xl p-4 bg-primary/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground flex items-center gap-2">
                            <MapPin size={14} className="text-primary" />
                            {i18n.language?.startsWith('ar') ? 'تخصيص المدن (اختياري)' : 'Customize cities (optional)'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {i18n.language?.startsWith('ar') ? 'اتركها فارغة ليختار الذكاء الاصطناعي أفضل المدن' : 'Leave empty for AI to pick best cities'}
                          </p>
                        </div>
                        {cityLegs.map((leg, idx) => (
                          <div key={idx} className="flex flex-wrap items-end gap-2 bg-background rounded-lg p-3 border border-border">
                            <div className="flex-1 min-w-[140px]">
                              <Label className="text-xs mb-1 block">{i18n.language?.startsWith('ar') ? `المدينة ${idx + 1}` : `City ${idx + 1}`}</Label>
                              <CitySearch onSelect={(city) => updateCityLeg(idx, 'city', city)} placeholder={i18n.language?.startsWith('ar') ? 'اختر المدينة' : 'Select city'} initialValue={leg.city} />
                            </div>
                            <div className="w-20">
                              <Label className="text-xs mb-1 block">{i18n.language?.startsWith('ar') ? 'أيام' : 'Days'}</Label>
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={() => updateCityLeg(idx, 'days', Math.max(1, leg.days - 1))} className="w-7 h-10 rounded-l-md border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent">−</button>
                                <span className="w-8 h-10 border-y border-input bg-background flex items-center justify-center text-sm font-medium">{leg.days}</span>
                                <button type="button" onClick={() => updateCityLeg(idx, 'days', Math.min(30, leg.days + 1))} className="w-7 h-10 rounded-r-md border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent">+</button>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeCityLeg(idx)} className="h-10 w-8 text-destructive hover:bg-destructive/10 rounded flex items-center justify-center text-lg">×</button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addCityLeg} className="w-full border-dashed">
                          + {i18n.language?.startsWith('ar') ? 'إضافة مدينة' : 'Add city'}
                        </Button>
                      </motion.div>
                    </div>
                  );
                }
                return (
                  <>
                    {/* Departure city - always shown */}
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">{t('wizard.departureCity')}</Label>
                      <CitySearch onSelect={setDepartureCity} placeholder={t('wizard.whereFrom')} initialValue={departureCity} />
                    </div>

                    {/* Destination - only shown when NOT multi-city and NOT random */}
                    {!isRandom && !multiCity && (
                      <div>
                        <Label className="text-sm font-medium mb-1.5 block">{t('wizard.destinationRequired')}</Label>
                        <CitySearch onSelect={setDestination} placeholder={t('wizard.whereTo')} initialValue={destination} />
                      </div>
                    )}

                    {/* Final arrival city - optional, used as return-flight destination (multi-city or one-way back to a different home) */}
                    {!isRandom && wantFlight && (
                      <div>
                        <Label className="text-sm font-medium mb-1.5 block">
                          {i18n.language?.startsWith('ar') ? 'مدينة الوصول النهائية (اختياري)' : 'Final arrival city (optional)'}
                          <span className="text-xs text-muted-foreground font-normal ms-2">
                            {i18n.language?.startsWith('ar') ? 'لرحلة العودة — اتركها فارغة للعودة إلى مدينة المغادرة' : 'For return flight — leave empty to return to departure city'}
                          </span>
                        </Label>
                        <CitySearch
                          onSelect={setFinalArrivalCity}
                          placeholder={i18n.language?.startsWith('ar') ? 'مثال: الرياض' : 'e.g. Riyadh'}
                          initialValue={finalArrivalCity}
                        />
                      </div>
                    )}

                    {/* Multi-city toggle - separated clearly from destination */}
                    {!isRandom && (
                      <div className="mt-6 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
                          <input type="checkbox" id="multiCityToggle" checked={multiCity} onChange={(e) => {
                            const checked = e.target.checked;
                            setMultiCity(checked);
                            if (checked) {
                              // Initialize with current destination as first city if set
                              if (cityLegs.length === 0) {
                                const initialLegs: CityLeg[] = [];
                                if (destination) {
                                  initialLegs.push({ city: destination, transport: 'flight', days: 2 });
                                  setDestination(''); // Clear destination since it's now in legs
                                }
                                initialLegs.push({ city: '', transport: 'flight', days: 2 });
                                setCityLegs(initialLegs);
                              }
                            } else {
                              // When unchecking multi-city, restore first city as destination and clear legs
                              const firstCity = cityLegs[0]?.city;
                              if (firstCity && !destination) {
                                setDestination(firstCity);
                              }
                              setCityLegs([]);
                            }
                          }} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
                          <label htmlFor="multiCityToggle" className="flex items-center gap-2 cursor-pointer">
                            <MapPin size={16} className="text-primary" />
                            <span className="text-sm font-medium">{i18n.language?.startsWith('ar') ? 'رحلة متعددة المدن' : 'Multi-city trip'}</span>
                          </label>
                        </div>

                        {multiCity && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="space-y-3 border border-primary/20 rounded-xl p-4 bg-primary/5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-xs text-muted-foreground">
                                {i18n.language?.startsWith('ar') 
                                  ? `الانطلاق من ${departureCity || '...'} → ${cityLegs.map(l => l.city || '...').join(' → ')}`
                                  : `From ${departureCity || '...'} → ${cityLegs.map(l => l.city || '...').join(' → ')}`}
                              </p>
                            </div>
                            {/* Fair auto-split toggle */}
                            <div className="flex items-center justify-between gap-2 bg-background/60 rounded-lg px-3 py-2 border border-border">
                              <label htmlFor="autoSplitToggle" className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm">
                                <input
                                  id="autoSplitToggle"
                                  type="checkbox"
                                  checked={autoSplitDays}
                                  onChange={(e) => setAutoSplitDays(e.target.checked)}
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="font-medium">
                                  {i18n.language?.startsWith('ar') ? '⚖️ تقسيم الأيام تلقائياً (عادل)' : '⚖️ Auto-split days fairly'}
                                </span>
                              </label>
                              <span className={cn(
                                "text-xs font-mono px-2 py-1 rounded",
                                cityLegs.reduce((s, l) => s + l.days, 0) > duration
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {cityLegs.reduce((s, l) => s + l.days, 0)} / {duration} {i18n.language?.startsWith('ar') ? 'يوم' : 'days'}
                              </span>
                            </div>
                            {autoSplitDays && (
                              <p className="text-[11px] text-muted-foreground -mt-1 px-1">
                                {i18n.language?.startsWith('ar')
                                  ? 'سيتم توزيع أيام الرحلة بالتساوي على المدن دون تجاوز التاريخ المحدد.'
                                  : 'Days are distributed evenly across cities without exceeding the selected date range.'}
                              </p>
                            )}
                            {cityLegs.map((leg, idx) => (
                              <div key={idx} className="flex flex-wrap items-end gap-2 bg-background rounded-lg p-3 border border-border">
                                <div className="flex flex-col gap-1">
                                  <button type="button" onClick={() => moveCityLeg(idx, 'up')} disabled={idx === 0}
                                    className="w-6 h-6 rounded border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent disabled:opacity-30 text-xs">▲</button>
                                  <button type="button" onClick={() => moveCityLeg(idx, 'down')} disabled={idx === cityLegs.length - 1}
                                    className="w-6 h-6 rounded border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent disabled:opacity-30 text-xs">▼</button>
                                </div>
                                <div className="flex-1 min-w-[120px]">
                                  <Label className="text-xs mb-1 block">{i18n.language?.startsWith('ar') ? `المدينة ${idx + 1}` : `City ${idx + 1}`}</Label>
                                  <CitySearch onSelect={(city) => updateCityLeg(idx, 'city', city)} placeholder={i18n.language?.startsWith('ar') ? 'اختر المدينة' : 'Select city'} initialValue={leg.city} />
                                </div>
                                <div className="w-24">
                                  <Label className="text-xs mb-1 block">{i18n.language?.startsWith('ar') ? 'وسيلة النقل' : 'Transport'}</Label>
                                  <select value={leg.transport} onChange={(e) => updateCityLeg(idx, 'transport', e.target.value)}
                                    className="w-full h-10 rounded-md border border-input bg-background px-2 text-xs">
                                    <option value="flight">{i18n.language?.startsWith('ar') ? '✈️ طيران' : '✈️ Flight'}</option>
                                    <option value="car">{i18n.language?.startsWith('ar') ? '🚗 سيارة' : '🚗 Car'}</option>
                                    <option value="train">{i18n.language?.startsWith('ar') ? '🚆 قطار' : '🚆 Train'}</option>
                                    <option value="bus">{i18n.language?.startsWith('ar') ? '🚌 باص' : '🚌 Bus'}</option>
                                  </select>
                                </div>
                                <div className="w-20">
                                  <Label className="text-xs mb-1 block">{i18n.language?.startsWith('ar') ? 'أيام' : 'Days'}</Label>
                                  <div className="flex items-center gap-0.5">
                                    <button type="button" onClick={() => updateCityLeg(idx, 'days', Math.max(1, leg.days - 1))} className="w-7 h-10 rounded-l-md border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent">−</button>
                                    <span className="w-8 h-10 border-y border-input bg-background flex items-center justify-center text-sm font-medium">{leg.days}</span>
                                    <button type="button" onClick={() => updateCityLeg(idx, 'days', Math.min(30, leg.days + 1))} className="w-7 h-10 rounded-r-md border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent">+</button>
                                  </div>
                                </div>
                                <button type="button" onClick={() => removeCityLeg(idx)} className="h-10 w-8 text-destructive hover:bg-destructive/10 rounded flex items-center justify-center text-lg">×</button>
                                {/* Per-leg center point: anchor activities of this city to a specific area/landmark */}
                                <div className="basis-full flex items-center gap-2 mt-1">
                                  <Button
                                    type="button"
                                    variant={leg.centerPointCoords ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={!leg.city}
                                    onClick={() => {
                                      setLegCenterPickerIndex(idx);
                                      setCenterPickerQuery(leg.centerPoint || leg.city || "");
                                      if (leg.centerPoint && leg.centerPointCoords) {
                                        setCenterPickerSelected({ name: leg.centerPoint, lat: leg.centerPointCoords.lat, lon: leg.centerPointCoords.lon });
                                        setPickerMode('map');
                                      } else {
                                        setCenterPickerSelected(null);
                                        setPickerMode('search');
                                      }
                                      setCenterPickerOpen(true);
                                    }}
                                    className="h-8 gap-1.5 text-[11px]"
                                  >
                                    <MapPin size={12} />
                                    {leg.centerPointCoords
                                      ? (i18n.language?.startsWith('ar') ? 'تعديل المركز' : 'Edit center')
                                      : (i18n.language?.startsWith('ar') ? 'تحديد مركز للمدينة' : 'Set city center')}
                                  </Button>
                                  {leg.centerPoint && (
                                    <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
                                      📍 {leg.centerPoint}
                                    </span>
                                  )}
                                  {leg.centerPointCoords && (
                                    <button
                                      type="button"
                                      onClick={() => setCityLegs((prev) => prev.map((l, i) => i === idx ? { ...l, centerPoint: undefined, centerPointCoords: undefined } : l))}
                                      className="text-[11px] text-destructive hover:underline shrink-0"
                                    >
                                      {i18n.language?.startsWith('ar') ? 'إزالة' : 'Clear'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={addCityLeg} className="flex-1 border-dashed">
                                + {i18n.language?.startsWith('ar') ? 'إضافة مدينة' : 'Add city'}
                              </Button>
                              {cityLegs.length >= 2 && cityLegs.every(l => l.city) && (
                                <Button type="button" variant="outline" size="sm" onClick={saveAsCustomTemplate} className="text-xs gap-1">
                                  <Save size={12} /> {i18n.language?.startsWith('ar') ? 'حفظ كقالب' : 'Save template'}
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">{t('wizard.startDate')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "MMM dd, yyyy") : t('wizard.selectDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={(d) => handleDateChange(d, "start")} initialFocus fromDate={new Date()} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">{t('wizard.returnDateLabel')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !returnDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {returnDate ? format(returnDate, "MMM dd, yyyy") : t('wizard.selectDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={returnDate} onSelect={(d) => handleDateChange(d, "return")} initialFocus defaultMonth={startDate || new Date()} fromDate={startDate ? new Date(startDate.getTime() + 86400000) : new Date()} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">{t('wizard.durationDays')}</Label>
                  {(() => {
                    const applyDuration = (newDur: number) => {
                      const clamped = Math.max(1, Math.min(180, newDur));
                      setDuration(clamped);
                      if (multiCity && cityLegs.length > 0) {
                        const oldTotal = cityLegs.reduce((s, l) => s + l.days, 0);
                        if (oldTotal !== clamped && clamped > 0) {
                          const ratio = clamped / oldTotal;
                          let remaining = clamped;
                          setCityLegs(prev => prev.map((leg, idx) => {
                            if (idx === prev.length - 1) return { ...leg, days: Math.max(1, remaining) };
                            const nd = Math.max(1, Math.round(leg.days * ratio));
                            remaining -= nd;
                            return { ...leg, days: nd };
                          }));
                        }
                      }
                      if (startDate) setReturnDate(new Date(startDate.getTime() + clamped * 86400000));
                    };
                    return (
                      <div className="flex items-center gap-0">
                        <button type="button" onClick={() => applyDuration(duration - 1)}
                          className="w-10 h-10 rounded-l-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">−</button>
                        <div className="flex-1 flex items-center gap-1.5 h-10 px-3 border-y border-input bg-background justify-center">
                          <Clock size={14} className="text-muted-foreground" />
                          <Input
                            type="number"
                            min={1}
                            max={180}
                            value={duration}
                            onChange={(e) => applyDuration(parseInt(e.target.value) || 1)}
                            className="border-0 h-8 p-0 text-center font-medium text-sm focus-visible:ring-0 bg-transparent"
                          />
                        </div>
                        <button type="button" onClick={() => applyDuration(duration + 1)}
                          className="w-10 h-10 rounded-r-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">+</button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">{t('wizard.adultsLabel')}</Label>
                  <div className="flex items-center gap-0">
                    <button type="button" onClick={() => setTravelers(Math.max(1, travelers - 1))}
                      className="w-10 h-10 rounded-l-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">−</button>
                    <div className="flex items-center gap-1.5 h-10 px-3 border-y border-input bg-background min-w-[60px] justify-center">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="font-medium text-sm">{travelers}</span>
                    </div>
                    <button type="button" onClick={() => setTravelers(Math.min(20, travelers + 1))}
                      className="w-10 h-10 rounded-r-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">+</button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">{t('wizard.childrenLabel')}</Label>
                  <div className="flex items-center gap-0">
                    <button type="button" onClick={() => setChildren(Math.max(0, children - 1))}
                      className="w-10 h-10 rounded-l-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">−</button>
                    <div className="flex items-center gap-1.5 h-10 px-3 border-y border-input bg-background min-w-[60px] justify-center">
                      <Baby size={14} className="text-muted-foreground" />
                      <span className="font-medium text-sm">{children}</span>
                    </div>
                    <button type="button" onClick={() => setChildren(Math.min(10, children + 1))}
                      className="w-10 h-10 rounded-r-lg border border-input bg-muted text-foreground flex items-center justify-center hover:bg-accent text-lg font-bold">+</button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">
                    {t('wizard.budgetUsd')} ({currency})
                    <span className="ms-1 text-[10px] font-normal text-muted-foreground">· {t('common.approxPricesNote', { defaultValue: 'Prices are approximate and may vary by availability' })}</span>
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input type="text" placeholder={t('wizard.budgetPlaceholder')} value={budget} onChange={(e) => setBudget(e.target.value)} className="pl-10 pr-16" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{currency}</span>
                  </div>
                </div>
              </div>

              {/* Trip Type */}
              <div>
                <Label className="text-sm font-medium mb-3 block">{t('wizard.tripType')}</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {TRIP_TYPES.map((tp) => (
                    <button key={tp.value} type="button" onClick={() => {
                      const newType = tripType === tp.value ? '' : tp.value;
                      setTripType(newType);
                      // Only auto-suggest activity preferences when the user
                      // hasn't picked any yet — never overwrite explicit selections.
                      if (newType && TRIP_TYPE_ACTIVITY_MAP[newType] && activityPrefs.length === 0) {
                        setActivityPrefs(TRIP_TYPE_ACTIVITY_MAP[newType]);
                      }
                    }}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm",
                        tripType === tp.value ? "border-primary bg-primary/10 shadow-md scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted"
                      )}>
                      <tp.icon size={20} className={tripType === tp.value ? "text-primary" : "text-muted-foreground"} />
                      <span className="font-medium text-xs">{t(tp.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Intercity Transport - hide for in-city and free */}
              {quickTripType !== 'in-city' && quickTripType !== 'free' && (
                <div>
                  <Label className="text-sm font-medium mb-3 block">{t('wizard.intercityTransport')}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {INTERCITY_TRANSPORT.map((tr) => (
                      <button key={tr.value} type="button" onClick={() => setIntercityTransport(tr.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                          intercityTransport === tr.value ? "border-primary bg-primary/10 shadow-md" : "border-border hover:border-primary/50 hover:bg-muted"
                        )}>
                        <tr.icon size={20} className={intercityTransport === tr.value ? "text-primary" : "text-muted-foreground"} />
                        <span className="font-medium text-xs">{t(tr.labelKey)}</span>
                        <span className="text-[10px] text-muted-foreground">{t(tr.descKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Fuel Settings */}
              {isCarTrip && quickTripType !== 'in-city' && quickTripType !== 'free' && (
                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
                    <Fuel size={16} className="text-primary" /> {t('wizard.fuelSettings')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs mb-1 block">{t('wizard.fuelEfficiency')}</Label>
                      <Input type="number" step="0.5" value={fuelEfficiency} onChange={(e) => setFuelEfficiency(e.target.value)} />
                      <p className="text-[10px] text-muted-foreground mt-1">{t('wizard.fuelAvg')}</p>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">{t('wizard.fuelPriceLabel')}</Label>
                      <Input type="number" step="0.1" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}



              {/* Quick toggles - hide flights/hotels for free and in-city */}
              {quickTripType !== 'free' && quickTripType !== 'in-city' && (
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-4 py-2.5 rounded-xl border border-border hover:border-primary/50 transition-all">
                    <input type="checkbox" checked={wantHotel} onChange={(e) => setWantHotel(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    <Hotel size={16} className="text-muted-foreground" />
                    <span className="text-sm">{t('wizard.includeHotels')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-4 py-2.5 rounded-xl border border-border hover:border-primary/50 transition-all">
                    <input type="checkbox" checked={wantFlight} onChange={(e) => setWantFlight(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    <Plane size={16} className="text-muted-foreground" />
                    <span className="text-sm">{t('wizard.includeFlights')}</span>
                  </label>
                    {wantFlight && (
                     <div className="flex items-center bg-muted border border-border rounded-xl p-1">
                       <button
                         type="button"
                         onClick={() => setFlightTripType("round")}
                         className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all", flightTripType === "round" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                       >
                         {t('wizard.roundTrip', { defaultValue: i18n.language?.startsWith('ar') ? 'ذهاب وعودة' : 'Round Trip' })}
                       </button>
                       <button
                         type="button"
                         onClick={() => setFlightTripType("oneway")}
                         className={cn("px-3 py-1.5 text-xs font-medium rounded-lg transition-all", flightTripType === "oneway" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                       >
                         {t('wizard.oneWay', { defaultValue: i18n.language?.startsWith('ar') ? 'ذهاب فقط' : 'One Way' })}
                       </button>
                     </div>
                   )}
                </div>
              )}

              {/* Hotel preferences (auto-pick from SerpAPI) — gated by plan */}
              {wantHotel && quickTripType !== 'free' && quickTripType !== 'in-city' && (
                serpapiHotelsEnabled ? (
                  <div className={cn(
                    "rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-4",
                    !canUseSerpapiHotels && "opacity-60 pointer-events-none"
                  )}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Hotel size={18} className="text-primary" />
                      <h3 className="font-semibold text-foreground">
                        {i18n.language?.startsWith('ar') ? 'تفضيلات الإقامة' : 'Accommodation preferences'}
                      </h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {i18n.language?.startsWith('ar') ? 'اختيار تلقائي' : 'Auto-pick'}
                      </Badge>
                      {remainingSerpapiHotels !== null && (
                        <Badge variant="outline" className="text-[10px]">
                          {i18n.language?.startsWith('ar')
                            ? `متبقي: ${remainingSerpapiHotels}`
                            : `Remaining: ${remainingSerpapiHotels}`}
                        </Badge>
                      )}
                    </div>

                    {!canUseSerpapiHotels && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                        {i18n.language?.startsWith('ar')
                          ? 'انتهت حصة بحث الفنادق المباشر لهذه الفترة. سيتم استخدام مزود بديل.'
                          : 'Live hotel search quota exhausted for this period. Falling back to alternative provider.'}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs mb-1.5 block text-muted-foreground">
                          {i18n.language?.startsWith('ar') ? 'نوع الإقامة' : 'Type'}
                        </Label>
                        <Select value={accommodationType} onValueChange={(v: any) => setAccommodationType(v)}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">{i18n.language?.startsWith('ar') ? 'أي نوع' : 'Any'}</SelectItem>
                            <SelectItem value="hotel">{i18n.language?.startsWith('ar') ? '🏨 فندق' : '🏨 Hotel'}</SelectItem>
                            <SelectItem value="apartment">{i18n.language?.startsWith('ar') ? '🏢 شقة' : '🏢 Apartment'}</SelectItem>
                            <SelectItem value="resort">{i18n.language?.startsWith('ar') ? '🌴 منتجع' : '🌴 Resort'}</SelectItem>
                            <SelectItem value="villa">{i18n.language?.startsWith('ar') ? '🏡 فيلا' : '🏡 Villa'}</SelectItem>
                            <SelectItem value="hostel">{i18n.language?.startsWith('ar') ? '🛏️ هوستل' : '🛏️ Hostel'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs mb-1.5 block text-muted-foreground">
                          {i18n.language?.startsWith('ar') ? 'الحد الأدنى للنجوم' : 'Min stars'}
                        </Label>
                        <Select value={String(hotelStarRating)} onValueChange={(v) => setHotelStarRating(Number(v))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">{i18n.language?.startsWith('ar') ? 'أي تقييم' : 'Any rating'}</SelectItem>
                            <SelectItem value="3">★★★ 3+</SelectItem>
                            <SelectItem value="4">★★★★ 4+</SelectItem>
                            <SelectItem value="5">★★★★★ 5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs mb-1.5 block text-muted-foreground">
                          {i18n.language?.startsWith('ar') ? `الميزانية القصوى لليلة (${currency})` : `Max / night (${currency})`}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          placeholder={i18n.language?.startsWith('ar') ? 'بدون حد' : 'No cap'}
                          value={maxBudgetPerNight}
                          onChange={(e) => setMaxBudgetPerNight(e.target.value)}
                          className="h-10"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {i18n.language?.startsWith('ar')
                        ? 'سيتم اختيار أفضل فندق لكل مدينة وفق هذه التفضيلات مع رابط حجز مباشر.'
                        : 'We auto-pick the best hotel per city matching these filters and attach a direct booking link.'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-4 space-y-2 relative">
                    <div className="flex items-center gap-2">
                      <Lock size={16} className="text-muted-foreground" />
                      <h3 className="font-semibold text-muted-foreground text-sm">
                        {i18n.language?.startsWith('ar') ? 'تفضيلات الإقامة (مقفلة)' : 'Accommodation preferences (locked)'}
                      </h3>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Crown size={10} />
                        {i18n.language?.startsWith('ar') ? 'باقة أعلى' : 'Upgrade'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {i18n.language?.startsWith('ar')
                        ? 'الاختيار التلقائي للفنادق/الشقق متاح في الباقات المدعومة فقط. سيتم استخدام مزود بديل افتراضياً.'
                        : 'Auto-pick hotels/apartments is only available on supported plans. An alternative provider will be used by default.'}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => navigate('/pricing')}
                    >
                      {i18n.language?.startsWith('ar') ? 'ترقية الباقة' : 'Upgrade plan'}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}

          {/* STEP 1: Preferences */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Heart className="text-primary" size={24} /> {t('wizard.preferences')}
              </h2>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium block flex items-center gap-2 mb-0">
                    <Mountain size={16} className="text-primary" /> {t('wizard.activityPreferences')}
                  </Label>
                  {activityPrefs.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setActivityPrefs([])} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10">
                      {i18n.language?.startsWith('ar') ? 'تفريغ' : 'Clear'}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ACTIVITY_PREFS.map((a) => (
                    <button key={a.value} type="button" onClick={() => toggleArrayItem(activityPrefs, setActivityPrefs, a.value)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm",
                        activityPrefs.includes(a.value) ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/50 hover:bg-muted"
                      )}>
                      <a.icon size={18} className={activityPrefs.includes(a.value) ? "text-primary" : "text-muted-foreground"} />
                      <span className="font-medium">{t(a.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance / radius preference (optional) — fully localized for all 8 UI languages */}
              {(() => {
                const dl = getDistanceLabels(i18n.language);
                const isRtl = ['ar', 'ur'].includes((i18n.language || '').slice(0, 2).toLowerCase());
                const presetRadiusMap: Record<string, number> = { compact: 1.5, medium: 5, wide: 12 };
                // km<->mi helpers — internal storage is ALWAYS in km; unit toggle is display-only.
                const KM_PER_MI = 1.609344;
                const toDisplay = (km: number) => distanceUnit === 'mi' ? km / KM_PER_MI : km;
                const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
                const unitSuffix = distanceUnit === 'mi' ? dl.mi : dl.km;

                // Custom field is shown in the SELECTED unit; we parse it back to km for storage/prompt.
                const parsedCustomDisplay = parseFloat(customRadiusKm);
                const customIsNumber = !isNaN(parsedCustomDisplay);
                const parsedCustomKm = customIsNumber
                  ? (distanceUnit === 'mi' ? parsedCustomDisplay * KM_PER_MI : parsedCustomDisplay)
                  : NaN;
                const customInRange = !isNaN(parsedCustomKm) && parsedCustomKm >= 0.5 && parsedCustomKm <= 50;
                const customError = distanceMode === 'custom'
                  ? (!customIsNumber ? dl.invalidNumberError : (!customInRange ? dl.minMaxError : ''))
                  : '';

                const effectiveRadiusKm = distanceMode === 'any'
                  ? 0
                  : (distanceMode === 'custom' ? (customInRange ? parsedCustomKm : 0) : (presetRadiusMap[distanceMode] || 0));
                const previewLow = toDisplay(effectiveRadiusKm * 0.6);
                const previewHigh = toDisplay(effectiveRadiusKm * 1.2);
                const previewRange = effectiveRadiusKm > 0
                  ? `${fmt(previewLow)} – ${fmt(previewHigh)} ${unitSuffix}`
                  : dl.cityWide;

                // Toggle between km and mi without losing the user's intended distance.
                const switchUnit = (next: 'km' | 'mi') => {
                  if (next === distanceUnit) return;
                  if (customIsNumber) {
                    const converted = next === 'mi'
                      ? parsedCustomDisplay / KM_PER_MI   // currently km, going to mi
                      : parsedCustomDisplay * KM_PER_MI;  // currently mi, going to km
                    setCustomRadiusKm(converted.toFixed(1));
                  }
                  setDistanceUnit(next);
                };

                const previewLat = centerPickerSelected?.lat ?? centerPointCoords?.lat ?? null;
                const previewLon = centerPickerSelected?.lon ?? centerPointCoords?.lon ?? null;
                const previewQ = centerPickerSelected?.name || centerPickerQuery.trim();
                const mapPreviewSrc = (previewLat != null && previewLon != null)
                  ? `https://www.openstreetmap.org/export/embed.html?bbox=${(previewLon - 0.01).toFixed(5)}%2C${(previewLat - 0.008).toFixed(5)}%2C${(previewLon + 0.01).toFixed(5)}%2C${(previewLat + 0.008).toFixed(5)}&layer=mapnik&marker=${previewLat.toFixed(5)}%2C${previewLon.toFixed(5)}`
                  : null;

                return (
                  <div className="rounded-2xl border-2 border-dashed border-border bg-gradient-to-br from-muted/30 to-transparent p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="rounded-lg bg-primary/10 p-2">
                          <Compass size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-sm font-semibold block mb-0.5">
                            {dl.title}
                            <Badge variant="outline" className="ms-2 text-[10px] px-1.5 py-0 font-normal">
                              {dl.optional}
                            </Badge>
                          </Label>
                          <p className="text-[11px] text-muted-foreground leading-snug">{dl.help}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* km / mi unit toggle */}
                        <div
                          className="inline-flex rounded-lg border border-border bg-background p-0.5"
                          role="group"
                          aria-label={dl.unitLabel}
                        >
                          <button
                            type="button"
                            onClick={() => switchUnit('km')}
                            className={cn(
                              "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all",
                              distanceUnit === 'km' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {dl.km}
                          </button>
                          <button
                            type="button"
                            onClick={() => switchUnit('mi')}
                            className={cn(
                              "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all",
                              distanceUnit === 'mi' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {dl.mi}
                          </button>
                        </div>
                        {(distanceMode !== 'any' || centerPoint) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDistanceMode('any');
                              setCustomRadiusKm("3");
                              setCenterPoint("");
                              setCenterPointCoords(null);
                            }}
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                          >
                            {dl.clear}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {([
                        { value: 'any',     icon: Globe2,     label: dl.any,     hint: dl.anyHint },
                        { value: 'compact', icon: Footprints, label: dl.compact, hint: distanceUnit === 'mi' ? `~${fmt(toDisplay(1.5))} ${dl.mi}` : dl.compactHint },
                        { value: 'medium',  icon: Bike,       label: dl.medium,  hint: distanceUnit === 'mi' ? `~${fmt(toDisplay(5))} ${dl.mi}` : dl.mediumHint },
                        { value: 'wide',    icon: Car,        label: dl.wide,    hint: distanceUnit === 'mi' ? `~${fmt(toDisplay(12))} ${dl.mi}` : dl.wideHint },
                        { value: 'custom',  icon: Compass,    label: dl.custom,  hint: dl.customHint },
                      ] as const).map((opt) => {
                        const Icon = opt.icon;
                        const active = distanceMode === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDistanceMode(opt.value)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center",
                              active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/50 hover:bg-muted"
                            )}
                          >
                            <Icon size={18} className={active ? "text-primary" : "text-muted-foreground"} />
                            <span className="font-medium text-xs leading-tight">{opt.label}</span>
                            <span className="text-[10px] text-muted-foreground leading-none">{opt.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    {distanceMode === 'custom' && (
                      <div>
                        <Label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                          {dl.radiusLabel}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={distanceUnit === 'mi' ? 0.3 : 0.5}
                            max={distanceUnit === 'mi' ? 31 : 50}
                            step={0.5}
                            value={customRadiusKm}
                            onChange={(e) => setCustomRadiusKm(e.target.value)}
                            placeholder={distanceUnit === 'mi' ? '2' : '3'}
                            aria-invalid={!!customError}
                            className={cn("max-w-[140px]", customError && "border-destructive focus-visible:ring-destructive")}
                          />
                          <span className="text-sm text-muted-foreground">{unitSuffix}</span>
                        </div>
                        {customError && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-destructive font-medium">
                            <AlertCircle size={12} className="shrink-0" />
                            {customError}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Live preview of the per-day search range */}
                    {distanceMode !== 'any' && !customError && (
                      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-2.5">
                        <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                            {dl.livePreviewTitle}
                          </p>
                          <p className="text-sm font-medium text-foreground mt-0.5">
                            {dl.perDayRange}: <span className="font-bold">{previewRange}</span>
                            {centerPoint?.trim() && (
                              <span className="text-muted-foreground font-normal"> · {dl.nearAnchor}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {distanceMode !== 'any' && (
                      <div>
                        <Label className="text-xs font-medium mb-1.5 block text-muted-foreground flex items-center gap-1.5">
                          <MapPin size={12} />
                          {dl.centerLabel}
                        </Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            type="text"
                            value={centerPoint}
                            onChange={(e) => {
                              setCenterPoint(e.target.value);
                              // typing manually invalidates any picked coordinates
                              if (centerPointCoords) setCenterPointCoords(null);
                            }}
                            placeholder={dl.centerPlaceholder}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Preload existing selection so the user doesn't lose it when re-opening
                              setCenterPickerQuery(centerPoint || destination || "");
                              if (centerPoint && centerPointCoords) {
                                setCenterPickerSelected({ name: centerPoint, lat: centerPointCoords.lat, lon: centerPointCoords.lon });
                                setPickerMode('map');
                              } else {
                                setCenterPickerSelected(null);
                                setPickerMode('search');
                              }
                              setCenterPickerOpen(true);
                            }}
                            className="gap-1.5 shrink-0"
                          >
                            <Search size={14} />
                            {dl.pickFromCity}
                          </Button>
                        </div>
                        {centerPointCoords && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-primary font-medium">
                            <CheckCircle2 size={11} />
                            {centerPointCoords.lat.toFixed(4)}, {centerPointCoords.lon.toFixed(4)}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">{dl.centerHelp}</p>
                      </div>
                    )}

                    {/* Center point picker dialog with autocomplete + map preview */}
                    <Dialog open={centerPickerOpen} onOpenChange={(open) => {
                      setCenterPickerOpen(open);
                      // Don't wipe the selected pin on close — we want to restore it next time the picker opens.
                      if (!open) { setCenterPickerResults([]); setLegCenterPickerIndex(null); }
                    }}>
                      <DialogContent
                        className="p-0 gap-0 w-screen h-[100dvh] max-w-none max-h-none rounded-none sm:w-[calc(100vw-1rem)] sm:max-w-lg sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col overflow-hidden"
                        dir={isRtl ? 'rtl' : 'ltr'}
                      >
                        <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 border-b border-border bg-background shrink-0">
                          <DialogTitle className="flex items-center gap-2 text-base">
                            <MapPin size={18} className="text-primary" />
                            {dl.pickerTitle}
                          </DialogTitle>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{dl.pickerHelp}</p>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-3">
                          {/* Mode toggle: Search ↔ Map */}
                          {(() => {
                            const ml = getMapPickerLabels(i18n.language);
                            return (
                              <div className="inline-flex w-full rounded-xl border border-border bg-muted/40 p-1">
                                <button
                                  type="button"
                                  onClick={() => setPickerMode('search')}
                                  className={cn(
                                    "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all min-h-[44px]",
                                    pickerMode === 'search' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                                  )}
                                >
                                  <Search size={14} />
                                  {ml.tabSearch}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerMode('map')}
                                  className={cn(
                                    "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all min-h-[44px]",
                                    pickerMode === 'map' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                                  )}
                                >
                                  <MapPin size={14} />
                                  {ml.tabMap}
                                </button>
                              </div>
                            );
                          })()}

                          {pickerMode === 'search' && (
                            <>
                              <Input
                                type="text"
                                value={centerPickerQuery}
                                onChange={(e) => { setCenterPickerQuery(e.target.value); setCenterPickerSelected(null); }}
                                placeholder={dl.centerPlaceholder}
                                autoFocus
                                className="h-12 text-base"
                              />

                              {centerPickerLoading && (
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <Loader2 size={12} className="animate-spin" />
                                  {dl.searching}
                                </div>
                              )}
                              {!centerPickerLoading && centerPickerQuery.trim().length >= 2 && centerPickerResults.length === 0 && (
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <AlertCircle size={12} />
                                  {dl.noResults}
                                </div>
                              )}
                              {centerPickerResults.length > 0 && (
                                <div className="rounded-lg border border-border bg-background max-h-64 overflow-y-auto divide-y divide-border">
                                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/50 sticky top-0">
                                    {dl.suggestions}
                                  </div>
                                  {centerPickerResults.map((r, idx) => {
                                    const isSel = centerPickerSelected
                                      && centerPickerSelected.lat === r.lat
                                      && centerPickerSelected.lon === r.lon;
                                    return (
                                      <button
                                        key={`${r.lat}-${r.lon}-${idx}`}
                                        type="button"
                                        onClick={() => {
                                          setCenterPickerSelected({ name: r.name, lat: r.lat, lon: r.lon });
                                          setCenterPickerQuery(r.name);
                                        }}
                                        className={cn(
                                          "w-full text-start px-3 py-3 text-xs hover:bg-muted transition-colors flex items-start gap-2 min-h-[48px]",
                                          isSel && "bg-primary/10"
                                        )}
                                      >
                                        <MapPin size={12} className={cn("mt-0.5 shrink-0", isSel ? "text-primary" : "text-muted-foreground")} />
                                        <div className="min-w-0 flex-1">
                                          <p className="font-semibold text-foreground truncate">{r.name}</p>
                                          <p className="text-[10px] text-muted-foreground truncate">{r.display}</p>
                                        </div>
                                        {isSel && <CheckCircle2 size={12} className="text-primary shrink-0 mt-0.5" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}

                          {pickerMode === 'map' && (() => {
                            const ml = getMapPickerLabels(i18n.language);
                            const pinned = centerPickerSelected
                              ? { lat: centerPickerSelected.lat, lon: centerPickerSelected.lon }
                              : (centerPointCoords || null);
                            const inaccurate = pickerDistanceKm !== null && pickerDistanceKm > ACCURACY_THRESHOLD_KM;
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-[11px] text-muted-foreground flex-1 min-w-0">{ml.tapToDrop}</p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={geolocating}
                                    onClick={() => {
                                      if (!('geolocation' in navigator)) {
                                        toast.error(ml.locationDenied);
                                        return;
                                      }
                                      setGeolocating(true);
                                      navigator.geolocation.getCurrentPosition(
                                        (pos) => {
                                          const lat = pos.coords.latitude;
                                          const lon = pos.coords.longitude;
                                          setCenterPickerSelected({ name: ml.pinnedHere, lat, lon });
                                          setCenterPickerQuery(ml.pinnedHere);
                                          setGeolocating(false);
                                        },
                                        () => { toast.error(ml.locationDenied); setGeolocating(false); },
                                        { timeout: 10000, enableHighAccuracy: false }
                                      );
                                    }}
                                    className="h-9 gap-1.5 text-[11px] shrink-0"
                                  >
                                    {geolocating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                                    {geolocating ? ml.locating : ml.useMyLocation}
                                  </Button>
                                </div>
                                <CenterPointMapPicker
                                  value={pinned}
                                  initialCenter={centerPointCoords}
                                  radiusKm={effectiveRadiusKm > 0 ? effectiveRadiusKm : undefined}
                                  hintLabel={ml.tapToDrop}
                                  inaccurate={inaccurate}
                                  onChange={(p) => {
                                    setCenterPickerSelected({
                                      name: centerPickerSelected?.name || centerPickerQuery.trim() || ml.pinnedHere,
                                      lat: p.lat,
                                      lon: p.lon,
                                    });
                                  }}
                                />
                                {centerPickerSelected && (
                                  <p className={cn(
                                    "flex items-center gap-1.5 text-[11px] font-medium",
                                    inaccurate ? "text-destructive" : "text-primary"
                                  )}>
                                    <CheckCircle2 size={11} />
                                    {centerPickerSelected.lat.toFixed(4)}, {centerPickerSelected.lon.toFixed(4)}
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Distance accuracy banner — visible whenever a pin exists and we have city coords */}
                          {centerPickerSelected && pickerCityCoords && pickerDistanceKm !== null && (() => {
                            const ml = getMapPickerLabels(i18n.language);
                            const inaccurate = pickerDistanceKm > ACCURACY_THRESHOLD_KM;
                            const unit = distanceUnit === 'mi' ? 'mi' : 'km';
                            const valueShown = distanceUnit === 'mi' ? (pickerDistanceKm / 1.609344) : pickerDistanceKm;
                            const limitShown = distanceUnit === 'mi' ? (ACCURACY_THRESHOLD_KM / 1.609344) : ACCURACY_THRESHOLD_KM;
                            const fmt = (n: number) => n.toFixed(n >= 100 ? 0 : 1);
                            return (
                              <div className={cn(
                                "rounded-lg border p-3 space-y-2",
                                inaccurate ? "border-destructive/50 bg-destructive/10" : "border-primary/30 bg-primary/5"
                              )}>
                                <div className="flex items-start gap-2">
                                  {inaccurate ? <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="text-primary mt-0.5 shrink-0" />}
                                  <div className="text-[12px] leading-relaxed flex-1 min-w-0">
                                    <p className={cn("font-semibold", inaccurate ? "text-destructive" : "text-primary")}>
                                      {ml.distanceFromCity(fmt(valueShown), unit, pickerCityCoords.name)}
                                    </p>
                                    <p className="text-muted-foreground text-[11px] mt-0.5">
                                      {ml.thresholdNote(fmt(limitShown), unit)}
                                    </p>
                                    {inaccurate && !overrideAccepted && (
                                      <p className="text-destructive text-[11px] mt-1">{ml.farFromCity}</p>
                                    )}
                                    {!inaccurate && (
                                      <p className="text-primary text-[11px] mt-0.5">{ml.pinAccurate}</p>
                                    )}
                                  </div>
                                </div>
                                {inaccurate && (
                                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => { setPickerMode('search'); setCenterPickerSelected(null); setCenterPickerQuery(destination || ""); }}
                                      className="h-9 gap-1.5 flex-1"
                                    >
                                      <Search size={12} />
                                      {ml.selectMorePrecisely}
                                    </Button>
                                    {!overrideAccepted && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setOverrideAccepted(true)}
                                        className="h-9 gap-1.5 flex-1 text-destructive hover:text-destructive"
                                      >
                                        <CheckCircle2 size={12} />
                                        {ml.confirmOverride}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {pickerCheckingDistance && !pickerCityCoords && (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Loader2 size={12} className="animate-spin" />
                              {getMapPickerLabels(i18n.language).checkingAccuracy}
                            </div>
                          )}

                          {(centerPickerSelected || centerPickerQuery.trim()) && (() => {
                            // Prefer exact pin coordinates if a pin is dropped/selected,
                            // so the link opens the precise spot the user picked, not a
                            // generic text search around the destination.
                            const pinLat = centerPickerSelected?.lat ?? centerPointCoords?.lat ?? null;
                            const pinLon = centerPickerSelected?.lon ?? centerPointCoords?.lon ?? null;
                            const href = pinLat !== null && pinLon !== null
                              ? `https://www.google.com/maps/search/?api=1&query=${pinLat},${pinLon}`
                              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(previewQ + (destination ? ' ' + destination : ''))}`;
                            return (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                              >
                                <MapPin size={12} />
                                {dl.pickFromMap} →
                              </a>
                            );
                          })()}
                        </div>

                        {/* Sticky action bar so the buttons stay visible on small screens */}
                        <div className="shrink-0 bg-background border-t border-border px-4 sm:px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCenterPickerOpen(false)}
                            className="flex-1 h-11"
                          >
                            {dl.cancel}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              (!centerPickerSelected && !centerPickerQuery.trim())
                              || (pickerDistanceKm !== null && pickerDistanceKm > ACCURACY_THRESHOLD_KM && !overrideAccepted)
                            }
                            onClick={() => {
                              const finalName = (centerPickerSelected?.name || centerPickerQuery.trim());
                              setCenterPoint(finalName);
                              if (centerPickerSelected) {
                                setCenterPointCoords({ lat: centerPickerSelected.lat, lon: centerPickerSelected.lon });
                              } else {
                                setCenterPointCoords(null);
                              }
                              setCenterPickerOpen(false);
                              // Keep selection in state so re-opening restores it
                            }}
                            className="flex-1 h-11 gap-1.5"
                          >
                            <CheckCircle2 size={14} />
                            {dl.useThis}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                );
              })()}


              <div>
                <Label className="text-sm font-medium mb-3 block">{t('wizard.tripPace')}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {PACE_OPTIONS.map((p) => (
                    <button key={p.value} type="button" onClick={() => setPace(p.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        pace === p.value ? "border-primary bg-primary/10 shadow-md" : "border-border hover:border-primary/50 hover:bg-muted"
                      )}>
                      <p.icon size={22} className={pace === p.value ? "text-primary" : "text-muted-foreground"} />
                      <span className="font-medium text-sm">{t(p.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Activities per day */}
              <div>
                <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
                  <Zap size={14} className="text-primary" /> {t('wizard.activitiesPerDay')}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {t('wizard.planLimit')}: {maxActivitiesPerDay}
                  </Badge>
                </Label>
                <div className="flex flex-wrap gap-2 items-center">
                  {[
                    { value: 0, label: `🤖 ${t('wizard.autoActivities')}` },
                    { value: 3, label: '3' },
                    { value: 5, label: '5' },
                    { value: 7, label: '7' },
                    { value: 10, label: '10' },
                  ].map((opt) => {
                    const isLocked = opt.value > maxActivitiesPerDay && opt.value !== 0;
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          if (isLocked) {
                            setShowUpgradeModal(true);
                          } else {
                            setActivitiesPerDay(opt.value);
                          }
                        }}
                        className={cn(
                          "px-4 py-2 rounded-full border-2 text-sm font-medium transition-all relative",
                          isLocked
                            ? "border-muted bg-muted/50 text-muted-foreground opacity-60 cursor-not-allowed"
                            : activitiesPerDay === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                        )}>
                        {opt.label}
                        {isLocked && <Lock size={10} className="absolute -top-1 -right-1 text-primary" />}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={maxActivitiesPerDay}
                      placeholder={t('wizard.customCount')}
                      value={activitiesPerDay > 0 && ![0, 3, 5, 7, 10].includes(activitiesPerDay) ? activitiesPerDay : ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val > 0 && val <= maxActivitiesPerDay) setActivitiesPerDay(val);
                        else if (val > maxActivitiesPerDay) {
                          setShowUpgradeModal(true);
                        }
                        else if (!e.target.value) setActivitiesPerDay(0);
                      }}
                      className="w-24 h-9 text-center"
                    />
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
                  ⚠️ {t('wizard.mealsCountAlert')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
                <div className="min-w-0">
                  <Label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <Sun size={14} className="text-primary" /> {t('wizard.wakeUpTime')}
                  </Label>
                  <div className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                    <Select value={wakeTime} onValueChange={setWakeTime}>
                      <SelectTrigger className="h-12 border-0 shadow-none text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, h) => {
                          const val = `${String(h).padStart(2, '0')}:00`;
                          return <SelectItem key={val} value={val}>{val}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="min-w-0">
                  <Label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <Moon size={14} className="text-primary" /> {t('wizard.sleepTime')}
                  </Label>
                  <div className="w-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                    <Select value={sleepTime} onValueChange={setSleepTime}>
                      <SelectTrigger className="h-12 border-0 shadow-none text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, h) => {
                          const val = `${String(h).padStart(2, '0')}:00`;
                          return <SelectItem key={val} value={val}>{val}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="min-w-0">
                  <Label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <Star size={14} className="text-primary" /> {t('wizard.minRating')}
                  </Label>
                  <div className="flex h-12 w-full items-center gap-1 overflow-hidden rounded-2xl border border-border bg-background px-3 shadow-sm">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                            navigator.vibrate(12);
                          }
                          setMinRating(String(star));
                        }}
                        className="rounded-md p-0.5 transition-transform hover:scale-105 active:scale-95"
                        aria-label={`Set minimum rating to ${star}`}
                      >
                        <Star
                          size={20}
                          className={star <= Number(minRating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}
                        />
                      </button>
                    ))}
                    <span className="ms-1 shrink-0 text-sm text-muted-foreground">{minRating}</span>
                  </div>
                </div>
              </div>

              {/* Meal Options */}
              <div>
                <div className="flex items-center justify-end mb-2">
                  {(mealPreferences.breakfast || mealPreferences.lunch || mealPreferences.dinner || mealPreferences.snacks || (mealPreferences.cuisineTypes?.length ?? 0) > 0) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateMealPreferences({ breakfast: false, lunch: false, dinner: false, snacks: false, budgetPerMeal: 'moderate', cuisineTypes: [] })} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10">
                      {i18n.language?.startsWith('ar') ? 'تفريغ الوجبات' : 'Clear meals'}
                    </Button>
                  )}
                </div>
                <MealOptions
                  preferences={mealPreferences}
                  onChange={updateMealPreferences}
                  duration={duration}
                />
              </div>

              {/* Budget Breakdown */}
              <BudgetBreakdown items={budgetItems} totalBudget={parseFloat(budget) || 0} />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm font-medium block mb-0">{t('wizard.specialRequests')}</Label>
                  {specialRequests && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSpecialRequests("")} className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10">
                      {i18n.language?.startsWith('ar') ? 'تفريغ' : 'Clear'}
                    </Button>
                  )}
                </div>
                <Textarea 
                  placeholder={i18n.language?.startsWith('ar') 
                    ? 'مثال: أريد زيارة كأس العالم فقط في أمريكا، أو أريد جولة أوروبية تشمل باريس وروما ولندن، أو أريد البقاء في ضواحي المدينة بعيداً عن الزحام...' 
                    : 'Example: I want to visit the World Cup only in the USA, or I want a European tour including Paris, Rome, and London, or I want to stay in suburbs away from crowds...'
                  } 
                  value={specialRequests} 
                  onChange={(e) => setSpecialRequests(e.target.value)} 
                  rows={3} 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {i18n.language?.startsWith('ar') 
                    ? '💡 يمكنك كتابة أي طلب خاص مثل: زيارة مدن محددة، تجنب أماكن معينة، أو التركيز على فعاليات محددة' 
                    : '💡 You can write any special request: visit specific cities, avoid certain areas, or focus on specific events'}
                </p>
                <AIRequestsAnalysis
                  specialRequests={specialRequests}
                  onApply={(text) => setSpecialRequests(text)}
                  totalDays={duration}
                  tripStartDate={startDate}
                  onAutoExtend={({ startDate: nextStart, returnDate: nextReturn, duration: nextDuration }) => {
                    setStartDate(nextStart);
                    setReturnDate(nextReturn);
                    setDuration(nextDuration);
                  }}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Review & Generate */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Star className="text-primary" size={24} /> {t('wizard.reviewSummary')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2"><MapPin size={16} className="text-primary" /> {t('wizard.reviewTripDetails')}</h3>
                  <p className="text-sm text-muted-foreground">{t('wizard.from')}: <span className="text-foreground font-medium">{departureCity || t('wizard.notSpecified')}</span></p>
                  <p className="text-sm text-muted-foreground">{t('wizard.to')}: <span className="text-foreground font-medium">{destination}</span></p>
                  {multiCity && cityLegs.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-primary">{i18n.language?.startsWith('ar') ? 'المسار:' : 'Route:'}</p>
                      {cityLegs.filter(l => l.city).map((leg, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">→ {leg.city} ({leg.days} {t('travel.days')}, {leg.transport === 'flight' ? '✈️' : leg.transport === 'car' ? '🚗' : leg.transport === 'train' ? '🚆' : '🚌'})</p>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">{t('wizard.date')}: <span className="text-foreground font-medium">{startDate ? format(startDate, "MMM dd") : "—"} → {returnDate ? format(returnDate, "MMM dd") : `${duration} ${t('travel.days')}`}</span></p>
                  <p className="text-sm text-muted-foreground">{t('wizard.travelersLabel')}: <span className="text-foreground font-medium">{travelers} {t('wizard.adult')}{children > 0 ? ` + ${children} ${t('wizard.childrenSmall')}` : ""}</span></p>
                  {budget && <p className="text-sm text-muted-foreground">{t('travel.budget')}: <span className="text-foreground font-medium">{formatPrice(Number.parseFloat(budget) || 0, currency)}</span></p>}
                </div>

                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2"><Car size={16} className="text-primary" /> {t('wizard.reviewTransport')}</h3>
                  <p className="text-sm text-muted-foreground">{t('wizard.intercity')}: <span className="text-foreground font-medium">{INTERCITY_TRANSPORT.find(tr => tr.value === intercityTransport) ? t(INTERCITY_TRANSPORT.find(tr => tr.value === intercityTransport)!.labelKey) : t('wizard.notSpecified')}</span></p>
                  <p className="text-sm text-muted-foreground">{t('wizard.local')}: <span className="text-foreground font-medium">{localTransport.map(l => { const found = LOCAL_TRANSPORT.find(tr => tr.value === l); return found ? t(found.labelKey) : l; }).join(", ") || t('wizard.notSpecified')}</span></p>
                  {isCarTrip && (
                    <p className="text-sm text-muted-foreground">{t('wizard.fuel')}: <span className="text-foreground font-medium">{fuelEfficiency} L/100km · {formatPrice(Number.parseFloat(fuelPrice) || 0, currency)}/L</span></p>
                  )}
                  <p className="text-sm text-muted-foreground">{t('wizard.hotel')}: <span className="text-foreground font-medium">{wantHotel ? t('common.yes') : t('common.no')}</span> · {t('wizard.flightLabel')}: <span className="text-foreground font-medium">{wantFlight ? t('common.yes') : t('common.no')}</span></p>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2"><Heart size={16} className="text-primary" /> {t('wizard.reviewPreferences')}</h3>
                  <p className="text-sm text-muted-foreground">{t('wizard.type')}: <span className="text-foreground font-medium">{TRIP_TYPES.find(tp => tp.value === tripType) ? t(TRIP_TYPES.find(tp => tp.value === tripType)!.labelKey) : t('wizard.notSpecified')}</span></p>
                  <p className="text-sm text-muted-foreground">{t('wizard.pace')}: <span className="text-foreground font-medium">{t(PACE_OPTIONS.find(p => p.value === pace)!.labelKey)}</span></p>
                  <p className="text-sm text-muted-foreground">{t('wizard.schedule')}: <span className="text-foreground font-medium">{wakeTime} - {sleepTime}</span></p>
                </div>

                {((mealPreferences.cuisineTypes?.length || 0) > 0 || activityPrefs.length > 0) && (
                  <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                    <h3 className="font-semibold text-foreground flex items-center gap-2"><Utensils size={16} className="text-primary" /> {t('wizard.reviewTastes')}</h3>
                    {(mealPreferences.cuisineTypes?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mealPreferences.cuisineTypes!.map(f => (
                          <span key={f} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full font-medium">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                    {activityPrefs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {activityPrefs.map(a => (
                          <span key={a} className="bg-accent/20 text-accent-foreground text-xs px-2 py-1 rounded-full font-medium">
                            {t(ACTIVITY_PREFS.find(ap => ap.value === a)?.labelKey || a)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {specialRequests && (
                <div className="bg-muted/50 rounded-xl p-4">
                  <h3 className="font-semibold text-foreground text-sm mb-1">{t('wizard.specialRequests')}</h3>
                  <p className="text-sm text-muted-foreground">{specialRequests}</p>
                </div>
              )}

              {/* Generation preview — clear day-by-city + meals summary (full i18n) */}
              {(() => {
                const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
                const prefUi = PREVIEW_PREF_LABELS[code] || PREVIEW_PREF_LABELS.en;
                // Localized words per language
                const L: Record<string, Record<string, string>> = {
                  en: { day: 'Day', days: 'Days', in: 'in', breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snacks', preview: 'Generation Preview', willGenerate: 'Will generate', daySg: 'day', dayPl: 'days', withMeals: 'with', daily: 'daily', itemsPerDay: 'items per day (incl. meals)', attractionSg: 'attraction', attractionPl: 'attractions', mealSg: 'meal', mealPl: 'meals', auto: '🤖 Auto · exactly 3 items/day', citiesPl: 'cities' },
                  ar: { day: 'يوم', days: 'أيام', in: 'في', breakfast: 'فطور', lunch: 'غداء', dinner: 'عشاء', snacks: 'سناك', preview: 'معاينة قبل التوليد', willGenerate: 'سيتم توليد', daySg: 'يوم', dayPl: 'أيام', withMeals: 'مع', daily: 'يومياً', itemsPerDay: 'عناصر لكل يوم (شامل الوجبات)', attractionSg: 'معلم', attractionPl: 'معالم', mealSg: 'وجبة', mealPl: 'وجبات', auto: '🤖 تلقائي · 3 عناصر/يوم بالضبط', citiesPl: 'مدن' },
                  fr: { day: 'Jour', days: 'Jours', in: 'à', breakfast: 'petit-déjeuner', lunch: 'déjeuner', dinner: 'dîner', snacks: 'collations', preview: 'Aperçu de la génération', willGenerate: 'Générera', daySg: 'jour', dayPl: 'jours', withMeals: 'avec', daily: 'par jour', itemsPerDay: 'éléments par jour (repas inclus)', attractionSg: 'attraction', attractionPl: 'attractions', mealSg: 'repas', mealPl: 'repas', auto: '🤖 Auto · exactement 3 éléments/jour', citiesPl: 'villes' },
                  es: { day: 'Día', days: 'Días', in: 'en', breakfast: 'desayuno', lunch: 'almuerzo', dinner: 'cena', snacks: 'snacks', preview: 'Vista previa de generación', willGenerate: 'Generará', daySg: 'día', dayPl: 'días', withMeals: 'con', daily: 'diariamente', itemsPerDay: 'elementos por día (incl. comidas)', attractionSg: 'atracción', attractionPl: 'atracciones', mealSg: 'comida', mealPl: 'comidas', auto: '🤖 Auto · exactamente 3 elementos/día', citiesPl: 'ciudades' },
                  de: { day: 'Tag', days: 'Tage', in: 'in', breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snacks: 'Snacks', preview: 'Generierungsvorschau', willGenerate: 'Wird generieren', daySg: 'Tag', dayPl: 'Tage', withMeals: 'mit', daily: 'täglich', itemsPerDay: 'Elemente pro Tag (inkl. Mahlzeiten)', attractionSg: 'Attraktion', attractionPl: 'Attraktionen', mealSg: 'Mahlzeit', mealPl: 'Mahlzeiten', auto: '🤖 Auto · genau 3 Elemente/Tag', citiesPl: 'Städte' },
                  ru: { day: 'День', days: 'Дни', in: 'в', breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snacks: 'перекусы', preview: 'Предпросмотр генерации', willGenerate: 'Будет создано', daySg: 'день', dayPl: 'дней', withMeals: 'с', daily: 'ежедневно', itemsPerDay: 'элементов в день (вкл. еду)', attractionSg: 'достопримечательность', attractionPl: 'достопримечательностей', mealSg: 'прием пищи', mealPl: 'приемов пищи', auto: '🤖 Авто · ровно 3 элемента/день', citiesPl: 'городов' },
                  zh: { day: '第', days: '第', in: '在', breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snacks: '小吃', preview: '生成预览', willGenerate: '将生成', daySg: '天', dayPl: '天', withMeals: '含', daily: '每天', itemsPerDay: '项/天（含餐食）', attractionSg: '景点', attractionPl: '景点', mealSg: '餐', mealPl: '餐', auto: '🤖 自动 · 每天正好 3 项', citiesPl: '个城市' },
                  ur: { day: 'دن', days: 'دن', in: 'میں', breakfast: 'ناشتہ', lunch: 'دوپہر کا کھانا', dinner: 'رات کا کھانا', snacks: 'ہلکا کھانا', preview: 'جنریشن کا پیش منظر', willGenerate: 'تیار کیا جائے گا', daySg: 'دن', dayPl: 'دن', withMeals: 'کے ساتھ', daily: 'روزانہ', itemsPerDay: 'آئٹمز فی دن (کھانے سمیت)', attractionSg: 'مقام', attractionPl: 'مقامات', mealSg: 'کھانا', mealPl: 'کھانے', auto: '🤖 آٹو · روزانہ عین 3 آئٹمز', citiesPl: 'شہر' },
                };
                const w = L[code] || L.en;
                const validLegs = multiCity ? cityLegs.filter(l => l.city) : [];
                const dayCityLines: string[] = [];
                if (validLegs.length > 0) {
                  let cursor = 1;
                  validLegs.forEach((leg) => {
                    const start = cursor;
                    const end = cursor + leg.days - 1;
                    const range = leg.days === 1 ? `${w.day} ${start}` : `${w.days} ${start}-${end}`;
                    dayCityLines.push(`${range} ${w.in} ${leg.city}`);
                    cursor = end + 1;
                  });
                } else if (destination) {
                  dayCityLines.push(`${w.days} 1-${duration} ${w.in} ${destination}`);
                }
                const meals = [
                  mealPreferences.breakfast && w.breakfast,
                  mealPreferences.lunch && w.lunch,
                  mealPreferences.dinner && w.dinner,
                  mealPreferences.snacks && w.snacks,
                ].filter(Boolean) as string[];
                const mealSlots = meals.length;
                const autoTotal = 3;
                // activitiesPerDay (when > 0) is the INCLUSIVE total per day (attractions + meals).
                const totalPerDay = activitiesPerDay > 0 ? activitiesPerDay : autoTotal;
                const attractionsPerDay = Math.max(0, totalPerDay - mealSlots);
                const sep = code === 'ar' ? '، ' : ', ';
                const dayWord = duration === 1 ? w.daySg : w.dayPl;
                const summary = `${w.willGenerate} ${duration} ${dayWord}: ${dayCityLines.join(sep)}${meals.length ? `${sep}${w.withMeals} ${meals.join(' + ')} ${w.daily}` : ''}.`;
                const previewInterestBreakdown = activityPrefs.map((interest) => ({
                  key: interest,
                  matched: true,
                  reason: `${interest}`,
                }));
                const previewMealBreakdown = [
                  mealPreferences.breakfast && { key: 'breakfast', matched: true },
                  mealPreferences.lunch && { key: 'lunch', matched: true },
                  mealPreferences.dinner && { key: 'dinner', matched: true },
                  mealPreferences.snacks && { key: 'snack', matched: true },
                ].filter(Boolean) as Array<{ key: string; matched: boolean }>;
                return (
                  <div className="bg-gradient-to-br from-primary/10 to-accent/10 border-2 border-primary/30 rounded-xl p-5 mb-4">
                    <div className="flex items-start gap-2 mb-3">
                      <Sparkles size={18} className="text-primary mt-0.5 shrink-0" />
                      <h3 className="font-bold text-foreground text-sm sm:text-base">
                        {w.preview}
                      </h3>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed mb-3">{summary}</p>
                    {dayCityLines.length > 1 && (
                      <div className="space-y-1 mb-3 bg-background/50 rounded-lg p-3">
                        {dayCityLines.map((line, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="bg-primary/15 text-primary px-2.5 py-1 rounded-full font-medium">
                        {`${totalPerDay} ${w.itemsPerDay}`}
                      </span>
                      {mealSlots > 0 && attractionsPerDay > 0 && (
                        <span className="bg-accent/20 text-accent-foreground px-2.5 py-1 rounded-full font-medium">
                          {`${attractionsPerDay} ${attractionsPerDay === 1 ? w.attractionSg : w.attractionPl} + ${mealSlots} ${mealSlots === 1 ? w.mealSg : w.mealPl}`}
                        </span>
                      )}
                      {activitiesPerDay === 0 && (
                        <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-full font-medium border border-emerald-500/30">
                          {w.auto}
                        </span>
                      )}
                      {validLegs.length > 0 && (
                        <span className="bg-secondary/40 text-secondary-foreground px-2.5 py-1 rounded-full font-medium">
                          {`${validLegs.length} ${w.citiesPl}`}
                        </span>
                      )}
                    </div>
                    {(previewInterestBreakdown.length > 0 || previewMealBreakdown.length > 0) && (
                      <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3">
                        <div className="text-xs font-semibold text-foreground mb-2">{prefUi.preferenceMatch}</div>
                        <div className="space-y-2">
                          {dayCityLines.map((line, idx) => (
                            <div key={`${line}-${idx}`} className="rounded-md border border-border/50 bg-muted/30 p-2">
                              <div className="text-[11px] font-medium text-foreground mb-1">{prefUi.day} {idx + 1} · {line}</div>
                              <div className="flex flex-wrap gap-1.5 mb-1.5">
                                {previewInterestBreakdown.map((item) => (
                                  <span key={item.key} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                                    ✓ {item.key}
                                  </span>
                                ))}
                                {previewMealBreakdown.map((item) => (
                                  <span key={item.key} className="px-2 py-0.5 rounded-full bg-secondary/50 text-secondary-foreground text-[10px] font-medium">
                                    ✓ {prefUi[`meal_${item.key}` as keyof typeof prefUi] || item.key}
                                  </span>
                                ))}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {previewInterestBreakdown.length > 0
                                  ? `${previewInterestBreakdown.length + previewMealBreakdown.length} ${prefUi.matched}`
                                  : `0 ${prefUi.failed}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
                {isGenerating ? (
                  <div className="space-y-4 py-4">
                    {multiCity && cityLegs.filter(l => l.city).length > 1 ? (
                      <MultiCityProgress
                        cities={cityLegs.map(l => ({ city: l.city, days: l.days }))}
                        destination={destination}
                      />
                    ) : (
                      <>
                        <div className="relative mx-auto w-16 h-16">
                          <Loader2 className="animate-spin text-primary w-16 h-16" />
                          <Plane className="absolute inset-0 m-auto text-primary/60" size={24} />
                        </div>
                        <GeneratingMessages destination={destination} progressStep={generationProgressStep} backendProgress={backendProgress?.progress ?? null} />
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-foreground font-medium mb-2">{t('wizard.readyToGenerate')}</p>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className={`text-xs px-3 py-1 rounded-full ${safeRemaining === 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                        {i18n.language?.startsWith('ar')
                          ? `${safeRemaining} من ${safeLimit} توليد متبقي اليوم`
                          : `${safeRemaining} of ${safeLimit} generations remaining today`}
                      </div>
                    </div>
                     <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                       <Button onClick={() => handleGenerate(false)} disabled={isGenerating} size="lg" className="px-6 sm:px-10 py-4 sm:py-6 text-base sm:text-lg rounded-xl shadow-lg w-full sm:w-auto">
                         <Zap className="mr-2" size={18} /> {t('wizard.generatePlan')}
                       </Button>
                     </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 max-w-md mx-auto flex items-center justify-center gap-1">
                      <span>⚠️</span>
                      <span>
                        {(() => {
                          const lang = i18n.language?.toLowerCase().split('-')[0] || 'en';
                          const messages: Record<string, string> = {
                            ar: 'قد تظهر أنشطة أو وجبات بديلة حسب التوفر في وجهتك.',
                            en: 'Alternative activities or meals may appear based on availability in your destination.',
                            ur: 'آپ کی منزل میں دستیابی کے مطابق متبادل سرگرمیاں یا کھانے ظاہر ہو سکتے ہیں۔',
                            de: 'Je nach Verfügbarkeit am Zielort können alternative Aktivitäten oder Mahlzeiten angezeigt werden.',
                            fr: 'Des activités ou repas alternatifs peuvent apparaître selon la disponibilité dans votre destination.',
                            es: 'Pueden aparecer actividades o comidas alternativas según la disponibilidad en tu destino.',
                            zh: '根据目的地的可用情况，可能会显示替代活动或餐食。',
                            ru: 'В зависимости от наличия в вашем пункте назначения могут появиться альтернативные мероприятия или блюда.',
                            tr: 'Hedefinizdeki uygunluğa bağlı olarak alternatif aktiviteler veya yemekler görünebilir.',
                            hi: 'आपके गंतव्य में उपलब्धता के आधार पर वैकल्पिक गतिविधियाँ या भोजन दिखाई दे सकते हैं।',
                            id: 'Aktivitas atau makanan alternatif mungkin muncul berdasarkan ketersediaan di destinasi Anda.',
                            pt: 'Podem aparecer atividades ou refeições alternativas conforme a disponibilidade no seu destino.',
                            it: 'Potrebbero apparire attività o pasti alternativi in base alla disponibilità nella tua destinazione.',
                            ja: '目的地での空き状況に応じて、代替のアクティビティや食事が表示される場合があります。',
                            ko: '목적지의 가용성에 따라 대체 활동이나 식사가 표시될 수 있습니다.',
                          };
                          return messages[lang] || messages.en;
                        })()}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Smart Booking */}
          {step === 3 && generatedItinerary && (
            <SmartBookingStep
              destination={destination}
              departureCity={departureCity}
              startDate={startDate!}
              endDate={returnDate || new Date(startDate!.getTime() + duration * 24 * 60 * 60 * 1000)}
              travelers={travelers}
              wantFlight={wantFlight || intercityTransport === 'flight'}
              wantHotel={wantHotel}
              wantCar={intercityTransport === 'rental_car'}
              flightTripType={flightTripType}
              cityLegs={multiCity ? cityLegs : []}
              onComplete={(selections) => {
                // Auto-update itinerary based on booking selections
                const isAr = document.documentElement.lang?.startsWith('ar') || false;
                const updated = applyBookingToItinerary(generatedItinerary, selections, isAr);
                localStorage.setItem(`itinerary-${generatedItineraryId}`, JSON.stringify(updated));
                // Silent - no toast
                navigate(`/itinerary/${generatedItineraryId}`);
              }}
              onSkipAll={() => {
                navigate(`/itinerary/${generatedItineraryId}`);
              }}
            />
          )}

          {/* Navigation */}
          {step < 3 && (
            <div className="flex justify-between mt-8 pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="gap-2">
                <ChevronLeft size={16} /> {t('common.previous')}
              </Button>
              {step < 2 && (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="gap-2">
                  {t('common.next')} <ChevronRight size={16} />
                </Button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={async () => {
          localStorage.setItem(getTodayKey(), "0");
          setGenerationsUsed(0);
          await refreshGenerationLimits();
          setShowPaymentModal(false);
        }}
        generationsUsed={safeUsed}
        generationsLimit={safeLimit}
      />

      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Crown size={20} className="text-primary" />
              {i18n.language?.startsWith('ar') ? 'ترقية الباقة' : 'Upgrade Plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {i18n.language?.startsWith('ar')
                ? `باقتك الحالية تسمح بـ ${maxActivitiesPerDay} فعاليات يومياً كحد أقصى. قم بترقية باقتك للحصول على فعاليات أكثر في خطة رحلتك.`
                : `Your current plan allows up to ${maxActivitiesPerDay} activities per day. Upgrade to get more activities in your trip plan.`
              }
            </p>
            <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
              <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
                <Zap size={14} />
                {i18n.language?.startsWith('ar') ? 'باقتك الحالية' : 'Current Plan'}
              </div>
              <p className="text-xs text-muted-foreground">
                {i18n.language?.startsWith('ar') 
                  ? `${maxActivitiesPerDay} فعاليات / يوم`
                  : `${maxActivitiesPerDay} activities / day`
                }
              </p>
            </div>
            <Button 
              className="w-full gap-2" 
              onClick={() => { setShowUpgradeModal(false); navigate('/pricing'); }}
            >
              <Crown size={16} />
              {i18n.language?.startsWith('ar') ? 'عرض الباقات والترقية' : 'View Plans & Upgrade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TripWizard;
