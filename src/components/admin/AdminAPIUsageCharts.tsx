import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, BarChart3, Globe, TrendingUp, Zap, DollarSign, Activity, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const countryNames: Record<string, string> = {
  SA: "🇸🇦 السعودية", AE: "🇦🇪 الإمارات", EG: "🇪🇬 مصر", JO: "🇯🇴 الأردن",
  KW: "🇰🇼 الكويت", QA: "🇶🇦 قطر", BH: "🇧🇭 البحرين", OM: "🇴🇲 عمان",
  US: "🇺🇸 أمريكا", GB: "🇬🇧 بريطانيا", TR: "🇹🇷 تركيا", IN: "🇮🇳 الهند",
  FR: "🇫🇷 فرنسا", DE: "🇩🇪 ألمانيا", PK: "🇵🇰 باكستان", IQ: "🇮🇶 العراق",
  MA: "🇲🇦 المغرب", DZ: "🇩🇿 الجزائر", TN: "🇹🇳 تونس", LB: "🇱🇧 لبنان",
};

interface DailyUsage {
  date: string;
  planner: number;
  chat: number;
  voice: number;
  search: number;
  flight: number;
  hotel: number;
  total: number;
}

const AdminAPIUsageCharts = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [sourceUsage, setSourceUsage] = useState<{ name: string; count: number }[]>([]);
  const [countryData, setCountryData] = useState<{ country: string; count: number }[]>([]);
  const [revenueData, setRevenueData] = useState<{ date: string; revenue: number; subscriptions: number }[]>([]);
  const [modelUsage, setModelUsage] = useState<{ model: string; count: number }[]>([]);
  const [totals, setTotals] = useState({ totalCalls: 0, todayCalls: 0, estimatedCost: 0, activeSubscriptions: 0 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [usageRes, pageViewsRes, subsRes, plansRes] = await Promise.all([
        supabase.from("usage_tracking").select("*").gte("used_at", since).order("used_at", { ascending: true }).limit(1000),
        supabase.from("page_views").select("country, created_at").gte("created_at", since).limit(1000),
        supabase.from("user_subscriptions").select("*, subscription_plans(name, price, currency)").gte("created_at", since),
        supabase.from("subscription_plans").select("*").eq("is_active", true),
      ]);

      const usage = usageRes.data || [];
      const pageViews = pageViewsRes.data || [];
      const subs = subsRes.data || [];

      // Daily usage breakdown
      const dailyMap: Record<string, DailyUsage> = {};
      usage.forEach((u) => {
        const date = u.used_at.split("T")[0];
        if (!dailyMap[date]) dailyMap[date] = { date, planner: 0, chat: 0, voice: 0, search: 0, flight: 0, hotel: 0, total: 0 };
        const feature = u.feature || "planner";
        if (feature in dailyMap[date]) (dailyMap[date] as any)[feature] += u.quantity;
        dailyMap[date].total += u.quantity;
      });
      // Fill missing dates
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split("T")[0];
        if (!dailyMap[d]) dailyMap[d] = { date: d, planner: 0, chat: 0, voice: 0, search: 0, flight: 0, hotel: 0, total: 0 };
      }
      const dailySorted = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      setDailyUsage(dailySorted);

      // Source usage (simulate from features)
      const srcMap: Record<string, number> = {
        "SerpAPI": 0, "Serper.dev": 0, "Travelpayouts": 0, "Lovable AI": 0, "AIML API": 0, "RapidAPI": 0,
      };
      usage.forEach((u) => {
        const f = u.feature;
        if (f === "planner" || f === "chat") { srcMap["Lovable AI"] += u.quantity; srcMap["SerpAPI"] += Math.ceil(u.quantity * 0.3); srcMap["Serper.dev"] += Math.ceil(u.quantity * 0.2); }
        if (f === "voice" || f === "stt" || f === "tts") srcMap["AIML API"] += u.quantity;
        if (f === "flight" || f === "hotel") srcMap["Travelpayouts"] += u.quantity;
        if (f === "search") { srcMap["SerpAPI"] += u.quantity; srcMap["Serper.dev"] += Math.ceil(u.quantity * 0.5); }
      });
      setSourceUsage(Object.entries(srcMap).filter(([, c]) => c > 0).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));

      // Model usage (simulate)
      const modelMap: Record<string, number> = {};
      usage.forEach((u) => {
        if (u.feature === "planner" || u.feature === "chat") {
          const model = "Gemini 2.5 Flash";
          modelMap[model] = (modelMap[model] || 0) + u.quantity;
        }
        if (u.feature === "voice" || u.feature === "stt") modelMap["GPT-4o Transcribe"] = (modelMap["GPT-4o Transcribe"] || 0) + u.quantity;
        if (u.feature === "tts") modelMap["ElevenLabs TTS"] = (modelMap["ElevenLabs TTS"] || 0) + u.quantity;
      });
      setModelUsage(Object.entries(modelMap).filter(([, c]) => c > 0).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count));

      // Country data from page views
      const cMap: Record<string, number> = {};
      pageViews.forEach((v) => {
        if (v.country && v.country !== "Unknown") {
          const label = countryNames[v.country] || v.country;
          cMap[label] = (cMap[label] || 0) + 1;
        }
      });
      setCountryData(Object.entries(cMap).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 12));

      // Revenue data from subscriptions
      const revMap: Record<string, { revenue: number; subscriptions: number }> = {};
      subs.forEach((s: any) => {
        const date = s.created_at.split("T")[0];
        if (!revMap[date]) revMap[date] = { revenue: 0, subscriptions: 0 };
        revMap[date].subscriptions++;
        const price = (s.subscription_plans as any)?.price || 0;
        revMap[date].revenue += Number(price);
      });
      const revSorted = Object.entries(revMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
      setRevenueData(revSorted);

      // Totals
      const todayCalls = usage.filter((u) => u.used_at >= todayStart).reduce((s, u) => s + u.quantity, 0);
      const totalCalls = usage.reduce((s, u) => s + u.quantity, 0);
      const activeSubs = subs.filter((s: any) => s.status === "active").length;
      // Rough cost estimate: $0.002 per AI call, $0.001 per search
      const estimatedCost = usage.reduce((s, u) => {
        if (u.feature === "planner" || u.feature === "chat") return s + u.quantity * 0.003;
        if (u.feature === "voice" || u.feature === "stt" || u.feature === "tts") return s + u.quantity * 0.005;
        return s + u.quantity * 0.001;
      }, 0);
      setTotals({ totalCalls, todayCalls, estimatedCost: Math.round(estimatedCost * 100) / 100, activeSubscriptions: activeSubs });
    } catch (e) {
      console.error("API usage fetch error:", e);
      toast.error("فشل تحميل إحصائيات API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      {/* Period selector & header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2"><BarChart3 size={18} className="text-primary" /> إحصائيات استخدام API</h3>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className="text-xs" onClick={() => setPeriod(p)}>
              {p === "7d" ? "أسبوع" : p === "30d" ? "شهر" : "3 أشهر"}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={fetchData}><RefreshCw size={12} /> تحديث</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="mx-auto mb-1 text-amber-500" size={20} />
            <p className="text-2xl font-bold">{totals.totalCalls.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">إجمالي الاستدعاءات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="mx-auto mb-1 text-green-500" size={20} />
            <p className="text-2xl font-bold">{totals.todayCalls.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">استدعاءات اليوم</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto mb-1 text-blue-500" size={20} />
            <p className="text-2xl font-bold">${totals.estimatedCost}</p>
            <p className="text-[10px] text-muted-foreground">التكلفة التقديرية</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="mx-auto mb-1 text-purple-500" size={20} />
            <p className="text-2xl font-bold">{totals.activeSubscriptions}</p>
            <p className="text-[10px] text-muted-foreground">اشتراكات نشطة</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Usage Area Chart */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-bold">استخدام API اليومي</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString("ar-SA")} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="planner" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} name="الخطط" />
              <Area type="monotone" dataKey="chat" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="الشات" />
              <Area type="monotone" dataKey="voice" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="الصوت" />
              <Area type="monotone" dataKey="search" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="البحث" />
              <Area type="monotone" dataKey="flight" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="الطيران" />
              <Area type="monotone" dataKey="hotel" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.6} name="الفنادق" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Usage Pie */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Database size={14} /> استهلاك كل مصدر بيانات</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {sourceUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={sourceUsage} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {sourceUsage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات</p>}
          </CardContent>
        </Card>

        {/* Model Usage Bar */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Zap size={14} /> استهلاك كل نموذج AI</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {modelUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={modelUsage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="model" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="استدعاءات" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات</p>}
          </CardContent>
        </Card>

        {/* Countries Bar */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Globe size={14} /> الزوار حسب الدولة</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {countryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={countryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="country" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="زيارات" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات</p>}
          </CardContent>
        </Card>

        {/* Revenue Line */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><DollarSign size={14} /> الدخل والاشتراكات</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString("ar-SA")} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} name="الدخل ($)" />
                  <Line yAxisId="right" type="monotone" dataKey="subscriptions" stroke="#10b981" strokeWidth={2} dot={false} name="اشتراكات" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground text-sm py-8">لا توجد اشتراكات بعد</p>}
          </CardContent>
        </Card>
      </div>

      {/* Source details table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-bold">تفاصيل استهلاك المصادر</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-2 px-2 font-bold">المصدر</th>
                  <th className="text-right py-2 px-2 font-bold">الاستدعاءات</th>
                  <th className="text-right py-2 px-2 font-bold">النسبة</th>
                  <th className="text-right py-2 px-2 font-bold">التكلفة التقديرية</th>
                </tr>
              </thead>
              <tbody>
                {sourceUsage.map((s, i) => {
                  const totalAll = sourceUsage.reduce((sum, x) => sum + x.count, 0);
                  const pct = totalAll > 0 ? ((s.count / totalAll) * 100).toFixed(1) : "0";
                  const costPerCall = s.name.includes("AI") ? 0.003 : s.name.includes("AIML") ? 0.005 : 0.001;
                  return (
                    <tr key={s.name} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {s.name}
                      </td>
                      <td className="py-2 px-2">{s.count.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-2">${(s.count * costPerCall).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAPIUsageCharts;
