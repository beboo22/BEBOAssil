import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, MapPin, Plane } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiCityProgressProps {
  cities: { city: string; days: number }[];
  destination: string;
}

/**
 * Detailed progress indicator that simulates per-city activity generation
 * for multi-city trips. Distributes time proportionally to each leg's days.
 */
const MultiCityProgress = ({ cities, destination }: MultiCityProgressProps) => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const validCities = cities.filter((c) => c.city);
  const totalDays = validCities.reduce((s, c) => s + (c.days || 1), 0) || 1;

  useEffect(() => {
    if (validCities.length === 0) return;
    // Estimate ~6s per day, capped between 25s-75s total
    const totalDurationMs = Math.min(75000, Math.max(25000, totalDays * 6000));
    const startedAt = Date.now();

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(0.97, elapsed / totalDurationMs);
      setProgress(ratio);

      // Determine which city we are "on" based on cumulative day weight
      let cumulative = 0;
      let idx = 0;
      for (let i = 0; i < validCities.length; i++) {
        const weight = (validCities[i].days || 1) / totalDays;
        if (ratio < cumulative + weight) {
          idx = i;
          break;
        }
        cumulative += weight;
        idx = i;
      }
      setActiveIndex(idx);
    }, 400);

    return () => clearInterval(tick);
  }, [totalDays, validCities.length]);

  if (validCities.length === 0) return null;

  return (
    <div className="space-y-4 py-2">
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-primary flex items-center justify-center gap-2">
          <Plane className="w-5 h-5" />
          {isAr ? "جاري توليد رحلتك متعددة المدن" : "Generating your multi-city trip"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `المدينة ${activeIndex + 1} من ${validCities.length}`
            : `City ${activeIndex + 1} of ${validCities.length}`}
        </p>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-accent"
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.4, ease: "linear" }}
        />
      </div>

      {/* Per-city status list */}
      <div className="space-y-2">
        {validCities.map((leg, i) => {
          const status =
            i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <div
              key={`${leg.city}-${i}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
                status === "done" && "bg-primary/5 border-primary/30",
                status === "active" &&
                  "bg-primary/10 border-primary shadow-sm scale-[1.02]",
                status === "pending" && "bg-muted/40 border-border opacity-60"
              )}
            >
              <div className="shrink-0">
                {status === "done" && (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                )}
                {status === "active" && (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                )}
                {status === "pending" && (
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-medium truncate">
                  {leg.city}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {status === "done"
                    ? isAr
                      ? "✓ تم توليد الأنشطة"
                      : "✓ Activities generated"
                    : status === "active"
                    ? isAr
                      ? `جاري إعداد ${leg.days} ${leg.days === 1 ? "يوم" : "أيام"}...`
                      : `Preparing ${leg.days} day${leg.days === 1 ? "" : "s"}...`
                    : isAr
                    ? `${leg.days} ${leg.days === 1 ? "يوم" : "أيام"} - بانتظار الدور`
                    : `${leg.days} day${leg.days === 1 ? "" : "s"} - waiting`}
                </p>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {Math.round(((leg.days || 1) / totalDays) * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-center text-muted-foreground">
        {isAr
          ? "الرجاء عدم إغلاق الصفحة — قد يستغرق الأمر دقيقة لكل مدينة"
          : "Please don't close the page — may take ~1 min per city"}
      </p>
    </div>
  );
};

export default MultiCityProgress;
