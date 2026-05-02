import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, BarChart3, Globe, Users, MapPin, Search, Plane, MessageSquare, Heart, Camera, Mic, Volume2, Brain, TrendingUp, Clock, Eye, BookOpen, Archive, Monitor, Smartphone, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AnalyticsData {
  totalUsers: number;
  totalTrips: number;
  totalSearches: number;
  totalStories: number;
  totalLikes: number;
  totalComments: number;
  totalMemories: number;
  totalFavorites: number;
  topDestinations: { destination: string; count: number }[];
  topSearchQueries: { query: string; count: number }[];
  recentSearches: { query: string; destination: string; type: string; user: string; date: string }[];
  usersByLanguage: { lang: string; count: number }[];
  searchByType: { type: string; count: number }[];
  usageByFeature: { feature: string; count: number }[];
  activeUsersToday: number;
  activeUsersWeek: number;
  tripsThisMonth: number;
  storiesThisMonth: number;
  totalPageViews: number;
  pageViewsToday: number;
  pageViewsWeek: number;
  uniqueVisitorsToday: number;
  uniqueVisitorsWeek: number;
  topPages: { path: string; count: number }[];
  visitorsByLanguage: { lang: string; count: number }[];
  visitorsByDevice: { device: string; count: number }[];
  visitorsByBrowser: { browser: string; count: number }[];
  visitorsByOS: { os: string; count: number }[];
  recentVisitors: { path: string; language: string; device: string; time: string; country?: string; browser?: string }[];
  usersByGender: { gender: string; count: number }[];
  usersByCountry: { country: string; count: number }[];
  usersByAgeGroup: { group: string; count: number }[];
  avgAge: number;
  guestGenerations: number;
  totalGenerations: number;
  visitorsByCountry: { country: string; count: number }[];
  uniqueDevices: number;
}

const parseBrowser = (ua: string): string => {
  if (!ua) return "Unknown";
  if (ua.includes("Googlebot") || ua.includes("GoogleOther")) return "Googlebot";
  if (ua.includes("bingbot")) return "Bingbot";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("CriOS/")) return "Chrome (iOS)";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
  return "Other";
};

const parseOS = (ua: string): string => {
  if (!ua) return "Unknown";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Other";
};

const countryNames: Record<string, string> = {
  SA: "🇸🇦 Saudi Arabia", AE: "🇦🇪 UAE", EG: "🇪🇬 Egypt", JO: "🇯🇴 Jordan",
  KW: "🇰🇼 Kuwait", QA: "🇶🇦 Qatar", BH: "🇧🇭 Bahrain", OM: "🇴🇲 Oman",
  IQ: "🇮🇶 Iraq", LB: "🇱🇧 Lebanon", SY: "🇸🇾 Syria", YE: "🇾🇪 Yemen",
  MA: "🇲🇦 Morocco", TN: "🇹🇳 Tunisia", DZ: "🇩🇿 Algeria", LY: "🇱🇾 Libya",
  TR: "🇹🇷 Turkey", IR: "🇮🇷 Iran", US: "🇺🇸 USA", GB: "🇬🇧 UK",
  FR: "🇫🇷 France", DE: "🇩🇪 Germany", ES: "🇪🇸 Spain", IT: "🇮🇹 Italy",
  IN: "🇮🇳 India", PK: "🇵🇰 Pakistan", JP: "🇯🇵 Japan", KR: "🇰🇷 South Korea",
  CN: "🇨🇳 China", AU: "🇦🇺 Australia", CA: "🇨🇦 Canada", BR: "🇧🇷 Brazil",
  RU: "🇷🇺 Russia", NL: "🇳🇱 Netherlands", SE: "🇸🇪 Sweden",
  AS: "🌏 Asia", EU: "🌍 Europe", AF: "🌍 Africa", AM: "🌎 Americas",
  HK: "🇭🇰 Hong Kong", SG: "🇸🇬 Singapore", MY: "🇲🇾 Malaysia", ID: "🇮🇩 Indonesia",
  PH: "🇵🇭 Philippines", NZ: "🇳🇿 New Zealand", MX: "🇲🇽 Mexico", ZA: "🇿🇦 South Africa",
  KE: "🇰🇪 Kenya", NG: "🇳🇬 Nigeria", NO: "🇳🇴 Norway",
};

const safeQuery = async (fn: () => any, fallback: any): Promise<any> => {
  try { return await fn(); } catch (e) { console.warn("Query failed:", e); return fallback; }
};

