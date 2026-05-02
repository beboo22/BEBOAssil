import { useTranslation } from "react-i18next";
import { useCurrency } from "@/hooks/useCurrency";
import { motion } from "framer-motion";
import { Plane, Hotel, Car, Globe, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

const WL_ID = 3357;
const MARKER = "688262";
const ALLIANCE_ID = "7384441";
const SID = "279474539";

const WhiteLabelPage = () => {
  const { i18n, t } = useTranslation();
  const lang = i18n.language?.split("-")[0] || "en";
  const isAr = lang === "ar";
  const { currency } = useCurrency();
  const [activeTab, setActiveTab] = useState("flights");

  const tpCurrency = (currency || "USD").toLowerCase();
  const locale = ["ar", "en", "zh", "ru", "fr", "de", "es", "ur"].includes(lang) ? lang : "en";

  // Trip.com affiliate links
  const tripComLinks = {
    flights: `https://www.trip.com/flights/welcome/?to=home&Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
    hotels: `https://www.trip.com/hotels/w/home?Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
    cars: `https://www.trip.com/carhire/?Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
    trains: `https://www.trip.com/trains/eurotrains/?Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
    activities: `https://www.trip.com/things-to-do/?Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
    transfers: `https://www.trip.com/airport-transfers/index/?Allianceid=${ALLIANCE_ID}&SID=${SID}&trip_sub1=&trip_sub3=D14625669`,
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
              <Globe size={16} />
              {t("bookings.searchBadge")}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {t("bookings.title")}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {t("bookings.subtitle")}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-4 relative z-10 pb-12">
        {/* Quick Links */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {[
            { icon: <Plane size={14} />, label: t("travel.flightsTab"), href: tripComLinks.flights },
            { icon: <Hotel size={14} />, label: t("travel.hotelsTab"), href: tripComLinks.hotels },
            { icon: <Car size={14} />, label: t("travel.carsTab"), href: tripComLinks.cars },
            { icon: "🚆", label: "Trains", href: tripComLinks.trains },
            { icon: "🎯", label: t("travel.activitiesTab"), href: tripComLinks.activities },
            { icon: "🚐", label: t("travel.transfers"), href: tripComLinks.transfers },
          ].map((link, i) => (
            <a key={i} href={link.href} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors gap-1.5 py-1.5 px-3 text-xs">
                {typeof link.icon === "string" ? link.icon : link.icon} {link.label}
                <ExternalLink size={10} className="opacity-50" />
              </Badge>
            </a>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="flights" className="gap-1.5 text-xs sm:text-sm">
              <Plane size={14} /> {t("travel.flightsTab")}
            </TabsTrigger>
            <TabsTrigger value="hotels" className="gap-1.5 text-xs sm:text-sm">
              <Hotel size={14} /> {t("travel.hotelsTab")}
            </TabsTrigger>
            <TabsTrigger value="tripcom" className="gap-1.5 text-xs sm:text-sm">
              <Globe size={14} /> Trip.com
            </TabsTrigger>
          </TabsList>

          {/* WL Search - Flights & Hotels */}
          <TabsContent value="flights" className="mt-0">
            <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-card">
              <iframe
                key={`wl-flights-${locale}-${tpCurrency}`}
                srcDoc={`<!DOCTYPE html>
<html lang="${locale}" dir="${isAr ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fff}</style></head>
<body>
<div id="tpwl-search"></div><div id="tpwl-tickets"></div>
<script>window.__tpwl_config={wl_id:${WL_ID},locale:"${locale}",currency:"${tpCurrency}",default_tab:"avia"};</script>
<script async src="https://tpscr.com/wl_web/main.js?wl_id=${WL_ID}&t=${Date.now()}" type="module"></script>
</body></html>`}
                className="w-full border-0"
                style={{ minHeight: 700 }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Flight Search"
                loading="lazy"
              />
            </div>
          </TabsContent>

          <TabsContent value="hotels" className="mt-0">
            <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-card">
              <iframe
                key={`wl-hotels-${locale}-${tpCurrency}`}
                srcDoc={`<!DOCTYPE html>
<html lang="${locale}" dir="${isAr ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fff}</style></head>
<body>
<div id="tpwl-search"></div><div id="tpwl-tickets"></div>
<script>window.__tpwl_config={wl_id:${WL_ID},locale:"${locale}",currency:"${tpCurrency}",default_tab:"hotels"};</script>
<script async src="https://tpscr.com/wl_web/main.js?wl_id=${WL_ID}&t=${Date.now()}" type="module"></script>
</body></html>`}
                className="w-full border-0"
                style={{ minHeight: 700 }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                title="Hotel Search"
                loading="lazy"
              />
            </div>
          </TabsContent>

          <TabsContent value="tripcom" className="mt-0">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                  <iframe
                    src="https://www.trip.com/partners/ad/S14625543?Allianceid=7384441&SID=279474539&trip_sub1="
                    style={{ width: "100%", height: 320, border: "none" }}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                    title="Trip.com Hotels"
                    loading="lazy"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                  <iframe
                    src="https://www.trip.com/partners/ad/DB14625242?Allianceid=7384441&SID=279474539&trip_sub1="
                    style={{ width: "100%", height: 250, border: "none" }}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                    title="Trip.com Deals"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                <iframe
                  src="https://www.trip.com/partners/ad/DB14625277?Allianceid=7384441&SID=279474539&trip_sub1="
                  style={{ width: "100%", height: 250, border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                  title="Trip.com Offers"
                  loading="lazy"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Features */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { emoji: "✈️", title: t("travel.flightsTab"), desc: "728+ Airlines" },
            { emoji: "🏨", title: t("travel.hotelsTab"), desc: "2M+ Hotels" },
            { emoji: "🚗", title: t("travel.carsTab"), desc: "900+ Providers" },
            { emoji: "🔒", title: t("features.secureBooking"), desc: "Encrypted" },
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-xl p-4 text-center"
            >
              <span className="text-2xl">{f.emoji}</span>
              <h3 className="text-sm font-semibold mt-1 text-foreground">{f.title}</h3>
              <p className="text-[10px] text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WhiteLabelPage;
