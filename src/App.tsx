import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LiveStreamProvider } from "@/hooks/useLiveStream";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useDynamicCanonical } from "@/hooks/useDynamicCanonical";
import Navbar from "./components/Navbar";
import ScrollToTop from "./components/ScrollToTop";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ProfileCompletionModal from "./components/ProfileCompletionModal";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
const Chatbot = lazy(() => import("./components/Chatbot"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ItineraryPage = lazy(() => import("./pages/ItineraryPage"));
const DestinationsPage = lazy(() => import("./pages/DestinationsPage"));
const FlightPage = lazy(() => import("./pages/FlightPage"));
const HotelPage = lazy(() => import("./pages/HotelPage"));
const CarsPage = lazy(() => import("./pages/CarsPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const PlaceDetailsPage = lazy(() => import("./pages/PlaceDetailsPage"));
const SharedTripPage = lazy(() => import("./pages/SharedTripPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const StoriesPage = lazy(() => import("./pages/StoriesPage"));
const StoriesDiscoverPage = lazy(() => import("./pages/StoriesDiscoverPage"));
const AdventureMapPage = lazy(() => import("./pages/AdventureMapPage"));
const LiveStreamsPage = lazy(() => import("./pages/LiveStreamsPage"));
const LiveStreamViewerPage = lazy(() => import("./pages/LiveStreamViewerPage"));
const MyLiveStreamsPage = lazy(() => import("./pages/MyLiveStreamsPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const MyTripsPage = lazy(() => import("./pages/MyTripsPage"));
const CalendarAddPage = lazy(() => import("./pages/CalendarAddPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ReelsPage = lazy(() => import("./pages/ReelsPage"));
const SharedMemoryPage = lazy(() => import("./pages/SharedMemoryPage"));
const SavedBookingsPage = lazy(() => import("./pages/SavedBookingsPage"));
const MemoriesPage = lazy(() => import("./pages/MemoriesPage"));
const WhiteLabelPage = lazy(() => import("./pages/WhiteLabelPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const PromotionsPage = lazy(() => import("./pages/PromotionsPage"));
const PromotionDetailPage = lazy(() => import("./pages/PromotionDetailPage"));
const StadiumDetailPage = lazy(() => import("./pages/StadiumDetailPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // prevent freeze when tab returns from background
      retry: 1,
      networkMode: 'always', // don't pause queries waiting for online status
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

// When the tab returns from background, force-disconnect and reconnect Supabase
// realtime so the UI is not blocked by a stale TCP/WebSocket waiting for a
// keep-alive timeout (which can take 1-2 minutes on mobile / sleeping tabs).
if (typeof window !== 'undefined') {
  let _wakeBusy = false;
  const onWake = async () => {
    if (document.visibilityState !== 'visible' || _wakeBusy) return;
    _wakeBusy = true;
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      try { (supabase as any).realtime?.disconnect?.(); } catch {}
      try { (supabase as any).realtime?.connect?.(); } catch {}
    } catch {}
    finally { setTimeout(() => { _wakeBusy = false; }, 1500); }
  };
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('pageshow', onWake);
  window.addEventListener('online', onWake);
}

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center pt-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AppContent = () => {
  const location = useLocation();
  const { user } = useAuth();
  usePageTracking(user?.id);
  useDynamicCanonical();
  const hideNavbar = location.pathname === '/stories' || location.pathname.startsWith('/calendar/add');
  const hideChatbot = location.pathname.startsWith('/stories');
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ScrollToTop />
      {!hideNavbar && <Navbar />}
      <ProfileCompletionModal />
      <Suspense fallback={<PageFallback />}>
        <AppErrorBoundary key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Index />} />
            <Route path="/index" element={<Index />} />
            <Route path="/planner" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/itinerary/:id" element={<ItineraryPage />} />
            <Route path="/shared/:shareCode" element={<SharedTripPage />} />
            <Route path="/place/:placeId" element={<PlaceDetailsPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/flights" element={<FlightPage />} />
            <Route path="/hotels" element={<HotelPage />} />
            <Route path="/cars" element={<CarsPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/saved-bookings" element={<SavedBookingsPage />} />
            <Route path="/search" element={<BookingsPage />} />
            <Route path="/my-trips" element={<MyTripsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/stories/discover" element={<StoriesDiscoverPage />} />
            <Route path="/stories/reels" element={<ReelsPage />} />
            <Route path="/stories/map" element={<AdventureMapPage />} />
            <Route path="/stories/live" element={<LiveStreamsPage />} />
            <Route path="/stories/live/mine" element={<MyLiveStreamsPage />} />
            <Route path="/stories/live/:id" element={<LiveStreamViewerPage />} />
            <Route path="/adventure-map" element={<AdventureMapPage />} />
            <Route path="/calendar/add" element={<CalendarAddPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/profile/:userId" element={<UserProfilePage />} />
            <Route path="/memory/:shareCode" element={<SharedMemoryPage />} />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/white-label" element={<WhiteLabelPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/promotions/:id" element={<PromotionDetailPage />} />
            <Route path="/stadium/:slug" element={<StadiumDetailPage />} />
            <Route path="/store" element={<StorePage />} />
            <Route path="/store/product/:id" element={<ProductDetailPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppErrorBoundary>
      </Suspense>
      {/* Global Chatbot - hidden on immersive stories/live pages */}
      {!hideChatbot && (
        <Suspense fallback={null}>
          <Chatbot />
        </Suspense>
      )}
    </TooltipProvider>
  );
};

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <LiveStreamProvider>
              <AppContent />
            </LiveStreamProvider>
          </BrowserRouter>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
