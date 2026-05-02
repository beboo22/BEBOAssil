import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, TrendingUp, Loader2, RefreshCw, Thermometer, Phone, BookOpen, Shield, Globe, Wind, Droplets, CloudSun, ExternalLink, CalendarDays, Download, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";

interface DestinationInfoCardProps {
  destination: string;
  compact?: boolean;
  tripDays?: number;
  startDate?: string | Date;
}

interface WeatherData {
  temp: string;
  feels_like: string;
  temp_min: string;
  temp_max: string;
  condition: string;
  humidity: string;
  wind_speed: string;
  icon?: string;
  main: string;
}

interface WikipediaData {
  title: string;
  extract: string;
  thumbnail?: string;
  image?: string;
  description?: string;
  source_url?: string;
}

interface NewsItem {
  title: string;
  summary: string;
  thumbnail?: string;
  url?: string;
  source?: string;
}

interface ForecastDay {
  date: string;
  temp_min: string;
  temp_max: string;
  condition: string;
  icon?: string;
  estimated?: boolean;
}

interface SourceLink {
  label: string;
  url: string;
  type?: string;
}

// Static data for emergency & customs (no API needed)
const COUNTRY_DATA: Record<string, { currency: { name: string; nameAr: string; code: string; rateToUSD: string }; emergency: { police: string; ambulance: string; fire: string; tourist_police?: string }; customs: string[]; customsAr: string[] }> = {
  uae: { currency: { name: "UAE Dirham", nameAr: "الدرهم الإماراتي", code: "AED", rateToUSD: "3.67" }, emergency: { police: "999", ambulance: "998", fire: "997", tourist_police: "800 4438" }, customs: ["Dress modestly in public places", "No public displays of affection", "Alcohol only in licensed venues", "Photography restrictions in some areas"], customsAr: ["ارتدِ ملابس محتشمة في الأماكن العامة", "لا إظهار للعواطف في الأماكن العامة", "الكحول فقط في الأماكن المرخصة", "قيود على التصوير في بعض المناطق"] },
  saudi: { currency: { name: "Saudi Riyal", nameAr: "الريال السعودي", code: "SAR", rateToUSD: "3.75" }, emergency: { police: "911", ambulance: "997", fire: "998", tourist_police: "930" }, customs: ["Respect prayer times", "Dress modestly especially at holy sites", "No alcohol permitted", "Separate sections for families"], customsAr: ["احترم أوقات الصلاة", "ارتدِ ملابس محتشمة خصوصاً في الأماكن المقدسة", "الكحول ممنوع", "أقسام منفصلة للعائلات"] },
  egypt: { currency: { name: "Egyptian Pound", nameAr: "الجنيه المصري", code: "EGP", rateToUSD: "50.0" }, emergency: { police: "122", ambulance: "123", fire: "180", tourist_police: "126" }, customs: ["Bargain at markets", "Tip (baksheesh) is customary", "Remove shoes before entering mosques", "Dress modestly outside resorts"], customsAr: ["ساوم في الأسواق", "البقشيش متعارف عليه", "اخلع حذاءك قبل دخول المساجد", "ارتدِ ملابس محتشمة خارج المنتجعات"] },
  turkey: { currency: { name: "Turkish Lira", nameAr: "الليرة التركية", code: "TRY", rateToUSD: "32.0" }, emergency: { police: "155", ambulance: "112", fire: "110", tourist_police: "153" }, customs: ["Remove shoes when entering homes", "Tea is a social ritual", "Haggling expected at bazaars", "Respect mosque etiquette"], customsAr: ["اخلع حذاءك عند دخول المنازل", "الشاي طقس اجتماعي", "المساومة متوقعة في البازارات", "احترم آداب المساجد"] },
  jordan: { currency: { name: "Jordanian Dinar", nameAr: "الدينار الأردني", code: "JOD", rateToUSD: "0.71" }, emergency: { police: "911", ambulance: "911", fire: "911" }, customs: ["Hospitality is paramount", "Accept tea/coffee when offered", "Dress modestly at religious sites", "Friday is the holy day"], customsAr: ["الضيافة فوق كل شيء", "اقبل الشاي/القهوة عند تقديمها", "ارتدِ ملابس محتشمة في المواقع الدينية", "الجمعة يوم مقدس"] },
  france: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "17", ambulance: "15", fire: "18" }, customs: ["Greet with 'Bonjour'", "Tipping 5-10% is appreciated", "Shops may close for lunch", "Dress smartly for restaurants"], customsAr: ["حيّ بـ 'بونجور'", "الإكرامية 5-10% مقدرة", "المحلات قد تغلق وقت الغداء", "ارتدِ ملابس أنيقة للمطاعم"] },
  uk: { currency: { name: "British Pound", nameAr: "الجنيه الإسترليني", code: "GBP", rateToUSD: "0.79" }, emergency: { police: "999", ambulance: "999", fire: "999" }, customs: ["Queue patiently", "Tipping 10-15% in restaurants", "Drive on the left", "Pub culture is important"], customsAr: ["انتظر في الطابور بصبر", "الإكرامية 10-15% في المطاعم", "القيادة على اليسار", "ثقافة الحانات مهمة"] },
  usa: { currency: { name: "US Dollar", nameAr: "الدولار الأمريكي", code: "USD", rateToUSD: "1.00" }, emergency: { police: "911", ambulance: "911", fire: "911" }, customs: ["Tipping 15-20% expected", "Personal space is valued", "Diverse cultural norms by region", "Carry ID at all times"], customsAr: ["الإكرامية 15-20% متوقعة", "المساحة الشخصية مهمة", "أعراف ثقافية متنوعة حسب المنطقة", "احمل هويتك دائماً"] },
  japan: { currency: { name: "Japanese Yen", nameAr: "الين الياباني", code: "JPY", rateToUSD: "150" }, emergency: { police: "110", ambulance: "119", fire: "119" }, customs: ["Bow when greeting", "Remove shoes indoors", "No tipping expected", "Quiet on public transport"], customsAr: ["انحنِ عند التحية", "اخلع حذاءك في الداخل", "لا يُتوقع إكرامية", "التزم الهدوء في المواصلات العامة"] },
  spain: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "091", ambulance: "112", fire: "112" }, customs: ["Late dining is normal", "Siesta hours in the afternoon", "Greet with kisses on both cheeks", "Tapas culture is essential"], customsAr: ["العشاء المتأخر طبيعي", "ساعات القيلولة بعد الظهر", "حيّ بقبلة على الخدين", "ثقافة التاباس أساسية"] },
  italy: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "113", ambulance: "118", fire: "115" }, customs: ["Greeting with a kiss on both cheeks", "Dress code at churches", "Espresso is drunk standing at the bar", "Lunch is the main meal"], customsAr: ["التحية بقبلة على الخدين", "قواعد لباس في الكنائس", "الإسبريسو يُشرب واقفاً عند البار", "الغداء هو الوجبة الرئيسية"] },
  morocco: { currency: { name: "Moroccan Dirham", nameAr: "الدرهم المغربي", code: "MAD", rateToUSD: "10.0" }, emergency: { police: "19", ambulance: "15", fire: "15" }, customs: ["Bargaining is expected in souks", "Use right hand for eating", "Remove shoes when entering homes", "Mint tea is a sign of hospitality"], customsAr: ["المساومة متوقعة في الأسواق", "استخدم اليد اليمنى للأكل", "اخلع حذاءك عند دخول المنازل", "شاي النعناع رمز للضيافة"] },
  thailand: { currency: { name: "Thai Baht", nameAr: "البات التايلاندي", code: "THB", rateToUSD: "35.0" }, emergency: { police: "191", ambulance: "1669", fire: "199", tourist_police: "1155" }, customs: ["Never touch someone's head", "Remove shoes before entering temples", "Respect the monarchy", "Wai greeting (hands together)"], customsAr: ["لا تلمس رأس أحد", "اخلع حذاءك قبل دخول المعابد", "احترم الملكية", "تحية واي (الأيدي معاً)"] },
  malaysia: { currency: { name: "Malaysian Ringgit", nameAr: "الرينغيت الماليزي", code: "MYR", rateToUSD: "4.7" }, emergency: { police: "999", ambulance: "999", fire: "994" }, customs: ["Dress modestly at mosques", "Use right hand for greetings", "Remove shoes indoors", "Respect diverse religions"], customsAr: ["ارتدِ ملابس محتشمة في المساجد", "استخدم اليد اليمنى للتحية", "اخلع حذاءك في الداخل", "احترم الأديان المتنوعة"] },
  qatar: { currency: { name: "Qatari Riyal", nameAr: "الريال القطري", code: "QAR", rateToUSD: "3.64" }, emergency: { police: "999", ambulance: "999", fire: "999" }, customs: ["Dress modestly in public", "Alcohol only in licensed hotels", "Respect Islamic customs", "Photography restrictions apply"], customsAr: ["ارتدِ ملابس محتشمة في الأماكن العامة", "الكحول فقط في الفنادق المرخصة", "احترم العادات الإسلامية", "قيود على التصوير"] },
  oman: { currency: { name: "Omani Rial", nameAr: "الريال العماني", code: "OMR", rateToUSD: "0.385" }, emergency: { police: "9999", ambulance: "9999", fire: "9999" }, customs: ["Dress modestly", "Ask before photographing locals", "Remove shoes when entering homes", "Greet with 'As-salamu alaykum'"], customsAr: ["ارتدِ ملابس محتشمة", "استأذن قبل تصوير الأشخاص", "اخلع حذاءك عند دخول المنازل", "حيّ بـ 'السلام عليكم'"] },
  bahrain: { currency: { name: "Bahraini Dinar", nameAr: "الدينار البحريني", code: "BHD", rateToUSD: "0.376" }, emergency: { police: "999", ambulance: "999", fire: "999" }, customs: ["Dress modestly outside hotels", "Respect local traditions", "Alcohol available in licensed venues", "Friday is the holy day"], customsAr: ["ارتدِ ملابس محتشمة خارج الفنادق", "احترم التقاليد المحلية", "الكحول متوفر في الأماكن المرخصة", "الجمعة يوم مقدس"] },
  kuwait: { currency: { name: "Kuwaiti Dinar", nameAr: "الدينار الكويتي", code: "KWD", rateToUSD: "0.31" }, emergency: { police: "112", ambulance: "112", fire: "112" }, customs: ["Dress modestly", "No alcohol permitted", "Respect prayer times", "Hospitality is valued"], customsAr: ["ارتدِ ملابس محتشمة", "الكحول ممنوع", "احترم أوقات الصلاة", "الضيافة مهمة"] },
  iraq: { currency: { name: "Iraqi Dinar", nameAr: "الدينار العراقي", code: "IQD", rateToUSD: "1310" }, emergency: { police: "104", ambulance: "122", fire: "115" }, customs: ["Hospitality is paramount", "Dress modestly", "Ask permission before photos", "Respect religious sites"], customsAr: ["الضيافة فوق كل شيء", "ارتدِ ملابس محتشمة", "استأذن قبل التصوير", "احترم المواقع الدينية"] },
  lebanon: { currency: { name: "Lebanese Pound", nameAr: "الليرة اللبنانية", code: "LBP", rateToUSD: "89500" }, emergency: { police: "112", ambulance: "140", fire: "175" }, customs: ["Greeting with cheek kisses", "Tipping 10-15%", "Diverse religious customs", "French and Arabic both spoken"], customsAr: ["التحية بقبلة على الخدين", "الإكرامية 10-15%", "عادات دينية متنوعة", "الفرنسية والعربية مستخدمتان"] },
  germany: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "110", ambulance: "112", fire: "112" }, customs: ["Punctuality is important", "Cash is preferred in many places", "Recycling is mandatory", "Quiet hours after 10 PM"], customsAr: ["الالتزام بالمواعيد مهم", "النقد مفضل في أماكن كثيرة", "إعادة التدوير إلزامية", "ساعات الهدوء بعد 10 مساءً"] },
  netherlands: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "112", ambulance: "112", fire: "112" }, customs: ["Be direct in communication", "Cycling is king", "Split bills are normal", "Punctuality matters"], customsAr: ["كن مباشراً في التواصل", "الدراجات هي الملك", "تقسيم الفاتورة طبيعي", "الالتزام بالمواعيد مهم"] },
  greece: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "100", ambulance: "166", fire: "199", tourist_police: "171" }, customs: ["Dining is a social event", "Tipping 5-10%", "Siesta time in afternoon", "Dress modestly at monasteries"], customsAr: ["الطعام حدث اجتماعي", "الإكرامية 5-10%", "وقت القيلولة بعد الظهر", "ارتدِ ملابس محتشمة في الأديرة"] },
  portugal: { currency: { name: "Euro", nameAr: "اليورو", code: "EUR", rateToUSD: "0.92" }, emergency: { police: "112", ambulance: "112", fire: "112" }, customs: ["Greet with handshake or kiss", "Tipping 5-10%", "Late dining is common", "Fado music is cultural heritage"], customsAr: ["حيّ بالمصافحة أو القبلة", "الإكرامية 5-10%", "العشاء المتأخر شائع", "موسيقى الفادو تراث ثقافي"] },
  singapore_c: { currency: { name: "Singapore Dollar", nameAr: "الدولار السنغافوري", code: "SGD", rateToUSD: "1.35" }, emergency: { police: "999", ambulance: "995", fire: "995" }, customs: ["Chewing gum is restricted", "Strict littering fines", "Tipping not expected", "Diverse food culture"], customsAr: ["العلكة مقيدة", "غرامات صارمة على رمي القمامة", "الإكرامية غير متوقعة", "ثقافة طعام متنوعة"] },
  korea: { currency: { name: "South Korean Won", nameAr: "الوون الكوري", code: "KRW", rateToUSD: "1350" }, emergency: { police: "112", ambulance: "119", fire: "119" }, customs: ["Bow when greeting elders", "Remove shoes indoors", "Use both hands to give/receive", "Tipping not expected"], customsAr: ["انحنِ عند تحية الكبار", "اخلع حذاءك في الداخل", "استخدم كلتا اليدين للإعطاء والاستلام", "الإكرامية غير متوقعة"] },
  georgia: { currency: { name: "Georgian Lari", nameAr: "اللاري الجورجي", code: "GEL", rateToUSD: "2.7" }, emergency: { police: "112", ambulance: "112", fire: "112" }, customs: ["Hospitality is sacred", "Toast culture at meals", "Remove shoes at homes", "Respect Orthodox traditions"], customsAr: ["الضيافة مقدسة", "ثقافة الأنخاب في الوجبات", "اخلع حذاءك في المنازل", "احترم التقاليد الأرثوذكسية"] },
  azerbaijan: { currency: { name: "Azerbaijani Manat", nameAr: "المانات الأذربيجاني", code: "AZN", rateToUSD: "1.7" }, emergency: { police: "102", ambulance: "103", fire: "101" }, customs: ["Tea culture is important", "Hospitality is valued", "Dress modestly at mosques", "Respect elders"], customsAr: ["ثقافة الشاي مهمة", "الضيافة مهمة", "ارتدِ ملابس محتشمة في المساجد", "احترم الكبار"] },
  indonesia: { currency: { name: "Indonesian Rupiah", nameAr: "الروبية الإندونيسية", code: "IDR", rateToUSD: "15800" }, emergency: { police: "110", ambulance: "118", fire: "113" }, customs: ["Remove shoes indoors", "Use right hand", "Dress modestly at temples", "Bargaining at markets"], customsAr: ["اخلع حذاءك في الداخل", "استخدم اليد اليمنى", "ارتدِ ملابس محتشمة في المعابد", "المساومة في الأسواق"] },
  india: { currency: { name: "Indian Rupee", nameAr: "الروبية الهندية", code: "INR", rateToUSD: "83" }, emergency: { police: "100", ambulance: "102", fire: "101" }, customs: ["Remove shoes at temples", "Use right hand for eating", "Namaste greeting", "Bargaining is common"], customsAr: ["اخلع حذاءك في المعابد", "استخدم اليد اليمنى للأكل", "تحية ناماستي", "المساومة شائعة"] },
};

