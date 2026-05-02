import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Clock, CalendarDays, X, Pencil, Check, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface AnalyzedRequest {
  query: string;
  category: string;
  forDay?: number | null;
  preferredTime?: string | null;
}

interface ExtendSuggestion {
  startDate: Date;
  returnDate: Date;
  duration: number;
  firstEventDate: string;
}

const LABELS: Record<string, {
  analyzing: string;
  summary: (n: number) => string;
  empty: string;
  failed: string;
  day: string;
  time: string;
  edit: string;
  remove: string;
  save: string;
  anyDay: string;
  extendHint: (date: string, days: number) => string;
  extendAction: string;
}> = {
  ar: {
    analyzing: "جارٍ التحليل بالذكاء الاصطناعي...",
    summary: (n) => `تم تحليل برومبتك بالذكاء الاصطناعي واستخراج ${n} طلب خاص`,
    empty: "لم يتم العثور على طلبات خاصة قابلة للاستخراج",
    failed: "تعذّر التحليل، سيتم استخدام النص كما هو",
    day: "اليوم",
    time: "الوقت",
    edit: "تعديل",
    remove: "حذف",
    save: "حفظ",
    anyDay: "أي يوم",
    extendHint: (date, days) => `يوجد حدث بتاريخ ${date} خارج نطاق الرحلة الحالية. اقترح تمديد الرحلة إلى ${days} يوم لتغطيته.`,
    extendAction: "تمديد الرحلة",
  },
  en: {
    analyzing: "Analyzing with AI...",
    summary: (n) => `Your prompt was analyzed by AI and ${n} special request${n === 1 ? "" : "s"} extracted`,
    empty: "No extractable special requests found",
    failed: "Analysis unavailable — text will be used as-is",
    day: "Day",
    time: "Time",
    edit: "Edit",
    remove: "Remove",
    save: "Save",
    anyDay: "Any day",
    extendHint: (date, days) => `An event on ${date} falls outside the current trip. Suggested trip length: ${days} days.`,
    extendAction: "Extend trip",
  },
  ur: { analyzing: "AI تجزیہ...", summary: (n) => `${n} خصوصی درخواستیں نکالی گئیں`, empty: "کوئی نہیں", failed: "تجزیہ دستیاب نہیں", day: "دن", time: "وقت", edit: "ترمیم", remove: "حذف", save: "محفوظ", anyDay: "کوئی دن", extendHint: (date, days) => `${date} تقریب کیلئے ${days} دن کی تجویز`, extendAction: "مدت بڑھائیں" },
  de: { analyzing: "KI-Analyse...", summary: (n) => `${n} Sonderwünsche extrahiert`, empty: "Keine gefunden", failed: "Nicht verfügbar", day: "Tag", time: "Zeit", edit: "Bearbeiten", remove: "Entfernen", save: "Speichern", anyDay: "Beliebig", extendHint: (date, days) => `Termin ${date} liegt außerhalb der Reise. Vorschlag: ${days} Tage.`, extendAction: "Reise verlängern" },
  fr: { analyzing: "Analyse IA...", summary: (n) => `${n} demande(s) spéciale(s) extraite(s)`, empty: "Aucune trouvée", failed: "Indisponible", day: "Jour", time: "Heure", edit: "Modifier", remove: "Supprimer", save: "Enregistrer", anyDay: "N'importe", extendHint: (date, days) => `Un événement le ${date} est hors voyage. Suggestion: ${days} jours.`, extendAction: "Prolonger" },
  es: { analyzing: "Analizando IA...", summary: (n) => `${n} solicitud(es) extraída(s)`, empty: "Ninguna", failed: "No disponible", day: "Día", time: "Hora", edit: "Editar", remove: "Eliminar", save: "Guardar", anyDay: "Cualquier", extendHint: (date, days) => `Hay un evento el ${date} fuera del viaje. Sugerencia: ${days} días.`, extendAction: "Extender viaje" },
  zh: { analyzing: "AI 分析中...", summary: (n) => `提取 ${n} 项请求`, empty: "未找到", failed: "不可用", day: "天", time: "时间", edit: "编辑", remove: "删除", save: "保存", anyDay: "任意", extendHint: (date, days) => `${date} 的活动超出当前行程，建议 ${days} 天。`, extendAction: "延长行程" },
  ru: { analyzing: "Анализ ИИ...", summary: (n) => `Извлечено: ${n}`, empty: "Не найдено", failed: "Недоступно", day: "День", time: "Время", edit: "Изменить", remove: "Удалить", save: "Сохранить", anyDay: "Любой", extendHint: (date, days) => `Событие ${date} вне поездки. Предлагается ${days} дней.`, extendAction: "Продлить поездку" },
};

const getLabels = (lang: string) => {
  const key = (lang || "en").slice(0, 2).toLowerCase();
  return LABELS[key] || LABELS.en;
};

interface Props {
  specialRequests: string;
  onApply?: (rebuiltText: string) => void;
  totalDays?: number;
  tripStartDate?: Date;
  onAutoExtend?: (next: { startDate: Date; returnDate: Date; duration: number }) => void;
}

const buildText = (items: AnalyzedRequest[]) =>
  items
    .map((r) => {
      const parts: string[] = [r.query];
      if (r.forDay) parts.push(`(day ${r.forDay})`);
      if (r.preferredTime) parts.push(`at ${r.preferredTime}`);
      return `- ${parts.join(" ")}`;
    })
    .join("\n");