const AdminAnalytics = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Each query wrapped in safeQuery to prevent one failure from breaking all
      const [usersRes, tripsRes, searchRes, storiesRes, likesRes, commentsRes,
        memoriesRes, favoritesRes, usageRes, searchAnalyticsRes, pageViewsRes,
        pageViewsTodayRes, pageViewsWeekRes] = await Promise.all([
        safeQuery(() => supabase.from("profiles").select("id, created_at, preferred_language, preferred_currency, gender, country, age, username, full_name, email, birthdate", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("saved_trips").select("id, destination, created_at", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("search_history").select("id, search_type, query_text, destination, created_at, user_id", { count: "exact" }).order("created_at", { ascending: false }).limit(200), { data: [], count: 0 }),
        safeQuery(() => supabase.from("travel_stories").select("id, created_at, likes_count", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("story_likes").select("id", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("story_comments").select("id", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("memories").select("id", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("favorites").select("id", { count: "exact" }), { data: [], count: 0 }),
        safeQuery(() => supabase.from("usage_tracking").select("id, feature, used_at, user_id, guest_id").order("used_at", { ascending: false }).limit(500), { data: [] }),
        safeQuery(() => supabase.from("search_analytics").select("id, search_type, search_query, destination, created_at, user_id, guest_id").order("created_at", { ascending: false }).limit(300), { data: [], count: 0 }),
        safeQuery(() => supabase.from("page_views").select("id, page_path, user_id, guest_id, language, user_agent, screen_width, created_at, country", { count: "exact" }).order("created_at", { ascending: false }).limit(1000), { data: [], count: 0 }),
        safeQuery(() => supabase.from("page_views").select("id, user_id, guest_id", { count: "exact" }).gte("created_at", todayStart), { data: [], count: 0 }),
        safeQuery(() => supabase.from("page_views").select("id, user_id, guest_id", { count: "exact" }).gte("created_at", weekAgo), { data: [], count: 0 }),
      ]);

      const pageViews = (pageViewsRes as any).data || [];
      const totalPageViews = (pageViewsRes as any).count || 0;
      const pageViewsToday = (pageViewsTodayRes as any).count || 0;
      const pageViewsWeek = (pageViewsWeekRes as any).count || 0;

      const todayVisitorSet = new Set(((pageViewsTodayRes as any).data || []).map((v: any) => v.user_id || v.guest_id));
      const weekVisitorSet = new Set(((pageViewsWeekRes as any).data || []).map((v: any) => v.user_id || v.guest_id));

      // Top pages
      const pageCount: Record<string, number> = {};
      pageViews.forEach((v: any) => { const p = v.page_path || "/"; pageCount[p] = (pageCount[p] || 0) + 1; });
      const topPages = Object.entries(pageCount).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10);

      // Visitors by language
      const vLangCount: Record<string, number> = {};
      pageViews.forEach((v: any) => {
        const lang = (v.language || "unknown").split("-")[0];
        const label = lang === "ar" ? "العربية" : lang === "en" ? "English" : lang === "fr" ? "Français" : lang === "tr" ? "Türkçe" : lang === "de" ? "Deutsch" : lang === "es" ? "Español" : lang === "ur" ? "اردو" : lang === "ru" ? "Русский" : lang === "zh" ? "中文" : lang;
        vLangCount[label] = (vLangCount[label] || 0) + 1;
      });
      const visitorsByLanguage = Object.entries(vLangCount).map(([lang, count]) => ({ lang, count })).sort((a, b) => b.count - a.count);

      // Visitors by device
      const deviceCount: Record<string, number> = {};
      pageViews.forEach((v: any) => {
        const w = v.screen_width || 0;
        const device = w <= 480 ? (isAr ? "📱 جوال" : "📱 Mobile") : w <= 1024 ? (isAr ? "📱 تابلت" : "📱 Tablet") : (isAr ? "💻 كمبيوتر" : "💻 Desktop");
        deviceCount[device] = (deviceCount[device] || 0) + 1;
      });
      const visitorsByDevice = Object.entries(deviceCount).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count);

      // Visitors by browser
      const browserCount: Record<string, number> = {};
      pageViews.forEach((v: any) => {
        const b = parseBrowser(v.user_agent || "");
        browserCount[b] = (browserCount[b] || 0) + 1;
      });
      const visitorsByBrowser = Object.entries(browserCount).map(([browser, count]) => ({ browser, count })).sort((a, b) => b.count - a.count);

      // Visitors by OS
      const osCount: Record<string, number> = {};
      pageViews.forEach((v: any) => {
        const os = parseOS(v.user_agent || "");
        osCount[os] = (osCount[os] || 0) + 1;
      });
      const visitorsByOS = Object.entries(osCount).map(([os, count]) => ({ os, count })).sort((a, b) => b.count - a.count);

      // Recent visitors
      const recentVisitors = pageViews.slice(0, 25).map((v: any) => ({
        path: v.page_path || "/",
        language: (v.language || "unknown").split("-")[0],
        device: (v.screen_width || 0) <= 480 ? "📱" : (v.screen_width || 0) <= 1024 ? "📱" : "💻",
        time: new Date(v.created_at).toLocaleString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        country: v.country || "",
        browser: parseBrowser(v.user_agent || ""),
      }));

      // Top destinations
      const destCount: Record<string, number> = {};
      ((tripsRes as any).data || []).forEach((t: any) => { const d = t.destination || ""; if (d) destCount[d] = (destCount[d] || 0) + 1; });
      ((searchAnalyticsRes as any).data || []).forEach((s: any) => { const d = s.destination || ""; if (d) destCount[d] = (destCount[d] || 0) + 1; });
      ((searchRes as any).data || []).forEach((s: any) => { const d = s.destination || ""; if (d) destCount[d] = (destCount[d] || 0) + 1; });
      const topDestinations = Object.entries(destCount).map(([destination, count]) => ({ destination, count })).sort((a, b) => b.count - a.count).slice(0, 10);

      // Top search queries
      const queryCount: Record<string, number> = {};
      ((searchRes as any).data || []).forEach((s: any) => { const q = s.query_text || s.destination || ""; if (q) queryCount[q] = (queryCount[q] || 0) + 1; });
      ((searchAnalyticsRes as any).data || []).forEach((s: any) => { const q = s.search_query || s.destination || ""; if (q) queryCount[q] = (queryCount[q] || 0) + 1; });
      const topSearchQueries = Object.entries(queryCount).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10);

      // Search by type
      const typeCount: Record<string, number> = {};
      ((searchRes as any).data || []).forEach((s: any) => { const t = s.search_type || "trip"; typeCount[t] = (typeCount[t] || 0) + 1; });
      const searchByType = Object.entries(typeCount).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

      // Usage by feature
      const featureCount: Record<string, number> = {};
      ((usageRes as any).data || []).forEach((u: any) => { const f = u.feature || "other"; featureCount[f] = (featureCount[f] || 0) + 1; });
      const usageByFeature = Object.entries(featureCount).map(([feature, count]) => ({ feature, count })).sort((a, b) => b.count - a.count);

      // Active users
      const usageData = (usageRes as any).data || [];
      const todayUsers = new Set(usageData.filter((u: any) => u.used_at >= todayStart && u.user_id).map((u: any) => u.user_id));
      const weekUsers = new Set(usageData.filter((u: any) => u.used_at >= weekAgo && u.user_id).map((u: any) => u.user_id));
      const tripsThisMonth = ((tripsRes as any).data || []).filter((t: any) => t.created_at >= monthStart).length;
      const storiesThisMonth = ((storiesRes as any).data || []).filter((s: any) => s.created_at >= monthStart).length;

      // Recent searches
      const recentSearches = ((searchRes as any).data || []).slice(0, 20).map((s: any) => ({
        query: s.query_text || "",
        destination: s.destination || "",
        type: s.search_type || "trip",
        user: s.user_id?.substring(0, 8) || "guest",
        date: new Date(s.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US"),
      }));

      // Users by language
      const langCount: Record<string, number> = {};
      ((usersRes as any).data || []).forEach((u: any) => {
        const lang = u.preferred_language || "en";
        const label = lang === "ar" ? "العربية" : lang === "en" ? "English" : lang === "fr" ? "Français" : lang === "de" ? "Deutsch" : lang === "es" ? "Español" : lang;
        langCount[label] = (langCount[label] || 0) + 1;
      });
      const usersByLanguage = Object.entries(langCount).map(([lang, count]) => ({ lang, count })).sort((a, b) => b.count - a.count);

      // Demographics
      const genderCount: Record<string, number> = {};
      const userCountryCount: Record<string, number> = {};
      const ageGroups: Record<string, number> = { "10-17": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0 };
      let ageSum = 0, ageTotal = 0;
      ((usersRes as any).data || []).forEach((u: any) => {
        const g = u.gender || (isAr ? "غير محدد" : "Not specified");
        const gLabel = g === "male" ? (isAr ? "♂ ذكر" : "♂ Male") : g === "female" ? (isAr ? "♀ أنثى" : "♀ Female") : (isAr ? "❓ غير محدد" : "❓ Not specified");
        genderCount[gLabel] = (genderCount[gLabel] || 0) + 1;
        if (u.country) {
          const cName = countryNames[u.country] || u.country;
          userCountryCount[cName] = (userCountryCount[cName] || 0) + 1;
        }
        if (u.age) {
          ageSum += u.age; ageTotal++;
          if (u.age < 18) ageGroups["10-17"]++;
          else if (u.age < 25) ageGroups["18-24"]++;
          else if (u.age < 35) ageGroups["25-34"]++;
          else if (u.age < 45) ageGroups["35-44"]++;
          else if (u.age < 55) ageGroups["45-54"]++;
          else ageGroups["55+"]++;
        }
      });
      const usersByGender = Object.entries(genderCount).map(([gender, count]) => ({ gender, count })).sort((a, b) => b.count - a.count);
      const usersByCountry = Object.entries(userCountryCount).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 15);
      const usersByAgeGroup = Object.entries(ageGroups).filter(([, c]) => c > 0).map(([group, count]) => ({ group, count }));
      const avgAge = ageTotal > 0 ? Math.round(ageSum / ageTotal) : 0;

      // Guest vs auth generations
      const guestGenerations = usageData.filter((u: any) => !u.user_id && u.guest_id).length;
      const totalGenerations = usageData.filter((u: any) => u.feature === 'planner').length;

      // Visitors by country from page_views (timezone-based)
      const pvCountryCount: Record<string, number> = {};
      pageViews.forEach((v: any) => {
        const c = v.country;
        if (c && c !== "Unknown" && c.trim()) {
          const label = countryNames[c] || c;
          pvCountryCount[label] = (pvCountryCount[label] || 0) + 1;
        }
      });
      const visitorsByCountry = Object.entries(pvCountryCount).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 20);

      const uniqueDeviceSet = new Set(pageViews.map((v: any) => v.guest_id || v.user_id).filter(Boolean));

      setData({
        totalUsers: (usersRes as any).count || 0,
        totalTrips: (tripsRes as any).count || 0,
        totalSearches: ((searchRes as any).count || 0) + ((searchAnalyticsRes as any).count || 0),
        totalStories: (storiesRes as any).count || 0,
        totalLikes: (likesRes as any).count || 0,
        totalComments: (commentsRes as any).count || 0,
        totalMemories: (memoriesRes as any).count || 0,
        totalFavorites: (favoritesRes as any).count || 0,
        topDestinations, topSearchQueries, recentSearches, usersByLanguage, searchByType, usageByFeature,
        activeUsersToday: todayUsers.size,
        activeUsersWeek: weekUsers.size,
        tripsThisMonth, storiesThisMonth, totalPageViews, pageViewsToday, pageViewsWeek,
        uniqueVisitorsToday: todayVisitorSet.size,
        uniqueVisitorsWeek: weekVisitorSet.size,
        topPages, visitorsByLanguage, visitorsByDevice, visitorsByBrowser, visitorsByOS, recentVisitors,
        usersByGender, usersByCountry, usersByAgeGroup, avgAge,
        guestGenerations, totalGenerations, visitorsByCountry, uniqueDevices: uniqueDeviceSet.size,
      });
    } catch (err) {
      console.error("Analytics fetch error:", err);
      toast.error(isAr ? "فشل تحميل الإحصائيات" : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  const featureLabels: Record<string, { icon: any; label: string; labelAr: string; source: string }> = {
    planner: { icon: Plane, label: "Trip Planning", labelAr: "توليد الخطط", source: "AIML → OpenRouter → Lovable AI" },
    chat: { icon: MessageSquare, label: "Chatbot", labelAr: "الشات بوت", source: "AIML → OpenRouter → Lovable AI" },
    voice: { icon: Mic, label: "Voice Call", labelAr: "المكالمات الصوتية", source: "AIML API (STT/TTS)" },
    stt: { icon: Mic, label: "Speech-to-Text", labelAr: "تحويل الصوت لنص", source: "AIML API" },
    tts: { icon: Volume2, label: "Text-to-Speech", labelAr: "تحويل النص لصوت", source: "AIML API" },
    search: { icon: Search, label: "Search", labelAr: "البحث", source: "SerpAPI / Travelpayouts" },
    flight: { icon: Plane, label: "Flight Search", labelAr: "بحث الطيران", source: "Travelpayouts API" },
    hotel: { icon: Globe, label: "Hotel Search", labelAr: "بحث الفنادق", source: "Travelpayouts API" },
  };

  const pageLabels: Record<string, string> = {
    "/": isAr ? "الرئيسية" : "Home", "/planner": isAr ? "المخطط" : "Planner",
    "/flights": isAr ? "الطيران" : "Flights", "/hotels": isAr ? "الفنادق" : "Hotels",
    "/cars": isAr ? "السيارات" : "Cars", "/stories": isAr ? "القصص" : "Stories",
    "/pricing": isAr ? "الأسعار" : "Pricing", "/auth": isAr ? "تسجيل الدخول" : "Auth",
    "/profile": isAr ? "الملف الشخصي" : "Profile", "/admin": isAr ? "لوحة التحكم" : "Admin",
    "/bookings": isAr ? "الحجوزات" : "Bookings", "/destinations": isAr ? "الوجهات" : "Destinations",
    "/events": isAr ? "الفعاليات" : "Events", "/wallet": isAr ? "المحفظة" : "Wallet",
    "/memories": isAr ? "الذكريات" : "Memories", "/my-trips": isAr ? "رحلاتي" : "My Trips",
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  if (!data) return <p className="text-center text-muted-foreground py-8">{isAr ? "لا توجد بيانات" : "No data available"}</p>;

  const exportToExcel = () => {
    if (!data) return;
    let csv = "Category,Metric,Value\n";
    csv += `Traffic,Total Page Views,${data.totalPageViews}\n`;
    csv += `Traffic,Views Today,${data.pageViewsToday}\n`;
    csv += `Traffic,Views This Week,${data.pageViewsWeek}\n`;
    csv += `Traffic,Unique Visitors Today,${data.uniqueVisitorsToday}\n`;
    csv += `Traffic,Unique Visitors Week,${data.uniqueVisitorsWeek}\n`;
    csv += `Users,Total Users,${data.totalUsers}\n`;
    csv += `Users,Active Today,${data.activeUsersToday}\n`;
    csv += `Users,Active This Week,${data.activeUsersWeek}\n`;
    csv += `Content,Total Trips,${data.totalTrips}\n`;
    csv += `Content,Total Stories,${data.totalStories}\n`;
    csv += `Content,Total Likes,${data.totalLikes}\n`;
    csv += `Content,Total Comments,${data.totalComments}\n`;
    csv += `Content,Total Memories,${data.totalMemories}\n`;
    csv += `Content,Total Favorites,${data.totalFavorites}\n`;
    csv += `Content,Total Searches,${data.totalSearches}\n`;
    csv += `Content,Trips This Month,${data.tripsThisMonth}\n`;
    csv += `Content,Stories This Month,${data.storiesThisMonth}\n`;
    csv += `Generations,Total,${data.totalGenerations}\n`;
    csv += `Generations,Guest,${data.guestGenerations}\n`;
    csv += `Generations,Authenticated,${data.totalGenerations - data.guestGenerations}\n`;
    csv += `Generations,Unique Devices,${data.uniqueDevices}\n`;
    csv += "\nGender,Count\n";
    data.usersByGender.forEach(g => { csv += `"${g.gender}",${g.count}\n`; });
    csv += "\nRegistered Users Country,Count\n";
    data.usersByCountry.forEach(c => { csv += `"${c.country}",${c.count}\n`; });
    csv += "\nVisitor Country (Timezone),Count\n";
    data.visitorsByCountry.forEach(c => { csv += `"${c.country}",${c.count}\n`; });
    csv += "\nAge Group,Count\n";
    data.usersByAgeGroup.forEach(a => { csv += `${a.group},${a.count}\n`; });
    csv += "\nBrowser,Count\n";
    data.visitorsByBrowser.forEach(b => { csv += `${b.browser},${b.count}\n`; });
    csv += "\nOS,Count\n";
    data.visitorsByOS.forEach(o => { csv += `${o.os},${o.count}\n`; });
    csv += "\nTop Destination,Count\n";
    data.topDestinations.forEach(d => { csv += `"${d.destination}",${d.count}\n`; });
    csv += "\nTop Search,Count\n";
    data.topSearchQueries.forEach(q => { csv += `"${q.query}",${q.count}\n`; });
    csv += "\nDevice,Count\n";
    data.visitorsByDevice.forEach(d => { csv += `"${d.device}",${d.count}\n`; });
    csv += "\nTop Page,Views\n";
    data.topPages.forEach(p => { csv += `"${p.path}",${p.count}\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `analytics-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(isAr ? "تم تصدير التقرير بنجاح" : "Report exported successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <BarChart3 className="text-primary" size={22} />
          {isAr ? "إحصائيات شاملة للموقع" : "Comprehensive Site Analytics"}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1 text-xs">
            <Download size={14} />
            {isAr ? "تصدير Excel" : "Export CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading} className="gap-1 text-xs">
            <RefreshCw size={14} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Page Views Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye size={16} className="text-primary" />
            {isAr ? "زيارات الموقع" : "Site Traffic"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { value: data.totalPageViews, label: isAr ? "إجمالي المشاهدات" : "Total Views", color: "text-primary" },
              { value: data.pageViewsToday, label: isAr ? "مشاهدات اليوم" : "Views Today", color: "text-green-500" },
              { value: data.uniqueVisitorsToday, label: isAr ? "زوار اليوم" : "Visitors Today", color: "text-blue-500" },
              { value: data.pageViewsWeek, label: isAr ? "مشاهدات الأسبوع" : "Views This Week", color: "text-amber-500" },
              { value: data.uniqueVisitorsWeek, label: isAr ? "زوار الأسبوع" : "Visitors This Week", color: "text-purple-500" },
            ].map((s, i) => (
              <div key={i} className="text-center p-2 rounded-lg bg-background/50">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Users, value: data.totalUsers, label: isAr ? "إجمالي المستخدمين" : "Total Users", color: "text-blue-500" },
          { icon: Plane, value: data.totalTrips, label: isAr ? "الرحلات المحفوظة" : "Saved Trips", color: "text-green-500" },
          { icon: Search, value: data.totalSearches, label: isAr ? "عمليات البحث" : "Total Searches", color: "text-amber-500" },
          { icon: Camera, value: data.totalStories, label: isAr ? "القصص" : "Stories", color: "text-purple-500" },
          { icon: Heart, value: data.totalLikes, label: isAr ? "الإعجابات" : "Likes", color: "text-red-500" },
          { icon: MessageSquare, value: data.totalComments, label: isAr ? "التعليقات" : "Comments", color: "text-teal-500" },
          { icon: Archive, value: data.totalMemories, label: isAr ? "الذكريات" : "Memories", color: "text-indigo-500" },
          { icon: BookOpen, value: data.totalFavorites, label: isAr ? "المفضلة" : "Favorites", color: "text-orange-500" },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-3 text-center">
              <stat.icon className={`mx-auto mb-1 ${stat.color}`} size={18} />
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Users */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Eye, value: data.activeUsersToday, label: isAr ? "نشطون اليوم" : "Active Today", color: "text-primary", border: "border-primary/20 bg-primary/5" },
          { icon: TrendingUp, value: data.activeUsersWeek, label: isAr ? "نشطون هذا الأسبوع" : "Active This Week", color: "text-primary", border: "border-primary/20 bg-primary/5" },
          { icon: Plane, value: data.tripsThisMonth, label: isAr ? "رحلات هذا الشهر" : "Trips This Month", color: "text-green-500", border: "border-green-500/20 bg-green-500/5" },
          { icon: Camera, value: data.storiesThisMonth, label: isAr ? "قصص هذا الشهر" : "Stories This Month", color: "text-purple-500", border: "border-purple-500/20 bg-purple-500/5" },
        ].map((s, i) => (
          <Card key={i} className={s.border}>
            <CardContent className="p-3 text-center">
              <s.icon className={`mx-auto mb-1 ${s.color}`} size={18} />
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Guest vs Auth Generations + Visitors by Country */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain size={16} className="text-amber-500" />
              {isAr ? "إحصائيات التوليد" : "Generation Stats"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: data.totalGenerations, label: isAr ? "إجمالي التوليدات" : "Total Generations", color: "text-primary" },
                { value: data.guestGenerations, label: isAr ? "توليدات بدون تسجيل" : "Guest Generations", color: "text-amber-500" },
                { value: data.totalGenerations - data.guestGenerations, label: isAr ? "توليدات مسجلين" : "Auth Generations", color: "text-green-500" },
                { value: data.uniqueDevices, label: isAr ? "أجهزة فريدة" : "Unique Devices", color: "text-blue-500" },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/30">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={16} className="text-green-500" />
              {isAr ? "الدول الزائرة (من المنطقة الزمنية)" : "Visitor Countries (Timezone)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {data.visitorsByCountry.length > 0 ? data.visitorsByCountry.map((c, i) => {
                const total = data.visitorsByCountry.reduce((s, v) => s + v.count, 0);
                const pct = total ? Math.round((c.count / total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                    <span className="text-sm">{c.country}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{c.count}</Badge>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-xs text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Browser & OS Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={16} className="text-primary" />
              {isAr ? "المتصفحات" : "Browsers"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.visitorsByBrowser.map((b, i) => {
                const total = data.visitorsByBrowser.reduce((s, v) => s + v.count, 0);
                const pct = total ? Math.round((b.count / total) * 100) : 0;
                return (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{b.browser}</span>
                      <span className="text-xs text-muted-foreground">{b.count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor size={16} className="text-primary" />
              {isAr ? "أنظمة التشغيل" : "Operating Systems"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.visitorsByOS.map((o, i) => {
                const total = data.visitorsByOS.reduce((s, v) => s + v.count, 0);
                const pct = total ? Math.round((o.count / total) * 100) : 0;
                return (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{o.os}</span>
                      <span className="text-xs text-muted-foreground">{o.count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              {isAr ? "أكثر الصفحات زيارة" : "Top Pages"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topPages.map((p, i) => {
                const pct = data.topPages[0]?.count ? Math.round((p.count / data.topPages[0].count) * 100) : 0;
                return (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary w-5">{i + 1}</span>
                        <span className="text-sm">{pageLabels[p.path] || p.path}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{p.count}</Badge>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.topPages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone size={16} className="text-primary" />
              {isAr ? "الأجهزة المستخدمة" : "Devices"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.visitorsByDevice.map((d, i) => {
                const total = data.visitorsByDevice.reduce((s, v) => s + v.count, 0);
                const pct = total ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{d.device}</span>
                      <span className="text-xs text-muted-foreground">{d.count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Visitors by Language */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">{isAr ? "الزوار حسب اللغة" : "Visitors by Language"}</p>
              <div className="space-y-1.5">
                {data.visitorsByLanguage.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{v.lang}</span>
                    <Badge variant="outline" className="text-[10px]">{v.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Usage by Feature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            {isAr ? "استهلاك الخدمات ومصادرها" : "Service Usage & Sources"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.usageByFeature.map((item, i) => {
              const info = featureLabels[item.feature] || { icon: Brain, label: item.feature, labelAr: item.feature, source: "N/A" };
              const Icon = info.icon;
              const pct = data.usageByFeature[0]?.count ? Math.round((item.count / data.usageByFeature[0].count) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <Icon size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{isAr ? info.labelAr : info.label}</p>
                      <span className="text-sm font-bold">{item.count}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{isAr ? "المصدر:" : "Source:"} {info.source}</p>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {data.usageByFeature.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات استخدام بعد" : "No usage data yet"}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Destinations & Searches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              {isAr ? "أكثر الوجهات بحثاً" : "Top Destinations"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topDestinations.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary w-5">{i + 1}</span>
                    <span className="text-sm">{d.destination}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{d.count} {isAr ? "مرة" : "times"}</Badge>
                </div>
              ))}
              {data.topDestinations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search size={16} className="text-primary" />
              {isAr ? "أكثر عمليات البحث" : "Top Searches"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topSearchQueries.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary w-5">{i + 1}</span>
                    <span className="text-sm truncate">{q.query}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{q.count}x</Badge>
                </div>
              ))}
              {data.topSearchQueries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users by Language & Search by Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={16} className="text-primary" />
              {isAr ? "المستخدمون المسجلون حسب اللغة" : "Registered Users by Language"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.usersByLanguage.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <span className="text-sm">{c.lang}</span>
                  <Badge variant="secondary" className="text-[10px]">{c.count} {isAr ? "مستخدم" : "users"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" />
              {isAr ? "البحث حسب النوع" : "Search by Type"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.searchByType.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <span className="text-sm capitalize">{s.type}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.count}</Badge>
                </div>
              ))}
              {data.searchByType.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد بيانات" : "No data"}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Generation Mechanism */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            {isAr ? "آلية توليد الخطط" : "Trip Generation Mechanism"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{isAr ? "١. يتم أولاً استخراج تفاصيل الرحلة عبر دالة (extract-trip-details) باستخدام AIML API أولاً، وإذا فشل يتم التبديل تلقائياً إلى OpenRouter ثم Lovable AI." : "1. Trip details are extracted via extract-trip-details function using AIML API first, falling back to OpenRouter then Lovable AI."}</p>
          <p>{isAr ? "٢. بعد التأكيد، يتم توليد الخطة عبر دالة (generate-trip) التي تستدعي نفس ترتيب المزودين وتطلب من الذكاء الاصطناعي إنشاء جدول يومي مفصل بأماكن حقيقية." : "2. After confirmation, the plan is generated via generate-trip function with the same provider priority."}</p>
          <p>{isAr ? "٣. يتم إثراء النتائج عبر SerpAPI (Google Maps) لإضافة الإحداثيات والصور والتقييمات الحقيقية." : "3. Results are enriched via SerpAPI (Google Maps) for real coordinates, images, and ratings."}</p>
          <div className="mt-3 p-2 rounded-lg bg-muted/50">
            <p className="text-xs font-medium text-foreground mb-1">{isAr ? "ترتيب مصادر الاستهلاك:" : "Provider Priority:"}</p>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default" className="text-[10px]">1. AIML API</Badge>
              <Badge variant="secondary" className="text-[10px]">2. OpenRouter</Badge>
              <Badge variant="outline" className="text-[10px]">3. Lovable AI</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Visitors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            {isAr ? "آخر الزوار" : "Recent Visitors"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {data.recentVisitors.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span>{v.device}</span>
                  <span className="truncate font-medium">{pageLabels[v.path] || v.path}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {v.country && <Badge variant="secondary" className="text-[9px]">{countryNames[v.country] || v.country}</Badge>}
                  {v.browser && <Badge variant="outline" className="text-[9px]">{v.browser}</Badge>}
                  <Badge variant="outline" className="text-[9px]">{v.language}</Badge>
                  <span className="text-muted-foreground">{v.time}</span>
                </div>
              </div>
            ))}
            {data.recentVisitors.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد زيارات بعد" : "No visits yet"}</p>}
          </div>
        </CardContent>
      </Card>

      {/* User Demographics */}
      <Card className="border-indigo-500/30 bg-indigo-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={16} className="text-indigo-500" />
            {isAr ? "التركيبة السكانية للمستخدمين المسجلين" : "Registered User Demographics"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">{isAr ? "الجنس" : "Gender"}</h4>
              <div className="space-y-1.5">
                {data.usersByGender.map((g, i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded bg-background/50">
                    <span className="text-sm">{g.gender}</span>
                    <Badge variant="secondary" className="text-[10px]">{g.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">
                {isAr ? "الفئات العمرية" : "Age Groups"}
                {data.avgAge > 0 && <span className="text-primary ms-2">({isAr ? "المعدل" : "Avg"}: {data.avgAge})</span>}
              </h4>
              <div className="space-y-1.5">
                {data.usersByAgeGroup.length > 0 ? data.usersByAgeGroup.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded bg-background/50">
                    <span className="text-sm">{a.group}</span>
                    <Badge variant="secondary" className="text-[10px]">{a.count}</Badge>
                  </div>
                )) : <p className="text-xs text-muted-foreground">{isAr ? "لم يحدد المستخدمون أعمارهم بعد" : "Users haven't set their age yet"}</p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">{isAr ? "دول المستخدمين المسجلين" : "Registered Users' Countries"}</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {data.usersByCountry.length > 0 ? data.usersByCountry.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded bg-background/50">
                    <span className="text-sm">{c.country}</span>
                    <Badge variant="secondary" className="text-[10px]">{c.count}</Badge>
                  </div>
                )) : <p className="text-xs text-muted-foreground">{isAr ? "لم يحدد المستخدمون دولهم بعد" : "Users haven't set their country yet"}</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Searches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Search size={16} className="text-primary" />
            {isAr ? "آخر عمليات البحث" : "Recent Searches"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {data.recentSearches.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge variant="outline" className="text-[9px] shrink-0">{s.type}</Badge>
                  <span className="truncate">{s.destination || s.query || "—"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">{s.user}</span>
                  <span className="text-muted-foreground">{s.date}</span>
                </div>
              </div>
            ))}
            {data.recentSearches.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد عمليات بحث" : "No searches yet"}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalytics;
