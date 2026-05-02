import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Smartphone, Globe, ArrowLeft, Loader2 } from "lucide-react";
import { downloadIcsFile, generateGoogleCalendarUrl, generateIcsContent, normalizeCalendarPreference } from "@/utils/calendarExport";

const CalendarAddPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const autoTriggeredRef = useRef(false);

  const lang = params.get("lang") || (typeof navigator !== "undefined" ? navigator.language : "en");
  const isArabic = lang.startsWith("ar");
  const pref = normalizeCalendarPreference(params.get("pref"));

  const eventData = useMemo(() => {
    const title = params.get("title") || (isArabic ? "فعالية" : "Activity");
    const location = params.get("location") || "";
    const details = params.get("details") || "";
    const startISO = params.get("start") || new Date().toISOString();
    const endISO = params.get("end") || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    return {
      title,
      address: location,
      description: details,
      startISO,
      endISO,
    };
  }, [params, isArabic]);

  const addToPhoneCalendar = async () => {
    setBusy(true);
    try {
      const ics = generateIcsContent(eventData);
      const fileName = `${eventData.title.replace(/\s+/g, "_") || "event"}.ics`;
      downloadIcsFile(ics, fileName);
    } finally {
      setBusy(false);
    }
  };

  const addToGoogleCalendar = () => {
    const url = generateGoogleCalendarUrl(eventData);
    window.location.assign(url);
  };

  useEffect(() => {
    if (autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;

    if (pref === "google") {
      addToGoogleCalendar();
      return;
    }

    if (pref === "native" || pref === "auto") {
      addToPhoneCalendar();
    }
  }, [pref]);

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Calendar size={18} />
            <span>{isArabic ? "إضافة للتقويم" : "Add to Calendar"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground mb-1">{eventData.title}</div>
          {eventData.address && <div>{eventData.address}</div>}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button onClick={addToPhoneCalendar} className="gap-2" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
            {isArabic ? "تقويم الهاتف (Apple/Android)" : "Phone Calendar (Apple/Android)"}
          </Button>

          <Button variant="outline" onClick={addToGoogleCalendar} className="gap-2" disabled={busy}>
            <Globe size={14} />
            Google Calendar
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CalendarAddPage;