const normalizeText = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function detectCountry(destination: string): string | null {
  const d = normalizeText(destination);
  const mappings: [string[], string][] = [
    [["uae", "emirates", "الإمارات", "الشارقة", "دبي", "أبوظبي", "sharjah", "dubai", "abu dhabi", "ajman", "عجمان", "ras al khaimah", "رأس الخيمة", "fujairah", "الفجيرة", "al ain", "العين"], "uae"],
    [["saudi", "السعودية", "جدة", "الرياض", "jeddah", "riyadh", "mecca", "مكة", "المدينة", "medina", "dammam", "الدمام", "khobar", "الخبر", "tabuk", "تبوك", "abha", "أبها", "al ula", "العلا", "neom", "نيوم", "taif", "الطائف", "yanbu", "ينبع"], "saudi"],
    [["egypt", "مصر", "القاهرة", "cairo", "الأقصر", "luxor", "أسوان", "aswan", "الإسكندرية", "alexandria", "sharm", "شرم الشيخ", "hurghada", "الغردقة"], "egypt"],
    [["turkey", "تركيا", "istanbul", "إسطنبول", "أنطاليا", "antalya", "طرابزون", "trabzon", "ankara", "أنقرة", "bodrum", "بودروم", "cappadocia", "كابادوكيا", "izmir", "bursa"], "turkey"],
    [["jordan", "الأردن", "عمان", "amman", "البتراء", "petra", "العقبة", "aqaba"], "jordan"],
    [["qatar", "قطر", "الدوحة", "doha", "lusail", "لوسيل"], "qatar"],
    [["oman", "عمان", "مسقط", "muscat", "صلالة", "salalah"], "oman"],
    [["bahrain", "البحرين", "المنامة", "manama"], "bahrain"],
    [["kuwait", "الكويت", "kuwait city"], "kuwait"],
    [["iraq", "العراق", "بغداد", "baghdad", "أربيل", "erbil"], "iraq"],
    [["lebanon", "لبنان", "بيروت", "beirut"], "lebanon"],
    [["france", "فرنسا", "paris", "باريس", "نيس", "nice", "مرسيليا", "marseille", "lyon"], "france"],
    [["uk", "britain", "بريطانيا", "london", "لندن", "england", "إنجلترا", "scotland", "اسكتلندا", "manchester", "edinburgh", "liverpool"], "uk"],
    [["usa", "united states", "أمريكا", "نيويورك", "new york", "لوس أنجلوس", "los angeles", "واشنطن", "washington", "chicago", "miami", "san francisco", "orlando", "las vegas"], "usa"],
    [["japan", "اليابان", "tokyo", "طوكيو", "أوساكا", "osaka", "كيوتو", "kyoto"], "japan"],
    [["spain", "إسبانيا", "madrid", "مدريد", "barcelona", "برشلونة", "seville", "valencia", "malaga", "granada"], "spain"],
    [["italy", "إيطاليا", "rome", "روما", "ميلانو", "milan", "البندقية", "venice", "florence", "naples"], "italy"],
    [["morocco", "المغرب", "مراكش", "marrakech", "الدار البيضاء", "casablanca", "فاس", "fez", "طنجة", "tangier"], "morocco"],
    [["thailand", "تايلاند", "بانكوك", "bangkok", "بوكيت", "phuket", "شيانغ ماي", "chiang mai"], "thailand"],
    [["malaysia", "ماليزيا", "كوالالمبور", "kuala lumpur", "لانكاوي", "langkawi", "بينانغ", "penang"], "malaysia"],
    [["germany", "ألمانيا", "برلين", "berlin", "ميونخ", "munich", "فرانكفورت", "frankfurt", "هامبورغ", "hamburg", "نورنبرغ", "nurnberg", "nuremberg", "كولن", "cologne", "دوسلدورف", "dusseldorf", "شتوتغارت", "stuttgart", "دريسدن", "dresden"], "germany"],
    [["netherlands", "هولندا", "أمستردام", "amsterdam", "روتردام", "rotterdam"], "netherlands"],
    [["greece", "اليونان", "أثينا", "athens", "سانتوريني", "santorini", "ميكونوس", "mykonos"], "greece"],
    [["portugal", "البرتغال", "لشبونة", "lisbon", "بورتو", "porto"], "portugal"],
    [["singapore", "سنغافورة"], "singapore_c"],
    [["korea", "كوريا", "سيول", "seoul", "بوسان", "busan"], "korea"],
    [["georgia", "جورجيا", "تبليسي", "tbilisi", "باتومي", "batumi"], "georgia"],
    [["azerbaijan", "أذربيجان", "باكو", "baku"], "azerbaijan"],
    [["indonesia", "إندونيسيا", "جاكرتا", "jakarta", "بالي", "bali"], "indonesia"],
    [["india", "الهند", "mumbai", "مومباي", "delhi", "دلهي", "new delhi"], "india"],
  ];
  for (const [keys, country] of mappings) {
    if (keys.some(k => d.includes(k))) return country;
  }
  return null;
}