const parseEventDatesFromText = (text: string) =>
  Array.from(text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g))
    .map((m) => new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

export const AIRequestsAnalysis = ({ specialRequests, onApply, totalDays, tripStartDate, onAutoExtend }: Props) => {
  const { i18n } = useTranslation();
  const labels = getLabels(i18n.language);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<AnalyzedRequest[]>([]);
  const [failed, setFailed] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [lastAnalyzedText, setLastAnalyzedText] = useState("");

  useEffect(() => {
    const text = (specialRequests || "").trim();
    if (text.length < 8) {
      setRequests([]);
      setAnalyzed(false);
      setFailed(false);
      return;
    }
    if (text === lastAnalyzedText) return;

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("analyze-special-requests", {
          body: { specialRequests: text, language: i18n.language },
        });
        if (cancelled) return;
        if (error) {
          setFailed(true);
          setRequests([]);
        } else {
          const arr: AnalyzedRequest[] = Array.isArray(data?.requests) ? data.requests : [];
          setRequests(arr);
          setAnalyzed(true);
          if (data?.error) setFailed(true);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setRequests([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [specialRequests, i18n.language, lastAnalyzedText]);

  const dateExtensionSuggestion = useMemo<ExtendSuggestion | null>(() => {
    if (!tripStartDate || !totalDays || totalDays < 1) return null;
    const dates = parseEventDatesFromText(specialRequests || "");
    if (dates.length === 0) return null;

    const currentStart = new Date(tripStartDate);
    currentStart.setHours(12, 0, 0, 0);
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + Math.max(0, totalDays - 1));
    currentEnd.setHours(12, 0, 0, 0);

    const firstEvent = dates[0];
    const lastEvent = dates[dates.length - 1];
    if (firstEvent >= currentStart && lastEvent <= currentEnd) return null;

    const nextStart = firstEvent < currentStart ? firstEvent : currentStart;
    const nextEnd = lastEvent > currentEnd ? lastEvent : currentEnd;
    const duration = Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / 86400000) + 1);

    return {
      startDate: nextStart,
      returnDate: new Date(nextEnd.getTime() + 86400000),
      duration,
      firstEventDate: firstEvent.toISOString().split("T")[0],
    };
  }, [specialRequests, totalDays, tripStartDate]);

  const applyChanges = (next: AnalyzedRequest[]) => {
    setRequests(next);
    if (onApply) {
      const newText = buildText(next);
      setLastAnalyzedText(newText);
      onApply(newText);
    }
  };

  const handleRemove = (idx: number) => {
    const next = requests.filter((_, i) => i !== idx);
    applyChanges(next);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(requests[idx].query);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      handleRemove(editingIdx);
    } else {
      const next = requests.map((r, i) => (i === editingIdx ? { ...r, query: trimmed } : r));
      applyChanges(next);
    }
    setEditingIdx(null);
    setEditValue("");
  };

  const updateField = (idx: number, patch: Partial<AnalyzedRequest>) => {
    const next = requests.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    applyChanges(next);
  };

  const dayOptions = Array.from({ length: Math.max(1, totalDays || 14) }, (_, i) => i + 1);

  if (!specialRequests || specialRequests.trim().length < 8) return null;

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5 p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        {loading ? (
          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
        )}
        <p className="text-xs sm:text-sm font-semibold text-foreground">
          {loading
            ? labels.analyzing
            : analyzed && requests.length > 0
              ? labels.summary(requests.length)
              : analyzed
                ? labels.empty
                : labels.analyzing}
        </p>
      </div>

      {failed && !loading && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">{labels.failed}</p>
      )}

      {!loading && requests.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {requests.map((r, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-foreground bg-background/70 rounded-lg px-2 py-1.5 border border-primary/15"
            >
              <Badge className="bg-primary/15 text-primary border border-primary/30 text-[9px] sm:text-[10px] h-auto py-0.5 px-1.5 font-medium">
                {r.category}
              </Badge>

              {editingIdx === i ? (
                <div className="flex-1 flex items-center gap-1 min-w-[140px]">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                      if (e.key === "Escape") { setEditingIdx(null); setEditValue(""); }
                    }}
                    className="h-7 text-[11px] sm:text-xs px-2 py-0 flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={saveEdit}
                    className="h-7 px-2 gap-1 text-[10px]"
                    title={labels.save}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium break-all flex-1 min-w-[80px]">{r.query}</span>
                  <label className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    <select
                      value={r.forDay ?? ""}
                      onChange={(e) => updateField(i, { forDay: e.target.value ? Number(e.target.value) : null })}
                      className="bg-background border border-primary/20 rounded px-1 py-0.5 text-[10px] h-6 cursor-pointer focus:outline-none focus:border-primary"
                      title={labels.day}
                    >
                      <option value="">{labels.anyDay}</option>
                      {dayOptions.map((d) => (
                        <option key={d} value={d}>{labels.day} {d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <input
                      type="time"
                      value={r.preferredTime ?? ""}
                      onChange={(e) => updateField(i, { preferredTime: e.target.value || null })}
                      className="bg-background border border-primary/20 rounded px-1 py-0.5 text-[10px] h-6 cursor-pointer focus:outline-none focus:border-primary"
                      title={labels.time}
                    />
                  </label>
                  <div className="flex items-center gap-0.5 ms-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(i)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                      title={labels.edit}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(i)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      title={labels.remove}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {dateExtensionSuggestion && onAutoExtend && (
        <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-2.5 flex items-start gap-2">
          <CalendarRange className="h-4 w-4 text-accent-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] sm:text-xs text-foreground">
              {labels.extendHint(dateExtensionSuggestion.firstEventDate, dateExtensionSuggestion.duration)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px] sm:text-xs"
            onClick={() => onAutoExtend(dateExtensionSuggestion)}
          >
            {labels.extendAction}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AIRequestsAnalysis;
