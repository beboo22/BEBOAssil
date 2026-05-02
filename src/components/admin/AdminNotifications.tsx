import { useState, useEffect } from "react";
import { Bell, Send, Users, User, Loader2, Search, Clock, Calendar, Trash2, Cake, Globe, Heart, Sparkles, Gift, Megaphone, AlertTriangle, RefreshCw, Trophy, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UserOption {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  gender: string | null;
  country: string | null;
  birthdate: string | null;
}

interface ScheduledNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  target: string;
  userId?: string;
  userName?: string;
  scheduledAt: string;
  sent: boolean;
}

const TEMPLATES = [
  { id: "special_offer", icon: "🎁", label: "عرض خاص", title: "🎁 عرض خاص لك!", message: "لدينا عرض حصري لك! استمتع بخصم خاص على رحلتك القادمة." },
  { id: "new_update", icon: "🔄", label: "تحديث جديد", title: "🔄 تحديث جديد!", message: "أضفنا ميزات جديدة لتجربة سفر أفضل! اكتشفها الآن." },
  { id: "discount_code", icon: "🏷️", label: "كود خصم", title: "🏷️ كود خصم حصري!", message: "استخدم كود الخصم للحصول على تخفيض على رحلتك القادمة." },
  { id: "birthday", icon: "🎂", label: "عيد ميلاد", title: "🎂 كل عام وأنت بخير!", message: "بمناسبة عيد ميلادك، نقدم لك هدية خاصة! استمتع بخصم حصري." },
  { id: "national_day", icon: "🎉", label: "يوم وطني", title: "🎉 تهانينا بالعيد الوطني!", message: "بمناسبة اليوم الوطني، نقدم لكم عروض مميزة على جميع الرحلات!" },
  { id: "womens_day", icon: "💐", label: "يوم المرأة", title: "💐 يوم المرأة العالمي", message: "بمناسبة يوم المرأة العالمي، نقدم عروض خاصة لنساء مجتمعنا!" },
  { id: "points_bonus", icon: "⭐", label: "نقاط إضافية", title: "⭐ نقاط مضاعفة!", message: "احصل على نقاط مضاعفة على جميع أنشطتك اليوم! لا تفوت الفرصة." },
  { id: "welcome_back", icon: "👋", label: "مرحباً بعودتك", title: "👋 اشتقنا لك!", message: "لاحظنا أنك لم تزرنا منذ فترة. عد الآن واحصل على عرض خاص!" },
  { id: "new_destination", icon: "✈️", label: "وجهة جديدة", title: "✈️ وجهة جديدة!", message: "أضفنا وجهات سفر جديدة ومثيرة! اكتشفها الآن وخطط لرحلتك القادمة." },
];

type TargetMode = "all" | "single" | "birthday_today" | "country" | "gender";

