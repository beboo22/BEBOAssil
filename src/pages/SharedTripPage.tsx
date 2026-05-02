import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Check, Calendar, Share2, Download, MapPin, Clock, DollarSign,
  Star, ChevronLeft, Navigation, Lightbulb, Fuel, Route, Car, FileText, Loader2, Link2
} from "lucide-react";
import { format, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import ItinerarySchedule from "@/components/ItinerarySchedule";
import ItineraryMap from "@/components/ItineraryMap";
import PrintableItinerary from "@/components/PrintableItinerary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateDayTripStats } from "@/utils/itineraryUtils";

function safeDate(value: string | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return isValid(value) ? value : new Date();
  const d = new Date(value);
  if (isValid(d)) return d;
  return new Date();
}

function safeFormat(value: string | Date | undefined | null, fmt: string): string {
  try { return format(safeDate(value), fmt); } catch { return "—"; }
}

const SharedTripPage = () => {
  const { t } = useTranslation();
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const [itinerary, setItinerary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const fuelSettings = { efficiency: 8, price: 2.5 };

  useEffect(() => {
    if (!shareCode) { setError("Invalid share link"); setLoading(false); return; }
    
    const loadSharedTrip = async () => {
      const { data, error: dbError } = await (supabase as any)
        .from("shared_trips")
        .select("*")
        .eq("share_code", shareCode)
        .maybeSingle();

      if (dbError || !data) {
        setError(t("share.notFound", { defaultValue: "Shared trip not found or link expired." }));
        setLoading(false);
        return;
      }

      const tripData = (data as any).trip_data;
      if (tripData.startDate) tripData.startDate = new Date(tripData.startDate);
      if (tripData.endDate) tripData.endDate = new Date(tripData.endDate);
      tripData.days?.forEach((d: any) => { if (d?.date) d.date = new Date(d.date); });
      setItinerary(tripData);
      setLoading(false);
    };

    loadSharedTrip();
  }, [shareCode]);

  const handleViewInMaps = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(t("itinerary.linkCopied", { defaultValue: "Link copied!" }));
  };

  // Save this trip to own account
  const handleSaveToMyTrips = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.info(t("auth.signInToSave", { defaultValue: "Sign in to save this trip" }));
        navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const tripId = Math.random().toString(36).substring(2, 10);
      const tripToSave = { ...itinerary, id: tripId };
      try { localStorage.setItem(`itinerary-${tripId}`, JSON.stringify(tripToSave)); } catch {}

      const { error: insertErr } = await (supabase as any).from("saved_trips").insert({
        user_id: session.user.id,
        trip_id: tripId,
        destination: itinerary.destination,
        trip_data: itinerary,
      });
      if (insertErr) {
        console.error("saved_trips insert error", insertErr);
        toast.error(t("share.saveFailed", { defaultValue: "Could not save trip. Please try again." }));
        return;
      }

      toast.success(t("share.savedToMyTrips", { defaultValue: "Trip saved to your profile!" }));
      navigate(`/itinerary/${tripId}`);
    } catch (e) {
      console.error("handleSaveToMyTrips failed", e);
      toast.error(t("share.saveFailed", { defaultValue: "Could not save trip. Please try again." }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
        <p className="text-muted-foreground">{t("common.loading", { defaultValue: "Loading..." })}</p>
      </div>
    );
  }

  if (error || !itinerary?.days?.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <div className="text-center max-w-md">
          <Link2 size={48} className="mx-auto mb-4 text-muted-foreground/30" />
          <h1 className="text-xl font-bold text-foreground mb-2">{t("share.notFoundTitle", { defaultValue: "Trip Not Found" })}</h1>
          <p className="text-muted-foreground mb-4">{error || t("share.notFound")}</p>
          <Button onClick={() => navigate("/")}>{t("itinerary.createNew", { defaultValue: "Plan Your Own Trip" })}</Button>
        </div>
      </div>
    );
  }

  const safeDay = Math.min(Math.max(0, activeDay), itinerary.days.length - 1);
  if (safeDay !== activeDay) setActiveDay(safeDay);

  const totalCost = itinerary.estimatedTotalCost || itinerary.days.reduce((sum: number, day: any) =>
    sum + day.activities.reduce((s: number, a: any) => s + (a.cost || 0), 0), 0);

  const tripTotalStats = itinerary.days.reduce((acc: any, day: any) => {
    const dayStats = calculateDayTripStats(day.activities, fuelSettings.efficiency, fuelSettings.price);
    return { totalDistance: acc.totalDistance + dayStats.totalDistance, fuelCost: acc.fuelCost + dayStats.fuelCost };
  }, { totalDistance: 0, fuelCost: 0 });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background pb-20">
      {/* Shared Trip Banner */}
      <div className="bg-primary/10 border-b border-primary/20 py-2 px-4">
        <div className="container mx-auto flex items-center justify-between text-sm">
          <span className="text-primary font-medium flex items-center gap-1.5">
            <Share2 size={14} /> {t("share.sharedTrip", { defaultValue: "Shared Trip" })}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={handleSaveToMyTrips}>
            <Download size={12} /> {t("share.saveToMyTrips", { defaultValue: "Save to My Trips" })}
          </Button>
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-gradient-to-br from-primary via-accent to-primary text-white py-6 sm:py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white/80 hover:text-white hover:bg-white/10 -ml-2">
              <ChevronLeft size={16} className="mr-1" /> {t("itinerary.home", { defaultValue: "Home" })}
            </Button>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{itinerary.destination}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-white/80 text-sm">
            <span className="flex items-center gap-1"><Calendar size={14} /> {safeFormat(itinerary.startDate, "MMM dd")} — {safeFormat(itinerary.endDate, "MMM dd, yyyy")}</span>
            <span className="flex items-center gap-1"><Clock size={14} /> {itinerary.duration} {t("travel.days")}</span>
            {totalCost > 0 && <span className="flex items-center gap-1"><DollarSign size={14} /> ~${totalCost}</span>}
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button size="sm" variant="secondary" onClick={handleCopyLink} className="gap-1.5">
              <Link2 size={14} /> {t("share.copyLink", { defaultValue: "Copy Link" })}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="mt-6">
          <Tabs defaultValue="schedule" className="w-full">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="schedule" className="text-sm">{t("itinerary.schedule")}</TabsTrigger>
              <TabsTrigger value="map" className="text-sm">{t("itinerary.map")}</TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="mt-0">
              <div className="mb-4 -mx-4 px-4">
                <div 
                  className="flex gap-2 p-1.5 pb-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth max-w-full"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', scrollbarWidth: 'none' }}
                >
                  {itinerary.days.map((day: any, index: number) => (
                    <button key={index} onClick={() => setActiveDay(index)}
                      className={`shrink-0 px-4 py-2 rounded-xl transition-all text-sm snap-start ${
                        activeDay === index
                          ? "bg-primary text-primary-foreground font-medium shadow-sm"
                          : "bg-card border border-border hover:bg-muted"
                      }`}>
                      <div className="font-medium">{t("itinerary.day")} {index + 1}</div>
                      <div className="text-xs opacity-70">{safeFormat(day.date, "MMM dd")}</div>
                    </button>
                  ))}
                </div>
              </div>

              <ItinerarySchedule
                day={itinerary.days[activeDay]}
                destination={itinerary.destination}
                onMapClick={handleViewInMaps}
                dayIndex={activeDay}
                totalDays={itinerary.days.length}
                fuelSettings={fuelSettings}
              />
            </TabsContent>

            <TabsContent value="map" className="mt-0">
              <Card className="p-4 sm:p-6">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4">
                  {itinerary.days.map((day: any, index: number) => (
                    <button key={`shared-map-day-${index}`} onClick={() => setActiveDay(index)}
                      className={`shrink-0 px-4 py-2 rounded-xl transition-all text-sm ${
                        activeDay === index
                          ? "bg-primary text-primary-foreground font-medium shadow-sm"
                          : "bg-card border border-border hover:bg-muted"
                      }`}>
                      <div className="font-medium">{t("itinerary.day")} {index + 1}</div>
                      <div className="text-xs opacity-70">{safeFormat(day.date, "MMM dd")}</div>
                    </button>
                  ))}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-4">{t("itinerary.mapForDay", { num: activeDay + 1 })}</h3>
                <ItineraryMap activities={itinerary.days[activeDay].activities} onMarkerClick={handleViewInMaps} />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.div>
  );
};

export default SharedTripPage;