const COUNTRY_CODE_TO_KEY: Record<string, string> = {
  AE: "uae", SA: "saudi", EG: "egypt", TR: "turkey", JO: "jordan", QA: "qatar",
  OM: "oman", BH: "bahrain", KW: "kuwait", IQ: "iraq", LB: "lebanon", FR: "france",
  GB: "uk", US: "usa", JP: "japan", ES: "spain", IT: "italy", MA: "morocco",
  TH: "thailand", MY: "malaysia", DE: "germany", NL: "netherlands", GR: "greece",
  PT: "portugal", SG: "singapore_c", KR: "korea", GE: "georgia", AZ: "azerbaijan",
  ID: "indonesia", IN: "india",
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const toDateKey = (value?: string | Date) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const alignForecastDatesToTrip = (forecast: ForecastDay[], startKey: string, days: number): ForecastDay[] => {
  if (!startKey || !/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return forecast;
  const [y, m, d] = startKey.split('-').map(Number);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(Date.UTC(y, m - 1, d + index)).toISOString().slice(0, 10);
    const source = forecast[index] || forecast[forecast.length - 1];
    return source ? { ...source, date, estimated: source.estimated || source.date !== date } : null;
  }).filter(Boolean) as ForecastDay[];
};

// Export destination info as HTML
const exportAsHTML = (destination: string, wikiData: WikipediaData | null, weatherData: WeatherData | null, forecastDays: ForecastDay[], countryInfo: typeof COUNTRY_DATA[string] | null, newsItems: NewsItem[]) => {
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>معلومات الوجهة - ${destination}</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff}
h1{color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:8px}
h2{color:#334155;margin-top:24px}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;background:#f8fafc}
.emergency{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.emergency a{display:block;padding:12px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;text-decoration:none;color:#0d9488;font-weight:bold;font-size:18px}
.emergency a:hover{background:#f0fdfa}
.forecast{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.forecast-day{border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
.news-item{border-bottom:1px solid #f1f5f9;padding:12px 0}
.news-item:last-child{border-bottom:none}
footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px}
</style></head><body>
<h1>📍 ${destination}</h1>
${wikiData?.extract ? `<div class="card"><h2>📖 نبذة عن الوجهة</h2><p>${wikiData.extract}</p></div>` : ''}
${weatherData ? `<div class="card"><h2>🌤️ الطقس الحالي</h2><p><strong>${weatherData.temp}</strong> - ${weatherData.condition}</p><p>الرطوبة: ${weatherData.humidity} | الرياح: ${weatherData.wind_speed}</p></div>` : ''}
${forecastDays.length > 0 ? `<div class="card"><h2>📅 توقعات الطقس</h2><div class="forecast">${forecastDays.map(d => `<div class="forecast-day"><div><strong>${d.date}</strong></div><div>${d.condition}</div><div>${d.temp_min} — ${d.temp_max}</div></div>`).join('')}</div></div>` : ''}
${countryInfo?.currency ? `<div class="card"><h2>💱 العملة المحلية</h2><p>${countryInfo.currency.nameAr} (${countryInfo.currency.code})</p><p>1 USD ≈ ${countryInfo.currency.rateToUSD} ${countryInfo.currency.code}</p></div>` : ''}
${countryInfo?.emergency ? `<div class="card"><h2>📞 أرقام الطوارئ</h2><div class="emergency"><a href="tel:${countryInfo.emergency.police}">🚔 الشرطة<br>${countryInfo.emergency.police}</a><a href="tel:${countryInfo.emergency.ambulance}">🚑 الإسعاف<br>${countryInfo.emergency.ambulance}</a><a href="tel:${countryInfo.emergency.fire}">🚒 الدفاع المدني<br>${countryInfo.emergency.fire}</a>${countryInfo.emergency.tourist_police ? `<a href="tel:${countryInfo.emergency.tourist_police}">🛡️ شرطة السياحة<br>${countryInfo.emergency.tourist_police}</a>` : ''}</div></div>` : ''}
${countryInfo?.customsAr?.length ? `<div class="card"><h2>🎭 العادات والتقاليد</h2><ul>${countryInfo.customsAr.map(c => `<li>${c}</li>`).join('')}</ul></div>` : ''}
${newsItems.length > 0 ? `<div class="card"><h2>📰 مستجدات</h2>${newsItems.map(n => `<div class="news-item"><strong>${n.title}</strong><p>${n.summary}</p>${n.url ? `<a href="${n.url}" target="_blank">المصدر ↗</a>` : ''}</div>`).join('')}</div>` : ''}
<footer>ASEEL AI TRIP · ${new Date().toLocaleDateString('ar')}</footer>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${destination.replace(/\W+/g, '_')}_info.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Export as PDF (using print)
const exportAsPDF = (containerRef: React.RefObject<HTMLDivElement>) => {
  if (!containerRef.current) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><style>
  body{font-family:system-ui,sans-serif;padding:20px;color:#1a1a1a;max-width:700px;margin:0 auto}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  </style></head><body>${containerRef.current.innerHTML}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
};

const DestinationInfoCard = ({ destination, compact = false, tripDays = 3, startDate }: DestinationInfoCardProps) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const {
    weatherEnabled, newsEnabled, emergencyEnabled, hasPlan,
    canUseWeather, canUseEmergency, canUseNews,
    remainingWeatherUses, remainingEmergencyUses, remainingNewsUses,
    maxWeatherUses, maxEmergencyUses, maxNewsUses,
    trackInfoUsage,
  } = useSubscriptionLimits();
  const [loading, setLoading] = useState(true);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [countryInfo, setCountryInfo] = useState<typeof COUNTRY_DATA[string] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const applyPayload = useCallback((payload: any) => {
    const tripStartKey = toDateKey(startDate);
    const rawForecast = Array.isArray(payload.forecast) ? payload.forecast : [];
    const alignedForecast = alignForecastDatesToTrip(rawForecast, tripStartKey, tripDays);
    const firstTripWeather = alignedForecast[0];
    setWeatherData(firstTripWeather ? {
      ...(payload.weather || {}),
      temp: firstTripWeather.temp_max || payload.weather?.temp,
      temp_min: firstTripWeather.temp_min || payload.weather?.temp_min,
      temp_max: firstTripWeather.temp_max || payload.weather?.temp_max,
      condition: firstTripWeather.condition || payload.weather?.condition,
      icon: firstTripWeather.icon || payload.weather?.icon,
      main: firstTripWeather.condition || payload.weather?.main,
    } : (payload.weather || null));
    setForecastDays(alignedForecast);
    setWikiData(payload.wikipedia || null);
    setNewsItems(Array.isArray(payload.news) ? payload.news : []);
    setSourceLinks(Array.isArray(payload.sources) ? payload.sources : []);
    setLastUpdated(payload.fetched_at || new Date().toISOString());
  }, [startDate, tripDays]);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    if (!destination || !destination.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const normalizedDestination = normalizeText(destination);
    const tripStartKey = toDateKey(startDate);
    const cacheKey = `destination-insights:v5:${normalizedDestination}:${i18n.language || 'en'}:${tripDays}:${tripStartKey}`;

    if (!forceRefresh) {
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.timestamp && Date.now() - cached.timestamp < CACHE_TTL_MS && cached?.payload) {
            applyPayload(cached.payload);
            const cachedCountry = detectCountry(`${destination} ${cached.payload?.resolved_destination || ''}`);
            if (cachedCountry && COUNTRY_DATA[cachedCountry]) setCountryInfo(COUNTRY_DATA[cachedCountry]);
            setLoading(false);
            return;
          }
        }
      } catch { localStorage.removeItem(cacheKey); }
    }

    const fallbackCountry = detectCountry(destination);
    if (fallbackCountry && COUNTRY_DATA[fallbackCountry]) setCountryInfo(COUNTRY_DATA[fallbackCountry]);

    try {
      const { data, error } = await supabase.functions.invoke('destination-info', {
        body: { destination, lang: i18n.language || 'en', tripDays, startDate: tripStartKey },
      });
      if (!error && data) {
        applyPayload(data);
        const countryCode = String(data.country_code || '').toUpperCase();
        const countryKeyFromCode = COUNTRY_CODE_TO_KEY[countryCode];
        const countryKeyFallback = detectCountry(`${destination} ${data?.resolved_destination || ''}`);
        const finalCountryKey = countryKeyFromCode || countryKeyFallback;
        if (finalCountryKey && COUNTRY_DATA[finalCountryKey]) setCountryInfo(COUNTRY_DATA[finalCountryKey]);
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), payload: data }));
      }
    } catch (e) { console.error("Edge function error:", e); }
    finally { setLoading(false); }
  }, [applyPayload, destination, i18n.language, tripDays, startDate]);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  // Weather, Emergency & News are ALWAYS shown when data is available (essential info).
  // Plan gating only controls usage tracking — never visibility.
  const _hasWeatherForTrack = !loading && !!weatherData && hasPlan && weatherEnabled && canUseWeather;
  const _hasEmergencyForTrack = !loading && !!countryInfo?.emergency && hasPlan && emergencyEnabled && canUseEmergency;
  const _hasNewsForTrack = !loading && newsItems.length > 0 && hasPlan && newsEnabled && canUseNews;

  // Track usage once per destination when actually shown (plan-gated only)
  useEffect(() => {
    if (_hasWeatherForTrack && maxWeatherUses > 0) trackInfoUsage('weather');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasWeatherForTrack, destination]);
  useEffect(() => {
    if (_hasEmergencyForTrack && maxEmergencyUses > 0) trackInfoUsage('emergency');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasEmergencyForTrack, destination]);
  useEffect(() => {
    if (_hasNewsForTrack && maxNewsUses > 0) trackInfoUsage('news');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasNewsForTrack, destination]);

  if (loading) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center py-4">
          <div className="relative">
            <Loader2 size={28} className="animate-spin text-primary" />
            <Globe size={14} className="absolute -bottom-1 -right-1 text-primary/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {(() => {
                const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
                const m: Record<string, string> = {
                  en: `Preparing your dream trip to ${destination}...`,
                  ar: `جاري تجهيز رحلة أحلامك إلى ${destination}...`,
                  fr: `Préparation de votre voyage de rêve à ${destination}...`,
                  es: `Preparando tu viaje soñado a ${destination}...`,
                  de: `Wir bereiten Ihre Traumreise nach ${destination} vor...`,
                  ru: `Готовим ваше путешествие мечты в ${destination}...`,
                  zh: `正在为您准备前往 ${destination} 的梦想之旅...`,
                  ur: `${destination} کا آپ کا خوابوں کا سفر تیار کیا جا رہا ہے...`,
                };
                return m[code] || m.en;
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(() => {
                const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
                const m: Record<string, string> = {
                  en: 'Fetching live data for you', ar: 'نجلب لك أحدث البيانات الحية',
                  fr: 'Récupération des données en direct', es: 'Obteniendo datos en vivo para ti',
                  de: 'Live-Daten werden geladen', ru: 'Загружаем актуальные данные',
                  zh: '正在为您获取实时数据', ur: 'آپ کے لیے لائیو ڈیٹا حاصل کیا جا رہا ہے',
                };
                return m[code] || m.en;
              })()}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const hasCurrency = !!countryInfo?.currency;
  // News follows plan gating (toggle + quota); when plan disables, fall back to no news
  const hasNews = newsItems.length > 0 && (!hasPlan || (newsEnabled && canUseNews));
  // Weather & Emergency: always visible when data is available — never hide for safety reasons
  const hasWeather = !!weatherData;
  const hasForecast = forecastDays.length > 0;
  const hasEmergency = !!countryInfo?.emergency;
  const hasCustoms = (countryInfo?.customs?.length || 0) > 0;
  const hasWiki = !!wikiData?.extract;
  const hasSources = sourceLinks.length > 0;
  const hasAny = hasCurrency || hasNews || hasWeather || hasForecast || hasEmergency || hasCustoms || hasWiki || hasSources;

  // Track usage once per destination render when actually shown (only if plan-gated)
  // (moved above the loading early-return to satisfy the hooks rules)

  if (!hasAny) return null;

  const formatForecastDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(i18n.language || 'en', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const uniqueSources = sourceLinks.filter(
    (item, index, arr) => item?.url && arr.findIndex((x) => x.url === item.url) === index
  );

  const weatherIconUrl = weatherData?.icon
    ? `https://openweathermap.org/img/wn/${weatherData.icon}@2x.png`
    : null;

  return (
    <div className="space-y-3 w-full max-w-full [overflow-wrap:anywhere] [word-break:break-word]" ref={containerRef}>
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-2 w-full max-w-full">
        <div className="flex gap-1.5 max-w-full flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => fetchAll(true)} className="gap-1.5 text-xs text-muted-foreground h-8 max-w-full">
            <RefreshCw size={12} />
            {isArabic ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
        <div className="flex gap-1.5 max-w-full flex-wrap">
          <Button variant="outline" size="sm" className="gap-1 text-xs h-8 max-w-full"
            onClick={() => exportAsHTML(destination, wikiData, weatherData, forecastDays, countryInfo, newsItems)}>
            <FileText size={12} /> HTML
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-xs h-8 max-w-full"
            onClick={() => exportAsPDF(containerRef)}>
            <Download size={12} /> PDF
          </Button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-[11px] text-muted-foreground text-end">
          {isArabic ? 'آخر تحديث' : 'Last updated'}: {new Date(lastUpdated).toLocaleString(i18n.language || 'en')}
        </p>
      )}

      {/* Wikipedia Overview */}
      {hasWiki && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Globe size={14} className="text-primary shrink-0" />
            <span className="truncate">{isArabic ? 'نبذة عن الوجهة' : 'About the Destination'}</span>
          </h3>
          <div className="flex gap-2 sm:gap-3 w-full max-w-full items-start min-w-0">
            {wikiData!.thumbnail && (
              <img src={wikiData!.thumbnail} alt={wikiData!.title} className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg object-cover shrink-0" loading="lazy" />
            )}
            <div className="min-w-0 flex-1 max-w-full overflow-hidden">
              {wikiData!.description && (
                <p className="text-xs text-primary font-medium mb-1 line-clamp-1 [overflow-wrap:anywhere]">{wikiData!.description}</p>
              )}
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 [overflow-wrap:anywhere] [word-break:break-word]">{wikiData!.extract}</p>
              {wikiData?.source_url && (
                <a href={wikiData.source_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">
                  {isArabic ? 'عرض المصدر' : 'View source'} <ExternalLink size={11} className="shrink-0" />
                </a>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Currency */}
      {hasCurrency && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-primary shrink-0" />
            {isArabic ? 'العملة المحلية' : 'Local Currency'}
          </h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">
              {isArabic ? countryInfo!.currency.nameAr : countryInfo!.currency.name} ({countryInfo!.currency.code})
            </div>
            <div>1 USD ≈ {countryInfo!.currency.rateToUSD} {countryInfo!.currency.code}</div>
          </div>
        </Card>
      )}

      {/* Weather */}
      {hasWeather && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5">
              <Thermometer size={14} className="text-primary shrink-0" />
              {isArabic ? 'الطقس الحالي' : 'Current Weather'}
            </span>
            {remainingWeatherUses !== null && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {isArabic ? `${remainingWeatherUses} متبقية` : `${remainingWeatherUses} left`}
              </span>
            )}
          </h3>
          <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap max-w-full">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              {weatherIconUrl && (
                <img
                  src={weatherIconUrl}
                  alt=""
                  aria-hidden="true"
                  className="w-12 h-12 shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div className="min-w-0">
                <div className="font-bold text-foreground text-xl leading-tight">{weatherData!.temp}</div>
                <div className="text-muted-foreground capitalize text-sm leading-tight truncate">{weatherData!.condition}</div>
              </div>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1 text-xs text-muted-foreground w-full">
              <div className="flex items-center gap-1 min-w-0">
                <CloudSun size={10} className="shrink-0" />
                <span className="break-words">{isArabic ? 'يبدو كأنه' : 'Feels like'}: {weatherData!.feels_like}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <Droplets size={10} className="shrink-0" />
                <span className="break-words">{isArabic ? 'الرطوبة' : 'Humidity'}: {weatherData!.humidity}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <Wind size={10} className="shrink-0" />
                <span className="break-words">{isArabic ? 'الرياح' : 'Wind'}: {weatherData!.wind_speed}</span>
              </div>
              <div className="text-muted-foreground/60 break-words">
                {isArabic ? 'الحد الأدنى' : 'Min'}: {weatherData!.temp_min} — {isArabic ? 'الأقصى' : 'Max'}: {weatherData!.temp_max}
              </div>
            </div>
          </div>

          {hasForecast && (
            <div className="mt-3 border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <CalendarDays size={12} className="text-primary" />
                {isArabic ? `توقعات ${forecastDays.length} أيام` : `${forecastDays.length}-day forecast`}
              </h4>
              <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                {forecastDays.slice(0, tripDays).map((day) => {
                  const iconUrl = day.icon ? `https://openweathermap.org/img/wn/${day.icon}.png` : null;
                  const conditionEmoji = (() => {
                    const c = (day.condition || '').toLowerCase();
                    if (c.includes('clear') || c.includes('صاف')) return '☀️';
                    if (c.includes('rain') || c.includes('مطر')) return '🌧️';
                    if (c.includes('snow') || c.includes('ثلج')) return '❄️';
                    if (c.includes('storm') || c.includes('عاصف')) return '⛈️';
                    if (c.includes('fog') || c.includes('mist') || c.includes('ضباب')) return '🌫️';
                    if (c.includes('cloud') || c.includes('غائم')) return '☁️';
                    return '🌤️';
                  })();
                  return (
                    <div key={day.date} className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-[11px] sm:text-xs min-w-0">
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span className="font-medium text-foreground truncate min-w-0">{formatForecastDate(day.date)}</span>
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt=""
                            aria-hidden="true"
                            className="w-6 h-6 shrink-0"
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = 'none';
                              const fallback = img.nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'inline';
                            }}
                          />
                        ) : null}
                        <span className="text-base leading-none shrink-0" style={{ display: iconUrl ? 'none' : 'inline' }}>{conditionEmoji}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 line-clamp-1">{day.condition}</p>
                      <p className="text-foreground mt-0.5 font-medium truncate">{day.temp_min} — {day.temp_max}</p>
                      {day.estimated && (
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">
                          {isArabic ? '~ تقديري' : '~ estimated'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Emergency Numbers */}
      {hasEmergency && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5">
              <Phone size={14} className="text-destructive shrink-0" />
              {isArabic ? 'أرقام الطوارئ' : 'Emergency Numbers'}
            </span>
            {remainingEmergencyUses !== null && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {isArabic ? `${remainingEmergencyUses} متبقية` : `${remainingEmergencyUses} left`}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            {[
              { label: isArabic ? 'الشرطة' : 'Police', num: countryInfo!.emergency.police, icon: '🚔' },
              { label: isArabic ? 'الإسعاف' : 'Ambulance', num: countryInfo!.emergency.ambulance, icon: '🚑' },
              { label: isArabic ? 'الدفاع المدني' : 'Fire', num: countryInfo!.emergency.fire, icon: '🚒' },
              ...(countryInfo!.emergency.tourist_police ? [{ label: isArabic ? 'شرطة السياحة' : 'Tourist Police', num: countryInfo!.emergency.tourist_police, icon: '🛡️' }] : []),
            ].map((item, i) => (
              <a key={i} href={`tel:${item.num.replace(/\s+/g, '')}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 hover:bg-muted/50 active:scale-[0.98] transition-all">
                <span className="text-lg">{item.icon}</span>
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  <div className="text-base font-bold text-foreground">{item.num}</div>
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Customs */}
      {hasCustoms && !compact && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BookOpen size={14} className="text-primary shrink-0" />
            {isArabic ? 'العادات والتقاليد' : 'Customs & Tips'}
          </h3>
          <ul className="space-y-1.5">
            {(isArabic ? countryInfo!.customsAr : countryInfo!.customs).map((c, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Shield size={10} className="text-violet-500 mt-0.5 shrink-0" /> {c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* News section removed per user request */}

      {/* Data Sources */}
      {uniqueSources.length > 0 && (
        <Card className="p-3 sm:p-4 w-full max-w-full">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Globe size={14} className="text-primary shrink-0" />
            <span className="truncate">{isArabic ? 'مصادر البيانات' : 'Data Sources'}</span>
          </h3>
          <ul className="space-y-1.5 w-full max-w-full">
            {uniqueSources.map((source, index) => (
              <li key={`${source.url}-${index}`} className="min-w-0 max-w-full">
                <a href={source.url} target="_blank" rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 min-w-0 max-w-full">
                  <ExternalLink size={10} className="shrink-0" />
                  <span className="truncate min-w-0">{source.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default DestinationInfoCard;