const AdminNotifications = () => {
  const [target, setTarget] = useState<TargetMode>("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [targetGender, setTargetGender] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [sentHistory, setSentHistory] = useState<any[]>([]);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledList, setScheduledList] = useState<ScheduledNotification[]>([]);
  const [birthdayUsers, setBirthdayUsers] = useState<UserOption[]>([]);
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchHistory();
    fetchScheduled();
    const interval = setInterval(checkAndSendScheduled, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (users.length > 0) {
      // Find birthday users
      const today = new Date();
      const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const bday = users.filter(u => {
        if (!u.birthdate) return false;
        const d = new Date(u.birthdate);
        const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return md === todayMD;
      });
      setBirthdayUsers(bday);

      // Unique countries
      const c = [...new Set(users.map(u => u.country).filter(Boolean))] as string[];
      setCountries(c.sort());
    }
  }, [users]);

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, email, username, gender, country, birthdate").order("created_at", { ascending: false });
    if (data) setUsers(data as UserOption[]);
  };

  const fetchHistory = async () => {
    const { data } = await supabase.from("notifications").select("*").eq("type", "admin_broadcast").order("created_at", { ascending: false }).limit(30);
    if (data) setSentHistory(data);
  };

  const fetchScheduled = async () => {
    const { data } = await supabase.from("site_settings").select("scheduled_notifications").eq("id", "default").single();
    if (data?.scheduled_notifications) {
      setScheduledList((data.scheduled_notifications as any[]) || []);
    }
  };

  const checkAndSendScheduled = async () => {
    const { data } = await supabase.from("site_settings").select("scheduled_notifications").eq("id", "default").single();
    if (!data?.scheduled_notifications) return;
    const list = (data.scheduled_notifications as any[]) || [];
    const now = new Date();
    let updated = false;
    for (const item of list) {
      if (item.sent || new Date(item.scheduledAt) > now) continue;
      try {
        await sendToTarget(item.target, item.title, item.message, item.type, item.userId);
        item.sent = true;
        updated = true;
      } catch (e) { console.error("Scheduled send error:", e); }
    }
    if (updated) {
      await supabase.from("site_settings").update({ scheduled_notifications: list as any }).eq("id", "default");
      fetchScheduled();
      fetchHistory();
    }
  };

  const getTargetUsers = (): UserOption[] => {
    switch (target) {
      case "single": return users.filter(u => u.id === selectedUserId);
      case "birthday_today": return birthdayUsers;
      case "country": return users.filter(u => u.country === targetCountry);
      case "gender": return users.filter(u => u.gender === targetGender);
      default: return users;
    }
  };

  const sendToTarget = async (tgt: string, t: string, m: string, tp: string, userId?: string) => {
    let targetUsers: { id: string }[] = [];
    if (tgt === "single" && userId) {
      targetUsers = [{ id: userId }];
    } else if (tgt === "birthday_today") {
      const today = new Date();
      const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      targetUsers = users.filter(u => {
        if (!u.birthdate) return false;
        const d = new Date(u.birthdate);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayMD;
      });
    } else if (tgt === "country") {
      targetUsers = users.filter(u => u.country === targetCountry);
    } else if (tgt === "gender") {
      targetUsers = users.filter(u => u.gender === targetGender);
    } else {
      targetUsers = users;
    }

    for (let i = 0; i < targetUsers.length; i += 50) {
      const batch = targetUsers.slice(i, i + 50).map(u => ({
        user_id: u.id, title: t, message: m,
        type: "admin_broadcast",
        metadata: { notification_type: tp, target: tgt, broadcast: targetUsers.length > 1 },
      }));
      await supabase.from("notifications").insert(batch);
    }
  };

  const sendNotification = async () => {
    if (!title.trim() || !message.trim()) { toast.error("يرجى ملء العنوان والرسالة"); return; }
    if (target === "single" && !selectedUserId) { toast.error("يرجى اختيار مستخدم"); return; }
    if (target === "country" && !targetCountry) { toast.error("يرجى اختيار الدولة"); return; }
    if (target === "gender" && !targetGender) { toast.error("يرجى اختيار الجنس"); return; }

    const targetUsersList = getTargetUsers();
    if (targetUsersList.length === 0) { toast.error("لا يوجد مستخدمين مطابقين"); return; }

    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) { toast.error("يرجى تحديد التاريخ والوقت"); return; }
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      const selectedUser = users.find(u => u.id === selectedUserId);
      const newItem: ScheduledNotification = {
        id: crypto.randomUUID(), title, message, type, target,
        userId: target === "single" ? selectedUserId : undefined,
        userName: target === "single" ? (selectedUser?.full_name || selectedUser?.email || "") : undefined,
        scheduledAt, sent: false,
      };
      const updatedList = [...scheduledList, newItem];
      await supabase.from("site_settings").update({ scheduled_notifications: updatedList as any }).eq("id", "default");
      setScheduledList(updatedList);
      setTitle(""); setMessage(""); setScheduledDate(""); setScheduledTime("");
      toast.success("تمت جدولة الإشعار بنجاح");
      return;
    }

    setSending(true);
    try {
      await sendToTarget(target, title, message, type, selectedUserId);
      toast.success(`تم إرسال الإشعار لـ ${targetUsersList.length} مستخدم`);
      setTitle(""); setMessage("");
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error("فشل إرسال الإشعار");
    } finally {
      setSending(false);
    }
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setTitle(tpl.title);
    setMessage(tpl.message);
  };

  const deleteScheduled = async (id: string) => {
    const updatedList = scheduledList.filter(s => s.id !== id);
    await supabase.from("site_settings").update({ scheduled_notifications: updatedList as any }).eq("id", "default");
    setScheduledList(updatedList);
    toast.success("تم حذف الإشعار المجدول");
  };

  const filteredUsers = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.username || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  const targetCount = getTargetUsers().length;

  return (
    <div className="space-y-6">
      {/* Templates */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles size={14} /> قوالب جاهزة</h3>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map(tpl => (
            <Button key={tpl.id} variant="outline" size="sm" className="text-xs gap-1" onClick={() => applyTemplate(tpl)}>
              {tpl.icon} {tpl.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Birthday Alert */}
      {birthdayUsers.length > 0 && (
        <div className="bg-accent/20 border border-accent/40 rounded-xl p-4 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Cake size={16} className="text-accent-foreground" /> 🎂 أعياد ميلاد اليوم ({birthdayUsers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {birthdayUsers.map(u => (
              <Badge key={u.id} variant="secondary" className="text-xs">
                {u.full_name || u.username || u.email}
              </Badge>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => {
            setTarget("birthday_today");
            applyTemplate(TEMPLATES.find(t => t.id === "birthday")!);
          }}>
            <Gift size={12} /> إرسال تهنئة لهم
          </Button>
        </div>
      )}

      {/* Send Form */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Bell size={16} /> إرسال إشعار</h3>

        {/* Target selection */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">الفئة المستهدفة</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all" as TargetMode, icon: <Users size={12} />, label: "الجميع" },
              { key: "single" as TargetMode, icon: <User size={12} />, label: "مستخدم" },
              { key: "birthday_today" as TargetMode, icon: <Cake size={12} />, label: "أعياد اليوم" },
              { key: "country" as TargetMode, icon: <Globe size={12} />, label: "دولة" },
              { key: "gender" as TargetMode, icon: <Heart size={12} />, label: "جنس" },
            ].map(t => (
              <Button key={t.key} variant={target === t.key ? "default" : "outline"} size="sm" className="gap-1 text-xs" onClick={() => setTarget(t.key)}>
                {t.icon} {t.label}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">👥 {targetCount} مستخدم مستهدف</p>
        </div>

        {target === "single" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="ابحث عن مستخدم..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {filteredUsers.slice(0, 20).map(u => (
                <button key={u.id} onClick={() => setSelectedUserId(u.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${selectedUserId === u.id ? "bg-primary/10 font-medium" : ""}`}>
                  <span>{u.full_name || u.username || "بدون اسم"}</span>
                  <span className="text-muted-foreground text-xs mr-2">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {target === "country" && (
          <Select value={targetCountry} onValueChange={setTargetCountry}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الدولة..." /></SelectTrigger>
            <SelectContent className="max-h-60">
              {countries.map(c => (
                <SelectItem key={c} value={c}>{c} ({users.filter(u => u.country === c).length})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {target === "gender" && (
          <div className="flex gap-2">
            <Button variant={targetGender === "male" ? "default" : "outline"} size="sm" onClick={() => setTargetGender("male")} className="flex-1 gap-1">
              ♂️ ذكور ({users.filter(u => u.gender === "male").length})
            </Button>
            <Button variant={targetGender === "female" ? "default" : "outline"} size="sm" onClick={() => setTargetGender("female")} className="flex-1 gap-1">
              ♀️ إناث ({users.filter(u => u.gender === "female").length})
            </Button>
          </div>
        )}

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="نوع الإشعار" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">📢 عام</SelectItem>
            <SelectItem value="promotion">🎁 عرض ترويجي</SelectItem>
            <SelectItem value="update">🔄 تحديث</SelectItem>
            <SelectItem value="warning">⚠️ تنبيه</SelectItem>
            <SelectItem value="reward">🏆 مكافأة</SelectItem>
            <SelectItem value="discount">🏷️ كود خصم</SelectItem>
            <SelectItem value="birthday">🎂 عيد ميلاد</SelectItem>
            <SelectItem value="national">🎉 يوم وطني</SelectItem>
          </SelectContent>
        </Select>

        <Input placeholder="عنوان الإشعار" value={title} onChange={e => setTitle(e.target.value)} />
        <Textarea placeholder="نص الرسالة..." value={message} onChange={e => setMessage(e.target.value)} rows={3} />

        {/* Schedule toggle */}
        <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
          <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
          <Label className="flex items-center gap-1.5 text-sm cursor-pointer"><Clock size={14} /> جدولة لوقت لاحق</Label>
        </div>

        {isScheduled && (
          <div className="flex gap-2">
            <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="flex-1" />
            <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="flex-1" />
          </div>
        )}

        <Button onClick={sendNotification} disabled={sending} className="w-full gap-2">
          {sending ? <Loader2 size={16} className="animate-spin" /> : isScheduled ? <Calendar size={16} /> : <Send size={16} />}
          {isScheduled ? "جدولة الإشعار" : `إرسال لـ ${targetCount} مستخدم`}
        </Button>
      </div>

      {/* Scheduled */}
      {scheduledList.filter(s => !s.sent).length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Clock size={14} /> مجدولة</h3>
          {scheduledList.filter(s => !s.sent).map(s => (
            <div key={s.id} className="bg-card border border-border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{s.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">⏰ {new Date(s.scheduledAt).toLocaleString("ar")}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteScheduled(s.id)}>
                    <Trash2 size={12} className="text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{s.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">آخر الإشعارات المرسلة</h3>
        {sentHistory.map(n => (
          <div key={n.id} className="bg-card border border-border rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{n.title}</p>
              <Badge variant="outline" className="text-[10px]">
                {(n.metadata as any)?.broadcast ? "📢 بث" : "👤 فردي"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{n.message}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("ar")}</p>
          </div>
        ))}
        {sentHistory.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">لا توجد إشعارات مرسلة بعد</p>}
      </div>
    </div>
  );
};

export default AdminNotifications;
