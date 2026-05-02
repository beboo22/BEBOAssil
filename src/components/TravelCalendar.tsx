import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plane,
  BookOpen,
  Camera,
  Bell,
  BellRing,
  MapPin,
  Clock,
  Sparkles,
  Trash2,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatLatnDateTime, formatLatnNumber } from "@/utils/numberFormat";
import {
  addReminder,
  checkDueReminders,
  loadReminders,
  removeReminder,
  requestNotificationPermission,
  type TripReminder,
} from "@/utils/tripReminders";
import { toast } from "sonner";

export type CalendarItemKind = 'trip-past' | 'trip-upcoming' | 'trip-active' | 'memory' | 'story';

export interface CalendarItem {
  id: string;
  refId: string;
  kind: CalendarItemKind;
  title: string;
  destination?: string;
  startDate: string;       // ISO
  durationDays?: number;
  thumbnail?: string;      // image url
  previewMedia?: string[];
  previewDescription?: string;
  onOpen?: () => void;
}

interface Props {
  items: CalendarItem[];
}

const KIND_STYLES: Record<CalendarItemKind, { dot: string; chip: string; ring: string; label: { ar: string; en: string } }> = {
  'trip-past':     { dot: 'bg-muted-foreground',   chip: 'bg-muted text-muted-foreground border-muted-foreground/30', ring: 'ring-muted-foreground/30',  label: { ar: 'سابقة', en: 'Past' } },
  'trip-active':   { dot: 'bg-emerald-500',        chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30', ring: 'ring-emerald-500/40', label: { ar: 'جارية الآن', en: 'Active' } },
  'trip-upcoming': { dot: 'bg-primary',            chip: 'bg-primary/15 text-primary border-primary/30', ring: 'ring-primary/40', label: { ar: 'قادمة', en: 'Upcoming' } },
  'memory':        { dot: 'bg-amber-500',          chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30', ring: 'ring-amber-500/40', label: { ar: 'ذكرى', en: 'Memory' } },
  'story':         { dot: 'bg-pink-500',           chip: 'bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30', ring: 'ring-pink-500/40', label: { ar: 'قصة', en: 'Story' } },
};

const KIND_ICON: Record<CalendarItemKind, JSX.Element> = {
  'trip-past':     <Plane size={11} />,
  'trip-active':   <Plane size={11} />,
  'trip-upcoming': <Plane size={11} />,
  'memory':        <Camera size={11} />,
  'story':         <BookOpen size={11} />,
};

const ymd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const TravelCalendar = ({ items }: Props) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const today = startOfDay(new Date());

  const [viewMonth, setViewMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [view, setView] = useState<'month' | 'day'>('month');
  const [reminders, setReminders] = useState<TripReminder[]>(loadReminders());
  const [reminderTarget, setReminderTarget] = useState<CalendarItem | null>(null);
  const [leadHours, setLeadHours] = useState<string>('24');
  const [customLeadHours, setCustomLeadHours] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<CalendarItemKind[]>(['trip-upcoming', 'trip-active', 'trip-past', 'memory', 'story']);
  const [previewItem, setPreviewItem] = useState<CalendarItem | null>(null);

  // Periodic reminder check
  useEffect(() => {
    const tick = () => {
      const fired = checkDueReminders();
      if (fired.length > 0) {
        setReminders(loadReminders());
        fired.forEach(r => toast.info(r.title, { description: r.destination, duration: 6000 }));
      }
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  // Build a map: ymd -> items active that day
  const filteredItems = useMemo(() => items.filter((item) => activeFilters.includes(item.kind)), [items, activeFilters]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    filteredItems.forEach(item => {
      const start = new Date(item.startDate);
      if (isNaN(start.getTime())) return;
      const days = Math.max(1, item.durationDays || 1);
      for (let d = 0; d < days; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + d);
        const key = ymd(day);
        const arr = map.get(key) || [];
        arr.push(item);
        map.set(key, arr);
      }
    });
    return map;
  }, [filteredItems]);

  // Build calendar grid for current viewMonth
  const monthGrid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = first.getDay(); // 0 (Sun) - 6
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [viewMonth]);

  const itemsOnSelected = useMemo(() => {
    return itemsByDate.get(ymd(selectedDate)) || [];
  }, [selectedDate, itemsByDate]);

  const monthlyStats = useMemo(() => {
    const monthKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
    let trips = 0, memories = 0, stories = 0;
    const seen = new Set<string>();
    itemsByDate.forEach((arr, key) => {
      if (!key.startsWith(monthKey)) return;
      arr.forEach(it => {
        const tag = `${it.kind}:${it.refId}`;
        if (seen.has(tag)) return;
        seen.add(tag);
        if (it.kind.startsWith('trip')) trips++;
        else if (it.kind === 'memory') memories++;
        else if (it.kind === 'story') stories++;
      });
    });
    return { trips, memories, stories };
  }, [viewMonth, itemsByDate]);

  const goPrev = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const goNext = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(startOfDay(now));
  };

  const weekdayLabels = useMemo(() => {
    const ref = new Date(2024, 8, 1); // a Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ref);
      d.setDate(ref.getDate() + i);
      return d.toLocaleDateString(i18n.language, { weekday: 'short' });
    });
  }, [i18n.language]);

  const monthLabel = useMemo(() => {
    return viewMonth.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  }, [viewMonth, i18n.language]);

  const openReminderDialog = async (item: CalendarItem) => {
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      toast.message(isAr ? 'سيتم حفظ التذكير، فعّل إشعارات المتصفح لتلقّيه' : 'Reminder saved. Enable browser notifications to receive it.');
    }
    setReminderTarget(item);
    setLeadHours('24');
    setCustomLeadHours('');
  };

  const confirmReminder = () => {
    if (!reminderTarget) return;
    const effectiveLeadHours = leadHours === 'custom' ? Number(customLeadHours) : Number(leadHours);
    if (!Number.isFinite(effectiveLeadHours) || effectiveLeadHours <= 0) {
      toast.error(isAr ? 'أدخل عدداً صحيحاً للساعات' : 'Enter a valid custom hour value');
      return;
    }
    const eventDate = new Date(reminderTarget.startDate);
    const fireAt = new Date(eventDate.getTime() - effectiveLeadHours * 3600 * 1000);
    addReminder({
      refId: reminderTarget.refId,
      refType: reminderTarget.kind.startsWith('trip') ? 'trip' : (reminderTarget.kind === 'memory' ? 'memory' : 'story'),
      title: isAr ? `تذكير: ${reminderTarget.title}` : `Reminder: ${reminderTarget.title}`,
      destination: reminderTarget.destination,
      fireAt: fireAt.toISOString(),
      eventDate: eventDate.toISOString(),
      leadHours: effectiveLeadHours,
    });
    setReminders(loadReminders());
    toast.success(isAr ? 'تم ضبط التذكير' : 'Reminder set');
    setReminderTarget(null);
  };

  const deleteReminder = (id: string) => {
    removeReminder(id);
    setReminders(loadReminders());
    toast.success(isAr ? 'تم حذف التذكير' : 'Reminder removed');
  };

  const isSameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

  const toggleFilter = (kind: CalendarItemKind) => {
    setActiveFilters((prev) => prev.includes(kind) ? prev.filter((item) => item !== kind) : [...prev, kind]);
  };

  const classifyTrip = (item: CalendarItem, day: Date): CalendarItem => {
    if (!item.kind.startsWith('trip')) return item;
    const start = startOfDay(new Date(item.startDate));
    const end = new Date(start);
    end.setDate(start.getDate() + Math.max(1, item.durationDays || 1) - 1);
    const dayN = startOfDay(day).getTime();
    let kind: CalendarItemKind = item.kind;
    if (dayN < start.getTime()) kind = 'trip-upcoming';
    else if (dayN > end.getTime()) kind = 'trip-past';
    else kind = 'trip-active';
    return { ...item, kind };
  };

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="p-4 sm:p-5 bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-9 w-9 rounded-full hover:bg-primary/10">
              {isAr ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </Button>
            <div className="text-center min-w-[140px]">
              <h2 className="text-base sm:text-lg font-extrabold gradient-text capitalize">{monthLabel}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-2">
                <Sparkles size={10} className="text-primary" />
                {isAr ? `${formatLatnNumber(monthlyStats.trips, i18n.language)} رحلة • ${formatLatnNumber(monthlyStats.memories, i18n.language)} ذكرى • ${formatLatnNumber(monthlyStats.stories, i18n.language)} قصة` : `${monthlyStats.trips} trips • ${monthlyStats.memories} memories • ${monthlyStats.stories} stories`}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-9 w-9 rounded-full hover:bg-primary/10">
              {isAr ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday} className="text-xs h-8">
              {isAr ? 'اليوم' : 'Today'}
            </Button>
            <Tabs value={view} onValueChange={(v) => setView(v as 'month' | 'day')}>
              <TabsList className="h-8">
                <TabsTrigger value="month" className="text-[11px] h-6 px-2">{isAr ? 'شهر' : 'Month'}</TabsTrigger>
                <TabsTrigger value="day" className="text-[11px] h-6 px-2">{isAr ? 'يوم' : 'Day'}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {(['trip-upcoming', 'trip-active', 'trip-past', 'memory', 'story'] as CalendarItemKind[]).map(k => (
            <Button
              key={k}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleFilter(k)}
              className={cn(
                'h-8 gap-1.5 text-[10px] px-2.5 border-border/60',
                activeFilters.includes(k) ? KIND_STYLES[k].chip : 'bg-background text-muted-foreground'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', KIND_STYLES[k].dot)} />
              <span>{isAr ? KIND_STYLES[k].label.ar : KIND_STYLES[k].label.en}</span>
            </Button>
          ))}
        </div>
      </Card>

      {/* Month grid */}
      {view === 'month' && (
        <Card className="p-2 sm:p-4 overflow-hidden">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdayLabels.map(w => (
              <div key={w} className="text-center text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((cell, idx) => {
              if (!cell.date) return <div key={idx} className="aspect-square" />;
              const cellItems = (itemsByDate.get(ymd(cell.date)) || []).map(it => classifyTrip(it, cell.date!));
              const isToday = isSameDay(cell.date, today);
              const isSelected = isSameDay(cell.date, selectedDate);
              const thumb = cellItems.find(it => it.thumbnail)?.thumbnail;
              const tripKind = cellItems.find(it => it.kind.startsWith('trip'))?.kind;
              return (
                <motion.button
                  key={idx}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => { setSelectedDate(cell.date!); setView('day'); }}
                  className={cn(
                    'relative aspect-square rounded-lg sm:rounded-xl flex flex-col items-center justify-start p-1 sm:p-1.5 text-[11px] sm:text-xs transition-all overflow-hidden border',
                    'hover:bg-primary/5',
                    isSelected ? 'ring-2 ring-primary border-primary bg-primary/10' : 'border-border/50',
                    isToday && !isSelected && 'border-primary/60',
                    cellItems.length > 0 && tripKind === 'trip-active' && 'bg-emerald-500/10',
                    cellItems.length > 0 && tripKind === 'trip-upcoming' && 'bg-primary/5',
                    cellItems.length > 0 && tripKind === 'trip-past' && 'bg-muted/40',
                  )}
                >
                  {/* Thumbnail bg for memory/story */}
                  {thumb && (
                    <div
                      className="absolute inset-0 opacity-30 bg-cover bg-center"
                      style={{ backgroundImage: `url(${thumb})` }}
                    />
                  )}
                  <span className={cn(
                    'relative z-10 font-bold',
                    isToday && 'text-primary',
                  )}>
                    {formatLatnNumber(cell.date.getDate(), i18n.language)}
                  </span>
                  {/* Dots row */}
                  <div className="relative z-10 mt-auto flex items-center justify-center gap-0.5 flex-wrap">
                    {cellItems.slice(0, 4).map((it, i) => (
                      <span key={i} className={cn('h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full', KIND_STYLES[it.kind].dot)} />
                    ))}
                    {cellItems.length > 4 && (
                      <span className="text-[8px] text-muted-foreground font-semibold">+{cellItems.length - 4}</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Day view */}
      <AnimatePresence mode="wait">
        <motion.div
          key={ymd(selectedDate) + view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                {formatLatnDateTime(selectedDate.toISOString(), i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                {formatLatnNumber(itemsOnSelected.length, i18n.language)} {isAr ? 'عنصر' : 'items'}
              </Badge>
            </div>

            {itemsOnSelected.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <CalendarEmptyState isAr={isAr} />
              </div>
            ) : (
              <div className="grid gap-2">
                {itemsOnSelected.map((raw) => {
                  const item = classifyTrip(raw, selectedDate);
                  const style = KIND_STYLES[item.kind];
                  return (
                    <motion.div
                      key={`${item.kind}-${item.id}`}
                      whileHover={{ scale: 1.01 }}
                      className={cn(
                        'group flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-card border cursor-pointer transition-all',
                        'hover:shadow-md ring-0 hover:ring-2',
                        style.ring,
                      )}
                      onClick={() => setPreviewItem(item)}
                    >
                      {item.thumbnail ? (
                        <div
                          className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-cover bg-center shrink-0 ring-1 ring-border"
                          style={{ backgroundImage: `url(${item.thumbnail})` }}
                        />
                      ) : (
                        <div className={cn('h-12 w-12 sm:h-14 sm:w-14 rounded-lg flex items-center justify-center shrink-0', style.chip)}>
                          {KIND_ICON[item.kind]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={cn('text-[9px] gap-1 px-1.5 py-0', style.chip)}>
                            {KIND_ICON[item.kind]}
                            {isAr ? style.label.ar : style.label.en}
                          </Badge>
                          {item.durationDays && item.durationDays > 1 && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                              <Clock size={9} className="me-1" />
                              {formatLatnNumber(item.durationDays, i18n.language)} {isAr ? 'أيام' : 'd'}
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-semibold text-sm text-foreground truncate mt-1">{item.title}</h4>
                        {item.destination && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin size={10} />
                            {item.destination}
                          </p>
                        )}
                      </div>
                       <div className="flex items-center gap-1 shrink-0">
                         <Button
                           variant="ghost"
                           size="icon"
                           className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                           onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                           title={isAr ? 'معاينة سريعة' : 'Quick preview'}
                         >
                           <Eye size={14} />
                         </Button>
                         {item.kind === 'trip-upcoming' && (
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                             onClick={(e) => { e.stopPropagation(); openReminderDialog(item); }}
                             title={isAr ? 'ضبط تذكير' : 'Set reminder'}
                           >
                             <Bell size={14} />
                           </Button>
                         )}
                       </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Active reminders */}
      {reminders.length > 0 && (
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <BellRing size={14} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              {isAr ? 'التذكيرات المفعّلة' : 'Active reminders'}
            </h3>
            <Badge variant="secondary" className="text-[10px] ms-auto">
              {formatLatnNumber(reminders.length, i18n.language)}
            </Badge>
          </div>
          <div className="space-y-2">
            {reminders.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 text-xs">
                <Bell size={12} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isAr ? 'يفعّل في' : 'Fires at'} {formatLatnDateTime(r.fireAt, i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteReminder(r.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Reminder lead-time dialog */}
      <Dialog open={!!reminderTarget} onOpenChange={(open) => !open && setReminderTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'ضبط تذكير' : 'Set reminder'}</DialogTitle>
            <DialogDescription>
              {reminderTarget?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs font-semibold text-foreground">{isAr ? 'تذكيري قبل' : 'Notify me'}</label>
            <Select value={leadHours} onValueChange={setLeadHours}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{isAr ? 'ساعة واحدة' : '1 hour before'}</SelectItem>
                <SelectItem value="24">{isAr ? 'يوم واحد' : '1 day before'}</SelectItem>
                <SelectItem value="168">{isAr ? 'أسبوع' : '1 week before'}</SelectItem>
                <SelectItem value="custom">{isAr ? 'عدد ساعات مخصص' : 'Custom hours'}</SelectItem>
              </SelectContent>
            </Select>
            {leadHours === 'custom' && (
              <input
                value={customLeadHours}
                onChange={(e) => setCustomLeadHours(e.target.value)}
                inputMode="numeric"
                placeholder={isAr ? 'مثال: 5' : 'e.g. 5'}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
            )}
            <Button onClick={confirmReminder} className="w-full">
              <Bell size={14} className="me-2" />
              {isAr ? 'تأكيد التذكير' : 'Confirm reminder'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewItem?.title}</DialogTitle>
            <DialogDescription>{previewItem?.destination || formatLatnDateTime(previewItem?.startDate || new Date().toISOString(), i18n.language, { dateStyle: 'medium' })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {previewItem?.thumbnail && (
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                <img src={previewItem.thumbnail} alt={previewItem.title} className="h-52 w-full object-cover" loading="lazy" />
              </div>
            )}
            {previewItem?.previewMedia && previewItem.previewMedia.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {previewItem.previewMedia.slice(0, 3).map((media, index) => (
                  <img key={`${media}-${index}`} src={media} alt={previewItem.title} className="h-20 w-full rounded-lg object-cover border border-border" loading="lazy" />
                ))}
              </div>
            )}
            {previewItem?.previewDescription && (
              <p className="text-sm text-muted-foreground leading-6">{previewItem.previewDescription}</p>
            )}
            <div className="flex gap-2">
              {previewItem?.kind === 'trip-upcoming' && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => previewItem && openReminderDialog(previewItem)}>
                  <Bell size={14} className="me-2" />
                  {isAr ? 'تذكير' : 'Reminder'}
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => previewItem?.onOpen?.()}>
                {isAr ? 'فتح' : 'Open'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const CalendarEmptyState = ({ isAr }: { isAr: boolean }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
      <Sparkles className="h-5 w-5 text-muted-foreground" />
    </div>
    <p>{isAr ? 'لا يوجد شيء في هذا اليوم' : 'Nothing scheduled this day'}</p>
  </div>
);

export default TravelCalendar;
