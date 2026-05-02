
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-travel-gray flex flex-col items-center justify-center pt-16 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm text-center"
      >
        <div className="w-24 h-24 bg-travel-blue-bg rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl font-bold text-travel-blue">404</span>
        </div>
        
        <h1 className="text-2xl font-bold mb-2 text-gray-900">{t('common.error')} 404</h1>
        
        <p className="text-gray-600 mb-6">{t('common.noResults')}</p>
        
        <div className="space-y-3">
          <Button asChild className="w-full bg-travel-blue hover:bg-travel-blue-dark">
            <Link to="/">{t('common.home')}</Link>
          </Button>
          
          <Button asChild variant="outline" className="w-full">
            <Link to="/planner">{t('travel.planYourTrip')}</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
