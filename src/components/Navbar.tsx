import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Calendar, PlaneLanding, Plane, Hotel, Car, MapPin, Menu, X, ShoppingBag, User, Shield, LogOut, Camera, Route, Crown, Bookmark, Archive, Sparkles, Play, Map, PlusCircle, Compass, Wallet, Film, ChevronDown, Receipt } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/NotificationBell";
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import CurrencySelector from '@/components/CurrencySelector';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/hooks/useAuth';
import { Button } from "@/components/ui/button";
import { getPendingBookings } from "@/utils/bookingReminders";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  key: string;
  name: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isXL, setIsXL] = useState(typeof window !== 'undefined' && window.innerWidth >= 1280);
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currency, setCurrency } = useCurrency();
  const { user, isAdmin, signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [savedBookingsCount, setSavedBookingsCount] = useState(0);
  const [dbNavOrder, setDbNavOrder] = useState<{ visible: string[]; hidden: string[] } | null>(null);

  useEffect(() => {
    const updateCount = () => setSavedBookingsCount(getPendingBookings().length);
    updateCount();
    const interval = setInterval(updateCount, 5000);
    window.addEventListener("focus", updateCount);
    return () => { clearInterval(interval); window.removeEventListener("focus", updateCount); };
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    const handleResize = () => setIsXL(window.innerWidth >= 1280);
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("scroll", handleScroll); window.removeEventListener("resize", handleResize); };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        toggleRef.current && !toggleRef.current.contains(e.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Fetch nav order from DB
  useEffect(() => {
    const fetchNavOrder = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("nav_order")
        .limit(1)
        .single();
      if (data?.nav_order) {
        const order = data.nav_order as any;
        if (Array.isArray(order)) {
          setDbNavOrder({ visible: order as string[], hidden: [] });
        } else if (order.visible) {
          setDbNavOrder({ visible: order.visible, hidden: order.hidden || [] });
        }
      }
    };
    fetchNavOrder();
  }, []);

  // All possible nav items keyed by their identifier
  const allNavItems: Record<string, NavItem> = useMemo(() => ({
    "home": { key: "home", name: t('nav.home'), path: "/", icon: <Globe className="w-4 h-4" /> },
    "destinations": { key: "destinations", name: t('nav.destinations'), path: "/destinations", icon: <MapPin className="w-4 h-4" /> },
    "planner": { key: "planner", name: t('nav.planner'), path: "/planner", icon: <Calendar className="w-4 h-4" /> },
    "promotions": { key: "promotions", name: t('nav.promotions'), path: "/promotions", icon: <PlusCircle className="w-4 h-4" /> },
    "bookings": { key: "bookings", name: t('nav.bookings'), path: "/bookings", icon: <ShoppingBag className="w-4 h-4" /> },
    "flights": { key: "flights", name: t('nav.flights'), path: "/flights", icon: <PlaneLanding className="w-4 h-4" /> },
    "hotels": { key: "hotels", name: t('nav.hotels'), path: "/hotels", icon: <Hotel className="w-4 h-4" /> },
    "cars": { key: "cars", name: t('nav.cars'), path: "/cars", icon: <Car className="w-4 h-4" /> },
    "my-trips": { key: "my-trips", name: t('nav.myTrips'), path: "/my-trips", icon: <Route className="w-4 h-4" /> },
    "stories": { key: "stories", name: t('nav.stories'), path: "/stories", icon: <Camera className="w-4 h-4" /> },
    "story-explorer": { key: "story-explorer", name: t('nav.storyExplorer'), path: "/stories/discover", icon: <Compass className="w-4 h-4" /> },
    "stories-map": { key: "stories-map", name: t('nav.storiesMap'), path: "/adventure-map", icon: <Map className="w-4 h-4" /> },
    "memories": { key: "memories", name: t('nav.memories'), path: "/memories", icon: <Archive className="w-4 h-4" /> },
    "reels": { key: "reels", name: t('nav.reels'), path: "/stories/reels", icon: <Film className="w-4 h-4" /> },
    "events": { key: "events", name: t('nav.events'), path: "/events", icon: <Sparkles className="w-4 h-4" /> },
    "saved-bookings": { key: "saved-bookings", name: t('nav.savedBookings'), path: "/saved-bookings", icon: <Bookmark className="w-4 h-4" />, badge: savedBookingsCount },
    "store": { key: "store", name: t('nav.store', { defaultValue: isAr ? "المتجر" : "Store" }), path: "/store", icon: <ShoppingBag className="w-4 h-4" /> },
    "pricing": { key: "pricing", name: t('nav.pricing'), path: "/pricing", icon: <Crown className="w-4 h-4" /> },
    "wallet": { key: "wallet", name: t('nav.wallet'), path: "/wallet", icon: <Wallet className="w-4 h-4" /> },
  }), [t, savedBookingsCount, isAr]);

  // Default order
  const DEFAULT_ORDER = [
    "home", "destinations", "planner", "promotions", "bookings",
    "flights", "hotels", "cars", "my-trips", "store", "stories",
    "story-explorer", "stories-map", "memories", "reels",
    "events", "saved-bookings", "pricing", "wallet"
  ];

  const navItems = useMemo(() => {
    const order = dbNavOrder?.visible || DEFAULT_ORDER;
    const hidden = new Set(dbNavOrder?.hidden || []);
    return order
      .filter(key => !hidden.has(key) && allNavItems[key])
      .map(key => allNavItems[key]);
  }, [dbNavOrder, allNavItems]);

  return (
    <>
      <header className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-card/95 backdrop-blur-xl", isScrolled ? "shadow-sm border-b border-border" : "border-b border-transparent")}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16 gap-2">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0" onClick={() => setIsMobileMenuOpen(false)}>
              <img src="/logo.png" alt="ASEEL AI TRIP" className="h-9 w-9 sm:h-10 sm:w-10 lg:h-11 lg:w-11 object-contain" />
              <span className="font-extrabold text-sm sm:text-base xl:text-lg tracking-tight text-primary max-[360px]:hidden whitespace-nowrap">ASEEL AI TRIP</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 min-w-0 mx-1">
              {navItems.slice(0, isXL ? 7 : 5).map((item) => (
                <Link key={item.path} to={item.path} className={cn("px-1.5 xl:px-2.5 py-1.5 rounded-lg text-[11px] xl:text-xs font-medium flex items-center gap-1 transition-all duration-200 relative whitespace-nowrap", location.pathname === item.path ? "text-primary bg-primary/10" : "text-foreground/70 hover:text-primary hover:bg-primary/5")}>
                  {item.icon}
                  <span className="hidden xl:inline">{item.name}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-1.5 xl:px-2.5 py-1.5 rounded-lg text-[11px] xl:text-xs font-medium flex items-center gap-1 text-foreground/70 hover:text-primary hover:bg-primary/5 transition-all">
                    <Menu className="w-4 h-4" />
                    <span className="hidden xl:inline">{isAr ? "المزيد" : "More"}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="max-h-[70vh] overflow-y-auto w-52">
                  {navItems.slice(isXL ? 7 : 5).map((item) => (
                    <DropdownMenuItem key={item.path} asChild>
                      <Link to={item.path} className={cn("flex items-center gap-2 text-xs w-full", location.pathname === item.path && "text-primary font-semibold")}>
                        {item.icon}<span>{item.name}</span>
                        {item.badge && item.badge > 0 && (
                          <span className="ml-auto bg-destructive text-destructive-foreground text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">{item.badge}</span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            {/* Desktop right side */}
            <div className="hidden lg:flex items-center gap-1 shrink-0">
              <CurrencySelector value={currency} onChange={setCurrency} compact className="[&_button]:h-7 [&_button]:text-[10px] [&_button]:px-1.5 [&_button]:min-w-0" />
              <LanguageSelector compact className="[&_button]:h-7 [&_button]:text-[10px] [&_button]:px-1.5 [&_button]:min-w-0" />
              <ThemeToggle />
              {user ? (
                <div className="flex items-center gap-0.5">
                  <NotificationBell />
                  {isAdmin && (
                    <Link to="/admin">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Shield className="h-4 w-4 text-primary" /></Button>
                    </Link>
                  )}
                  <Link to="/profile">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><User className="h-4 w-4" /></Button>
                  </Link>
                </div>
              ) : (
                <Link to="/auth">
                  <Button size="sm" className="h-8 text-xs">{t("auth.signIn", { defaultValue: "Sign In" })}</Button>
                </Link>
              )}
            </div>

            {/* Mobile right side */}
            <div className="lg:hidden flex items-center gap-0">
              <CurrencySelector value={currency} onChange={setCurrency} compact className="h-6 min-w-0 max-w-[52px] text-[9px] px-1 border-0 bg-transparent shadow-none [&_button]:h-6 [&_button]:px-1 [&_button]:text-[9px] [&_button]:min-w-0 [&_button]:border-0 [&_button]:shadow-none [&_svg]:hidden" />
              <LanguageSelector compact className="h-6 min-w-0 max-w-[52px] text-[9px] px-0 [&_button]:h-6 [&_button]:px-1 [&_button]:text-[9px] [&_button]:min-w-0 [&_button]:border-0 [&_button]:shadow-none [&_svg]:hidden" />
              <NotificationBell />
              {user && (
                <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><User className="h-3.5 w-3.5" /></Button>
                </Link>
              )}
              <ThemeToggle />
              <motion.button
                ref={toggleRef}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "flex items-center justify-center p-2 rounded-xl transition-all duration-200",
                  isMobileMenuOpen
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-foreground hover:text-primary hover:bg-primary/10"
                )}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <AnimatePresence mode="wait">
                  {isMobileMenuOpen ? (
                    <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                      <X className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                      <Menu className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu portal */}
      {createPortal(
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="lg:hidden fixed inset-0 top-16 bg-black/50 backdrop-blur-sm z-[9998]"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.div
                key="mobile-menu"
                ref={menuRef}
                initial={{ x: "100%", opacity: 0.5 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0.5 }}
                transition={{ type: "spring", damping: 28, stiffness: 350 }}
                className="lg:hidden fixed top-16 right-0 bottom-0 w-[280px] max-w-[85vw] bg-gradient-to-b from-card to-card/95 border-l border-primary/10 shadow-2xl z-[9999] overflow-y-auto overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {/* Brand header */}
                <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center overflow-hidden">
                      <img src="/logo.png" alt="ASEEL AI TRIP" className="h-8 w-8 object-contain" />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-foreground block leading-tight">ASEEL AI TRIP</span>
                      <span className="text-[10px] text-muted-foreground">{t('nav.exploreWorld', { defaultValue: 'Explore the world ✈️' })}</span>
                    </div>
                  </div>
                </div>

                {/* Navigation items */}
                <div className="px-2 py-2 space-y-0.5">
                  {navItems.map((item, i) => (
                    <motion.div
                      key={item.path}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02, type: "spring", stiffness: 280, damping: 22 }}
                    >
                      <Link
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative",
                          location.pathname === item.path
                            ? "text-primary bg-primary/10 shadow-sm border border-primary/15 font-semibold"
                            : "text-foreground/70 hover:text-foreground hover:bg-muted active:scale-[0.97]"
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className={cn(
                          "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0",
                          location.pathname === item.path
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/70 text-muted-foreground"
                        )}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.name}</span>
                        {item.badge && item.badge > 0 && (
                          <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold animate-pulse">{item.badge}</span>
                        )}
                        {location.pathname === item.path && (
                          <motion.div layoutId="activeIndicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>

                {/* User section */}
                <div className="px-2 py-2 border-t border-border/40 mx-2">
                  {user ? (
                    <div className="space-y-0.5">
                      <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted active:scale-[0.97] transition-all" onClick={() => setIsMobileMenuOpen(false)}>
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/50 text-accent-foreground"><User className="w-4 h-4" /></span>
                        <span>{t("profile.title", { defaultValue: "My Profile" })}</span>
                      </Link>
                      <Link to="/invoices" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted active:scale-[0.97] transition-all" onClick={() => setIsMobileMenuOpen(false)}>
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/50 text-accent-foreground"><Receipt className="w-4 h-4" /></span>
                        <span>{t("invoices.title", { defaultValue: isAr ? "فواتيري" : "My Invoices" })}</span>
                      </Link>
                      {isAdmin && (
                        <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-primary hover:bg-primary/5 active:scale-[0.97] transition-all" onClick={() => setIsMobileMenuOpen(false)}>
                          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10"><Shield className="w-4 h-4" /></span>
                          <span>{t("admin.dashboard", { defaultValue: "Admin" })}</span>
                        </Link>
                      )}
                      <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/5 w-full active:scale-[0.97] transition-all" onClick={() => { signOut(); setIsMobileMenuOpen(false); }}>
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10"><LogOut className="w-4 h-4" /></span>
                        <span>{t("auth.signOut", { defaultValue: "Sign Out" })}</span>
                      </button>
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                      <Link to="/auth" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-primary-foreground bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 active:scale-[0.97] transition-all shadow-md" onClick={() => setIsMobileMenuOpen(false)}>
                        <User className="w-4 h-4" /><span>{t("auth.signIn", { defaultValue: "Sign In" })}</span>
                      </Link>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default Navbar;
