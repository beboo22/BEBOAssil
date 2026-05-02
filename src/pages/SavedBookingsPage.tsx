import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plane, Hotel, Car, Bus, MapPin, Calendar, Clock, ExternalLink,
  Trash2, Bell, BellOff, CheckCircle2, AlertTriangle, Bookmark,
  ArrowRight, Sparkles, Star, TrendingDown, Shield, Zap, FileDown
} from "lucide-react";
import { getPendingBookings, removePendingBooking, type SavedBooking } from "@/utils/bookingReminders";
import { exportBookingsPDF } from "@/utils/exportBookingsPDF";
import TravelpayoutsWidget from "@/components/TravelpayoutsWidget";

const TRS = "477988";
const SHMARKER = "688262";

function buildWidgetUrl(params: Record<string, string>): string {
  const base = "https://tpscr.com/content";
  const search = new URLSearchParams({ trs: TRS, shmarker: SHMARKER, powered_by: "true", ...params });
  return `${base}?${search.toString()}`;
}

const categoryConfig: Record<string, { icon: any; color: string; gradient: string }> = {
  flight: { icon: Plane, color: "text-blue-500", gradient: "from-blue-500/10 to-blue-600/5" },
  hotel: { icon: Hotel, color: "text-amber-500", gradient: "from-amber-500/10 to-amber-600/5" },
  car: { icon: Car, color: "text-green-500", gradient: "from-green-500/10 to-green-600/5" },
  transfer: { icon: Bus, color: "text-purple-500", gradient: "from-purple-500/10 to-purple-600/5" },
  activities: { icon: MapPin, color: "text-rose-500", gradient: "from-rose-500/10 to-rose-600/5" },
};

const SavedBookingsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith("ar");
  const [bookings, setBookings] = useState<SavedBooking[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState<number | null>(null);

  useEffect(() => {
    setBookings(getPendingBookings());
  }, []);

  const handleRemove = (index: number) => {
    removePendingBooking(index);
    setBookings(getPendingBookings());
    if (selectedBooking === index) setSelectedBooking(null);
  };

  const filtered = activeTab === "all"
    ? bookings
    : bookings.filter(b => b.category === activeTab);

  const getDaysUntilTravel = (date: string) => {
    const travel = new Date(date);
    const now = new Date();
    return Math.ceil((travel.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getUrgencyBadge = (days: number) => {
    if (days <= 0) return { label: isAr ? "انتهى" : "Passed", variant: "destructive" as const, icon: AlertTriangle };
    if (days <= 3) return { label: isAr ? `${days} أيام!` : `${days} days!`, variant: "destructive" as const, icon: AlertTriangle };
    if (days <= 7) return { label: isAr ? `${days} أيام` : `${days} days`, variant: "secondary" as const, icon: Clock };
    return { label: isAr ? `${days} يوم` : `${days} days`, variant: "outline" as const, icon: Calendar };
  };

  // Price comparison widget URLs per category
  const getComparisonWidgets = (booking: SavedBooking) => {
    const locale = isAr ? "ar" : "en";
    const dest = booking.destination;

    switch (booking.category) {
      case "flight":
        return [
          {
            name: "Aviasales",
            description: isAr ? "مقارنة من 700+ شركة طيران" : "Compare 700+ airlines",
            recommended: true,
            url: buildWidgetUrl({
              currency: "usd", locale, show_hotels: "true",
              searchUrl: "www.aviasales.com/search",
              primary_override: "#00A991", color_button: "#00A991",
              border_radius: "8", plain: "false",
              campaign_id: "100", promo_id: "7879",
            }),
            containerId: `tp-flight-compare-aviasales-${booking.savedAt}`,
          },
          {
            name: isAr ? "تقويم الأسعار" : "Price Calendar",
            description: isAr ? "أفضل الأسعار حسب التاريخ" : "Best prices by date",
            url: buildWidgetUrl({
              currency: "usd", locale, color_button: "#00A991",
              target_host: "www.aviasales.com/search",
              origin: dest.substring(0, 3).toUpperCase(),
              with_fallback: "false", non_direct_flights: "true",
              min_lines: "5", border_radius: "8",
              color_background: "#FFFFFF", color_text: "#000000", color_border: "#FFFFFF",
              campaign_id: "100", promo_id: "2811",
            }),
            containerId: `tp-flight-compare-calendar-${booking.savedAt}`,
          },
        ];
      case "hotel":
        return [
          {
            name: "Hotellook",
            description: isAr ? "مقارنة أسعار من 70+ موقع" : "Compare 70+ booking sites",
            recommended: true,
            url: buildWidgetUrl({
              currency: "usd", locale, limit: "4",
              primary_color: "00A991", results_background_color: "FFFFFF",
              form_background_color: "FFFFFF",
              campaign_id: "111", promo_id: "3411",
            }),
            containerId: `tp-hotel-compare-hotellook-${booking.savedAt}`,
          },
          {
            name: isAr ? "عروض الفنادق" : "Hotel Deals",
            description: isAr ? "أفضل العروض والخصومات" : "Best deals & discounts",
            url: buildWidgetUrl({
              currency: "usd", locale, show_header: "true", limit: "3",
              primary_color: "00A991", results_background_color: "FFFFFF",
              form_background_color: "FFFFFF",
              campaign_id: "111", promo_id: "4478",
            }),
            containerId: `tp-hotel-compare-deals-${booking.savedAt}`,
          },
        ];
      case "car":
        return [
          {
            name: "DiscoverCars",
            description: isAr ? "أفضل أسعار تأجير السيارات" : "Best car rental prices",
            recommended: true,
            url: buildWidgetUrl({
              locale, lang: "en", width: "100", background: "light",
              logo: "true", header: "true", gearbox: "false", cars: "true",
              border: "false", footer: "true",
              campaign_id: "87", promo_id: "4322",
            }),
            containerId: `tp-car-compare-discover-${booking.savedAt}`,
          },
        ];
      case "transfer":
        return [
          {
            name: "Kiwitaxi",
            description: isAr ? "خدمات النقل والتوصيل" : "Transfer services",
            recommended: true,
            url: buildWidgetUrl({
              currency: "USD", locale,
              transfer_options_limit: "10", transfer_options: "MCR",
              disable_currency_selector: "true", hide_form_extras: "true",
              hide_external_links: "true",
              campaign_id: "1", promo_id: "3879",
            }),
            containerId: `tp-transfer-compare-kiwitaxi-${booking.savedAt}`,
          },
        ];
      case "activities":
        return [
          {
            name: "GetYourGuide",
            description: isAr ? "أنشطة وتجارب محلية" : "Local activities & experiences",
            recommended: true,
            url: buildWidgetUrl({
              currency: "USD", locale, category: "4", amount: "3",
              campaign_id: "137", promo_id: "4497",
            }),
            containerId: `tp-activities-compare-gyg-${booking.savedAt}`,
          },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="min-h-screen bg-background pt-20 pb-10">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bookmark className="text-primary" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isAr ? "حجوزاتي المحفوظة" : "My Saved Bookings"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isAr ? `${bookings.length} حجز محفوظ` : `${bookings.length} saved bookings`}
              </p>
            </div>
            {bookings.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportBookingsPDF(bookings, isAr)}>
                <FileDown size={14} /> {isAr ? "تصدير PDF" : "Export PDF"}
              </Button>
            )}
          </div>
        </motion.div>

        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="w-full flex overflow-x-auto gap-1 bg-muted/30 p-1 rounded-xl">
            <TabsTrigger value="all" className="flex-1 text-xs sm:text-sm">
              {isAr ? "الكل" : "All"} ({bookings.length})
            </TabsTrigger>
            {Object.entries(categoryConfig).map(([key, cfg]) => {
              const count = bookings.filter(b => b.category === key).length;
              if (count === 0) return null;
              return (
                <TabsTrigger key={key} value={key} className="flex items-center gap-1 flex-1 text-xs sm:text-sm">
                  <cfg.icon size={12} />
                  <span className="hidden sm:inline">{isAr ? getCategoryNameAr(key) : key}</span>
                  ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Empty State */}
        {filtered.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
              <Bookmark className="text-muted-foreground" size={28} />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {isAr ? "لا توجد حجوزات محفوظة" : "No saved bookings"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {isAr
                ? "عند إنشاء خطة رحلة واختيار 'حفظ للحجز لاحقاً'، ستظهر حجوزاتك هنا"
                : "When you create a trip plan and select 'Save for Later', your bookings will appear here"}
            </p>
            <Button onClick={() => navigate("/planner")} className="gap-2">
              <Sparkles size={16} />
              {isAr ? "إنشاء خطة رحلة" : "Create Trip Plan"}
            </Button>
          </motion.div>
        )}

        {/* Booking Cards */}
        <div className="space-y-4">
          <AnimatePresence>
            {filtered.map((booking, idx) => {
              const originalIdx = bookings.indexOf(booking);
              const cfg = categoryConfig[booking.category] || categoryConfig.activities;
              const Icon = cfg.icon;
              const days = getDaysUntilTravel(booking.travelDate);
              const urgency = getUrgencyBadge(days);
              const UrgencyIcon = urgency.icon;
              const isExpanded = selectedBooking === originalIdx;

              return (
                <motion.div
                  key={`${booking.category}-${booking.savedAt}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className={`overflow-hidden border-border/50 hover:border-primary/30 transition-all ${isExpanded ? 'ring-1 ring-primary/20' : ''}`}>
                    {/* Main Row */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setSelectedBooking(isExpanded ? null : originalIdx)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                          <Icon className={cfg.color} size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground text-sm">
                              {isAr ? getCategoryNameAr(booking.category) : booking.category}
                            </h3>
                            <Badge variant={urgency.variant} className="gap-1 text-[10px]">
                              <UrgencyIcon size={10} />
                              {urgency.label}
                            </Badge>
                            {days > 0 && days <= 3 && (
                              <Badge variant="destructive" className="gap-1 text-[10px] animate-pulse">
                                <Bell size={10} />
                                {isAr ? "احجز الآن!" : "Book Now!"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <MapPin size={11} />
                            <span>{booking.destination}</span>
                            <span>•</span>
                            <Calendar size={11} />
                            <span>{new Date(booking.travelDate).toLocaleDateString(isAr ? "ar" : "en")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleRemove(originalIdx); }}
                          >
                            <Trash2 size={14} />
                          </Button>
                          <ArrowRight size={14} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded: Price Comparison */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
                            {/* Smart Recommendation */}
                            <div className="bg-primary/5 rounded-lg p-3 flex items-start gap-2">
                              <Sparkles className="text-primary shrink-0 mt-0.5" size={16} />
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {isAr ? "💡 توصية ذكية" : "💡 Smart Recommendation"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {getSmartRecommendation(booking, days, isAr)}
                                </p>
                              </div>
                            </div>

                            {/* Provider Comparison */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <TrendingDown size={14} className="text-primary" />
                                {isAr ? "مقارنة الأسعار" : "Price Comparison"}
                              </h4>

                              {getComparisonWidgets(booking).map((widget, widx) => (
                                <Card key={widx} className={`p-3 ${widget.recommended ? 'border-primary/30 bg-primary/5' : ''}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="font-medium text-sm text-foreground">{widget.name}</span>
                                    {widget.recommended && (
                                      <Badge className="gap-1 text-[10px] bg-primary/10 text-primary border-0">
                                        <Star size={8} /> {isAr ? "موصى به" : "Recommended"}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mb-3">{widget.description}</p>
                                  <TravelpayoutsWidget
                                    scriptUrl={widget.url}
                                    containerId={widget.containerId}
                                    minHeight={300}
                                    loadTimeout={15000}
                                  />
                                </Card>
                              ))}
                            </div>

                            {/* Quick Actions */}
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" className="gap-1.5" onClick={() => navigate(`/bookings?tab=${booking.category === 'flight' ? 'flights' : 'hotels'}`)}>
                                <ExternalLink size={12} />
                                {isAr ? "البحث المتقدم" : "Advanced Search"}
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleRemove(originalIdx)}>
                                <CheckCircle2 size={12} />
                                {isAr ? "تم الحجز" : "Already Booked"}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

function getCategoryNameAr(category: string): string {
  const names: Record<string, string> = {
    flight: "الطيران",
    hotel: "الفندق",
    car: "تأجير السيارات",
    transfer: "النقل والتوصيل",
    activities: "الأنشطة",
  };
  return names[category] || category;
}

function getSmartRecommendation(booking: SavedBooking, daysUntilTravel: number, isAr: boolean): string {
  const { category } = booking;

  if (daysUntilTravel <= 0) {
    return isAr ? "موعد السفر قد مضى. يمكنك حذف هذا الحجز." : "Travel date has passed. You can remove this booking.";
  }

  if (category === "flight") {
    if (daysUntilTravel <= 3) {
      return isAr ? "⚠️ الأسعار ترتفع بشكل كبير قبل 3 أيام من السفر. احجز فوراً للحصول على أفضل سعر!" : "⚠️ Prices spike within 3 days of travel. Book immediately for the best price!";
    }
    if (daysUntilTravel <= 14) {
      return isAr ? "📊 أفضل وقت للحجز هو الآن. الأسعار قد ترتفع في الأيام القادمة." : "📊 Best time to book is now. Prices may increase in the coming days.";
    }
    return isAr ? "💡 راقب الأسعار - عادةً أفضل الأسعار تكون قبل 3-6 أسابيع من السفر." : "💡 Monitor prices - best deals are usually 3-6 weeks before travel.";
  }

  if (category === "hotel") {
    if (daysUntilTravel <= 7) {
      return isAr ? "🏨 الغرف المتاحة تقل. احجز الآن لضمان خيارات أفضل وأسعار مناسبة." : "🏨 Room availability is decreasing. Book now for better options and prices.";
    }
    return isAr ? "💡 قارن الأسعار بين عدة مواقع. بعض الفنادق تقدم إلغاء مجاني." : "💡 Compare prices across sites. Some hotels offer free cancellation.";
  }

  if (category === "car") {
    return isAr ? "🚗 احجز مبكراً للحصول على سيارة أفضل بسعر أقل. الأسعار ترتفع في المواسم." : "🚗 Book early for better cars at lower prices. Prices rise during peak seasons.";
  }

  return isAr ? "📌 لا تنسَ إكمال حجزك قبل موعد السفر!" : "📌 Don't forget to complete your booking before travel!";
}

export default SavedBookingsPage;
