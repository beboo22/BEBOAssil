import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useSubscriptionLimits = () => {
  const { user } = useAuth();
  const [maxActivitiesPerDay, setMaxActivitiesPerDay] = useState(3);
  const [maxTotalActivities, setMaxTotalActivities] = useState(0);
  const [usedActivities, setUsedActivities] = useState(0);
  const [remainingActivities, setRemainingActivities] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planNameAr, setPlanNameAr] = useState<string | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  // Plan feature flags
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [emergencyEnabled, setEmergencyEnabled] = useState(false);
  // Usage limits
  const [maxChatUses, setMaxChatUses] = useState(0);
  const [maxVoiceUses, setMaxVoiceUses] = useState(0);
  const [usedChatCount, setUsedChatCount] = useState(0);
  const [usedVoiceCount, setUsedVoiceCount] = useState(0);
  // Weather & Emergency & News usage limits
  const [maxWeatherUses, setMaxWeatherUses] = useState(0);
  const [maxEmergencyUses, setMaxEmergencyUses] = useState(0);
  const [maxNewsUses, setMaxNewsUses] = useState(0);
  const [usedWeatherCount, setUsedWeatherCount] = useState(0);
  const [usedEmergencyCount, setUsedEmergencyCount] = useState(0);
  const [usedNewsCount, setUsedNewsCount] = useState(0);
  // SerpAPI gating (per plan)
  const [serpapiFlightsEnabled, setSerpapiFlightsEnabled] = useState(false);
  const [serpapiHotelsEnabled, setSerpapiHotelsEnabled] = useState(false);
  const [maxSerpapiFlightSearches, setMaxSerpapiFlightSearches] = useState(0);
  const [maxSerpapiHotelSearches, setMaxSerpapiHotelSearches] = useState(0);
  const [maxFlightResultsPerSearch, setMaxFlightResultsPerSearch] = useState(8);
  const [maxHotelResultsPerSearch, setMaxHotelResultsPerSearch] = useState(12);
  const [usedSerpapiFlightCount, setUsedSerpapiFlightCount] = useState(0);
  const [usedSerpapiHotelCount, setUsedSerpapiHotelCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setMaxActivitiesPerDay(3);
      setMaxTotalActivities(0);
      setUsedActivities(0);
      setRemainingActivities(null);
      setHasPlan(false);
      setPlanName(null);
      setVoiceEnabled(false);
      setChatEnabled(true);
      setWeatherEnabled(true);
      setNewsEnabled(false);
      setEmergencyEnabled(false);
      setMaxChatUses(0);
      setMaxVoiceUses(0);
      setUsedChatCount(0);
      setUsedVoiceCount(0);
      setMaxWeatherUses(0);
      setMaxEmergencyUses(0);
      setMaxNewsUses(0);
      setUsedWeatherCount(0);
      setUsedEmergencyCount(0);
      setUsedNewsCount(0);
      setSerpapiFlightsEnabled(false);
      setSerpapiHotelsEnabled(false);
      setMaxSerpapiFlightSearches(0);
      setMaxSerpapiHotelSearches(0);
      setMaxFlightResultsPerSearch(8);
      setMaxHotelResultsPerSearch(12);
      setUsedSerpapiFlightCount(0);
      setUsedSerpapiHotelCount(0);
      setLoading(false);
      return;
    }
    
    const fetchLimits = async () => {
      try {
        const { data: sub } = await supabase
          .from('user_subscriptions')
          .select('plan_id, starts_at, expires_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub?.plan_id) {
          const { data: activityOverrides } = await supabase
            .from('user_generation_overrides')
            .select('value, expires_at')
            .eq('user_id', user.id)
            .eq('override_type', 'bonus_activities');

          const bonusActivities = (activityOverrides || []).reduce((sum: number, row: any) => {
            const isValid = !row.expires_at || new Date(row.expires_at) > new Date();
            return isValid ? sum + (Number(row.value) || 0) : sum;
          }, 0);

          const { data: plan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', sub.plan_id)
            .maybeSingle();

          if (plan) {
            const p: any = plan;
            setMaxActivitiesPerDay(p.max_activities_per_day || 7);
            const totalLimit = p.max_total_activities || 0;
            const effectiveTotalLimit = totalLimit + bonusActivities;
            setMaxTotalActivities(effectiveTotalLimit);
            setPlanName(p.name);
            setPlanNameAr(p.name_ar);
            setHasPlan(true);
            // Set feature flags from plan
            setVoiceEnabled(!!p.voice_enabled);
            setChatEnabled(p.chat_enabled !== false);
            setWeatherEnabled(p.weather_enabled !== false);
            setNewsEnabled(!!p.news_enabled);
            setEmergencyEnabled(!!p.emergency_enabled);
            setMaxChatUses(p.max_chat_uses || 0);
            setMaxVoiceUses(p.max_voice_uses || 0);
            setMaxWeatherUses(Number(p.max_weather_uses) || 0);
            setMaxEmergencyUses(Number(p.max_emergency_uses) || 0);
            setMaxNewsUses(Number(p.max_news_uses) || 0);
            // SerpAPI plan-level controls
            setSerpapiFlightsEnabled(!!p.serpapi_flights_enabled);
            setSerpapiHotelsEnabled(!!p.serpapi_hotels_enabled);
            setMaxSerpapiFlightSearches(Number(p.max_serpapi_flight_searches) || 0);
            setMaxSerpapiHotelSearches(Number(p.max_serpapi_hotel_searches) || 0);
            setMaxFlightResultsPerSearch(Number(p.max_flight_results_per_search) || 8);
            setMaxHotelResultsPerSearch(Number(p.max_hotel_results_per_search) || 12);

            if (effectiveTotalLimit > 0) {
              const { data: used, error: rpcError } = await supabase.rpc('get_total_used_activities' as any, {
                p_user_id: user.id,
                p_since: sub.starts_at
              });

              if (!rpcError) {
                const usedCount = Number(used) || 0;
                setUsedActivities(usedCount);
                setRemainingActivities(Math.max(0, effectiveTotalLimit - usedCount));
              }
            } else {
              setUsedActivities(0);
              setRemainingActivities(null);
            }

            // Fetch chat & voice usage counts
            const { count: chatCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'chat')
              .gte('used_at', sub.starts_at);
            setUsedChatCount(chatCount || 0);

            const { count: voiceCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'voice')
              .gte('used_at', sub.starts_at);
            setUsedVoiceCount(voiceCount || 0);

            // Fetch SerpAPI usage counts (within active subscription window)
            const { count: serpFlightCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'serpapi_flight')
              .gte('used_at', sub.starts_at);
            setUsedSerpapiFlightCount(serpFlightCount || 0);

            const { count: serpHotelCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'serpapi_hotel')
              .gte('used_at', sub.starts_at);
            setUsedSerpapiHotelCount(serpHotelCount || 0);

            // Fetch weather & emergency usage counts (within active subscription window)
            const { count: weatherCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'weather')
              .gte('used_at', sub.starts_at);
            setUsedWeatherCount(weatherCount || 0);

            const { count: emergencyCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'emergency')
              .gte('used_at', sub.starts_at);
            setUsedEmergencyCount(emergencyCount || 0);

            const { count: newsCount } = await supabase
              .from('usage_tracking')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('feature', 'news')
              .gte('used_at', sub.starts_at);
            setUsedNewsCount(newsCount || 0);
          }
        } else {
          setMaxActivitiesPerDay(3);
          setMaxTotalActivities(0);
          setRemainingActivities(null);
          setHasPlan(false);
        }
      } catch (e) {
        console.warn('Failed to fetch subscription limits:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchLimits();

    // Listen for credit updates dispatched after any activity/plan generation
    // so the remaining-activities counter refreshes immediately without a reload.
    const handleCreditsUpdate = () => { fetchLimits(); };
    window.addEventListener('aseel-credits-updated', handleCreditsUpdate);
    return () => {
      window.removeEventListener('aseel-credits-updated', handleCreditsUpdate);
    };
  }, [user]);

  // Helper: can the user still use SerpAPI flights this period?
  const canUseSerpapiFlights = hasPlan && serpapiFlightsEnabled && (
    maxSerpapiFlightSearches === 0 || usedSerpapiFlightCount < maxSerpapiFlightSearches
  );
  const canUseSerpapiHotels = hasPlan && serpapiHotelsEnabled && (
    maxSerpapiHotelSearches === 0 || usedSerpapiHotelCount < maxSerpapiHotelSearches
  );
  const remainingSerpapiFlights = maxSerpapiFlightSearches === 0
    ? null
    : Math.max(0, maxSerpapiFlightSearches - usedSerpapiFlightCount);
  const remainingSerpapiHotels = maxSerpapiHotelSearches === 0
    ? null
    : Math.max(0, maxSerpapiHotelSearches - usedSerpapiHotelCount);

  // Track a SerpAPI usage call (returns updated count)
  const trackSerpapiUsage = async (feature: 'serpapi_flight' | 'serpapi_hotel') => {
    if (!user) return;
    try {
      await supabase.from('usage_tracking').insert({
        user_id: user.id,
        feature,
      } as any);
      if (feature === 'serpapi_flight') setUsedSerpapiFlightCount(c => c + 1);
      else setUsedSerpapiHotelCount(c => c + 1);
    } catch (e) {
      console.warn('Failed to track SerpAPI usage:', e);
    }
  };

  // Weather/Emergency/News helpers
  const canUseWeather = !hasPlan || weatherEnabled
    ? (maxWeatherUses === 0 || usedWeatherCount < maxWeatherUses)
    : false;
  const canUseEmergency = !hasPlan || emergencyEnabled
    ? (maxEmergencyUses === 0 || usedEmergencyCount < maxEmergencyUses)
    : false;
  const canUseNews = !hasPlan || newsEnabled
    ? (maxNewsUses === 0 || usedNewsCount < maxNewsUses)
    : false;
  const remainingWeatherUses = maxWeatherUses === 0
    ? null
    : Math.max(0, maxWeatherUses - usedWeatherCount);
  const remainingEmergencyUses = maxEmergencyUses === 0
    ? null
    : Math.max(0, maxEmergencyUses - usedEmergencyCount);
  const remainingNewsUses = maxNewsUses === 0
    ? null
    : Math.max(0, maxNewsUses - usedNewsCount);

  const trackInfoUsage = async (feature: 'weather' | 'emergency' | 'news') => {
    if (!user) return;
    try {
      await supabase.from('usage_tracking').insert({
        user_id: user.id,
        feature,
      } as any);
      if (feature === 'weather') setUsedWeatherCount(c => c + 1);
      else if (feature === 'emergency') setUsedEmergencyCount(c => c + 1);
      else setUsedNewsCount(c => c + 1);
    } catch (e) {
      console.warn('Failed to track info usage:', e);
    }
  };

  return { 
    maxActivitiesPerDay, 
    maxTotalActivities,
    usedActivities,
    remainingActivities,
    planName, 
    planNameAr, 
    hasPlan, 
    loading,
    voiceEnabled,
    chatEnabled,
    weatherEnabled,
    newsEnabled,
    emergencyEnabled,
    maxChatUses,
    maxVoiceUses,
    usedChatCount,
    usedVoiceCount,
    // SerpAPI controls
    serpapiFlightsEnabled,
    serpapiHotelsEnabled,
    maxSerpapiFlightSearches,
    maxSerpapiHotelSearches,
    maxFlightResultsPerSearch,
    maxHotelResultsPerSearch,
    usedSerpapiFlightCount,
    usedSerpapiHotelCount,
    canUseSerpapiFlights,
    canUseSerpapiHotels,
    remainingSerpapiFlights,
    remainingSerpapiHotels,
    trackSerpapiUsage,
    // Weather & Emergency & News
    maxWeatherUses,
    maxEmergencyUses,
    maxNewsUses,
    usedWeatherCount,
    usedEmergencyCount,
    usedNewsCount,
    canUseWeather,
    canUseEmergency,
    canUseNews,
    remainingWeatherUses,
    remainingEmergencyUses,
    remainingNewsUses,
    trackInfoUsage,
  };
};
