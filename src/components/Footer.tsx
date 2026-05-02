import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plane, MapPin, Camera, FileText, Mail, Globe } from "lucide-react";
import SocialLinksFooter from "./SocialLinksFooter";

const Footer = () => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");

  return (
    <footer className="bg-card border-t border-border py-10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <Plane className="h-5 w-5 text-primary" />
              <span className="font-extrabold text-primary">ASEEL AI TRIP</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isArabic
                ? "منصة سفر ذكية تعتمد على الذكاء الاصطناعي لتخطيط رحلاتك."
                : "AI-powered travel platform to plan your perfect trips."}
            </p>
          </div>

          {/* Explore */}
          <div>
            <h4 className="font-bold text-sm text-foreground mb-3">
              {isArabic ? "استكشف" : "Explore"}
            </h4>
            <div className="space-y-2">
              <Link to="/destinations" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <MapPin className="w-3 h-3" /> {isArabic ? "الوجهات" : "Destinations"}
              </Link>
              <Link to="/stories" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Camera className="w-3 h-3" /> {isArabic ? "القصص" : "Stories"}
              </Link>
              <Link to="/pricing" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Globe className="w-3 h-3" /> {isArabic ? "الأسعار" : "Pricing"}
              </Link>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold text-sm text-foreground mb-3">
              {isArabic ? "قانوني" : "Legal"}
            </h4>
            <div className="space-y-2">
              <Link to="/terms" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <FileText className="w-3 h-3" /> {isArabic ? "الشروط والأحكام" : "Terms & Conditions"}
              </Link>
              <Link to="/privacy" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <FileText className="w-3 h-3" /> {isArabic ? "سياسة الخصوصية" : "Privacy Policy"}
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-sm text-foreground mb-3">
              {isArabic ? "تواصل" : "Contact"}
            </h4>
            <div className="space-y-2">
              <a href="mailto:support@aseelaitrip.com" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                <Mail className="w-3 h-3" /> support@aseelaitrip.com
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 text-center">
          <div className="mb-4">
            <SocialLinksFooter />
          </div>
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} ASEEL AI TRIP. {isArabic ? "جميع الحقوق محفوظة." : "All rights reserved."}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
