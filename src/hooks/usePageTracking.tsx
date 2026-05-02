import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const getGuestId = () => {
  let id = localStorage.getItem("guest_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("guest_id", id);
  }
  return id;
};

const detectCountry = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const tzMap: Record<string, string> = {
      "Asia/Riyadh": "SA", "Asia/Jeddah": "SA", "Asia/Dubai": "AE", "Asia/Abu_Dhabi": "AE",
      "Asia/Muscat": "OM", "Asia/Qatar": "QA", "Asia/Bahrain": "BH", "Asia/Kuwait": "KW",
      "Africa/Cairo": "EG", "Asia/Amman": "JO", "Asia/Beirut": "LB", "Asia/Baghdad": "IQ",
      "Asia/Damascus": "SY", "Africa/Tripoli": "LY", "Africa/Tunis": "TN", "Africa/Algiers": "DZ",
      "Africa/Casablanca": "MA", "Asia/Aden": "YE", "Asia/Tehran": "IR", "Asia/Istanbul": "TR",
      "Europe/Istanbul": "TR", "Europe/London": "GB", "America/New_York": "US",
      "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US",
      "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT",
      "Asia/Kolkata": "IN", "Asia/Karachi": "PK", "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
      "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Singapore": "SG",
      "Asia/Kuala_Lumpur": "MY", "Asia/Jakarta": "ID", "Asia/Manila": "PH",
      "Australia/Sydney": "AU", "Pacific/Auckland": "NZ", "America/Toronto": "CA",
      "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "Africa/Johannesburg": "ZA",
      "Africa/Nairobi": "KE", "Africa/Lagos": "NG", "Europe/Moscow": "RU",
      "Europe/Amsterdam": "NL", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
    };
    if (tzMap[tz]) return tzMap[tz];
    const region = tz.split("/")[0];
    if (region === "Asia") return "AS";
    if (region === "Europe") return "EU";
    if (region === "Africa") return "AF";
    if (region === "America") return "AM";
  } catch {}
  return "Unknown";
};

export const usePageTracking = (userId?: string) => {
  const location = useLocation();
  const lastPath = useRef("");

  useEffect(() => {
    const path = location.pathname;
    if (path === lastPath.current) return;
    lastPath.current = path;

    const track = async () => {
      try {
        await supabase.from("page_views").insert({
          user_id: userId || null,
          guest_id: userId ? null : getGuestId(),
          page_path: path,
          page_title: document.title,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
          language: navigator.language,
          screen_width: window.innerWidth,
          screen_height: window.innerHeight,
          country: detectCountry(),
        });
      } catch (e) {
        // Silent fail for tracking
      }
    };
    track();
  }, [location.pathname, userId]);
};
