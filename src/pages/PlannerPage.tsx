import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import HeroSection from "@/components/HeroSection";
import PopularDestinations from "@/components/PopularDestinations";
import TripPlanner from "@/components/TripPlanner";
import PlanningOptions from "@/components/PlanningOptions";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";

const Chatbot = lazy(() => import("@/components/Chatbot"));

const PlannerPage = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();
  const [initialDestination, setInitialDestination] = useState("");
  const [planningParams, setPlanningParams] = useState<any>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  
  useEffect(() => {
    let hasRoutePrefill = false;

    // From location state
    if (location.state && location.state.destination) {
      setInitialDestination(location.state.destination);
      setShowPlanner(true);
      hasRoutePrefill = true;
    }

    // From URL query params (e.g. from "Plan Similar Trip")
    const params = new URLSearchParams(location.search);
    const decodeParam = (value: string | null) => (value ? decodeURIComponent(value).replace(/\+/g, ' ').trim() : '');
    const urlDestination = decodeParam(params.get('destination'));

    if (urlDestination) {
      hasRoutePrefill = true;
      const transport = decodeParam(params.get('transport'));
      const planParams: any = {
        destinationCity: urlDestination,
        options: {
          itinerary: true,
          flight: transport === 'flight',
          carRental: transport === 'rental_car' || transport === 'personal_car',
          hotel: true,
        },
      };

      const departureCity = decodeParam(params.get('departure'));
      if (departureCity) planParams.departureCity = departureCity;

      const budget = decodeParam(params.get('budget'));
      if (budget) planParams.totalBudget = parseInt(budget);

      const dur = decodeParam(params.get('duration'));
      if (dur) planParams.duration = parseInt(dur);

      const tripType = decodeParam(params.get('tripType'));
      if (tripType) planParams.quickTripType = tripType;

      const interests = decodeParam(params.get('interests'));
      if (interests) {
        planParams.interests = interests.split(',').map((item) => item.trim()).filter(Boolean);
      }

      // Forward event/special-place context (e.g. exact match time + venue) to the planner
      const specialPlaces = decodeParam(params.get('specialPlaces'));
      const eventName = decodeParam(params.get('event'));
      const startDate = decodeParam(params.get('startDate'));
      const additionalParts: string[] = [];
      if (eventName) additionalParts.push(`Trip is built around the event: ${eventName}.`);
      if (specialPlaces) additionalParts.push(specialPlaces);
      if (additionalParts.length > 0) {
        planParams.additionalPreferences = additionalParts.join(' ');
        planParams.specialRequests = additionalParts.join(' ');
      }
      if (startDate) planParams.startDate = startDate;

      if (transport) planParams.transport = transport;

      setPlanningParams(planParams);
      setInitialDestination(urlDestination);
      setShowPlanner(true);
    }

    // From sessionStorage
    const storedParams = !hasRoutePrefill ? sessionStorage.getItem('planningParams') : null;
    if (storedParams && !hasRoutePrefill) {
      try {
        const p = JSON.parse(storedParams);
        setPlanningParams(p);
        setShowPlanner(true);
        toast.success(t('planning.planningOptionsSaved'));
      } catch (error) {
        console.error("Error parsing stored planning parameters", error);
      }
    }
  }, [location, t]);

  if (showPlanner) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="pt-16 min-h-screen bg-background">
        <div className="bg-gradient-travel text-white py-16">
          <div className="section-container">
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-bold mb-4">{t('planner.aiTripPlanner')}</h1>
              <p className="text-xl text-white/90 max-w-2xl mx-auto">{t('planner.aiTripDesc')}</p>
              {planningParams && (
                <div className="mt-4 text-white/80">
                  {planningParams.departureCity && <p>{t('planner.fromCity')}: {planningParams.departureCity}</p>}
                  {planningParams.destinationCity && <p>{t('planner.toCity')}: {planningParams.destinationCity}</p>}
                  {planningParams.estimatedCost > 0 && <p>{t('planner.estimatedBudget')}: {formatPrice(planningParams.estimatedCost)}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="section-container -mt-8 pb-20"><TripPlanner initialPlanningParams={planningParams} /></div>
        <div className="bg-card py-16">
          <div className="section-container">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold mb-4 text-foreground">{t('planner.whyUseTitle')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">{t('planner.whyUseDesc')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: t('planner.saveTime'), desc: t('planner.saveTimeDesc'), icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                { title: t('planner.personalizedPlans'), desc: t('planner.personalizedPlansDesc'), icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
                { title: t('planner.mapsIntegration'), desc: t('planner.mapsIntegrationDesc'), icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
                { title: t('planner.easyUpdates'), desc: t('planner.easyUpdatesDesc'), icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
              ].map((item, i) => (
                <div key={i} className="bg-card p-6 rounded-xl shadow-sm text-center border border-border">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <HeroSection />
      <section id="plan-trip" className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <span className="text-primary text-sm font-semibold tracking-wider uppercase">{t('planner.customizeExperience')}</span>
            <h2 className="text-3xl font-bold mt-2 text-foreground">{t('planner.planYourWay')}</h2>
            <p className="text-muted-foreground mt-2">{t('planner.planYourWayDesc')}</p>
          </div>
          <PlanningOptions onPlanningComplete={() => setShowPlanner(true)} />
        </div>
      </section>
      <PopularDestinations />
      <section className="py-24 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-semibold tracking-wider uppercase">{t('planner.howItWorks')}</span>
            <h2 className="text-3xl font-bold mt-2 mb-4 text-foreground">{t('planner.howItWorksTitle')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{t('planner.howItWorksDesc')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: t('planner.saveTime'), desc: t('planner.saveTimeDesc'), icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
              { title: t('planner.personalizedPlans'), desc: t('planner.personalizedPlansDesc'), icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
              { title: t('planner.mapsIntegration'), desc: t('planner.mapsIntegrationDesc'), icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
            ].map((item, i) => (
              <div key={i} className="bg-card p-6 rounded-xl shadow-sm text-center border border-border">
                <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <motion.button onClick={() => setShowPlanner(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="bg-primary text-primary-foreground font-medium px-8 py-4 rounded-lg hover:bg-primary/90 transition-colors duration-200 inline-block">
              {t('planner.startPlanningNow')}
            </motion.button>
          </div>
        </div>
      </section>
      <section className="py-20 text-white" style={{ background: 'var(--gradient-hero)' }}>
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">{t('planner.readyTitle')}</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">{t('planner.readyDesc')}</p>
          <motion.button onClick={() => setShowPlanner(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="bg-white text-primary font-medium px-8 py-4 rounded-lg hover:bg-gray-100 transition-colors duration-200 inline-block">
            {t('planner.createYourItinerary')}
          </motion.button>
        </div>
      </section>
      <Suspense fallback={null}>
        <Chatbot />
      </Suspense>
    </motion.div>
  );
};

export default PlannerPage;
