// Comprehensive country/team -> flag emoji map.
// Single source of truth used by TripWizard, ItinerarySchedule, EventsPage,
// PromotionDetailPage, etc. Keep additions here only.

export const TEAM_FLAGS: Record<string, string> = {
  // GCC & Arab world
  "saudi arabia": "🇸🇦", "saudi": "🇸🇦", "ksa": "🇸🇦", "السعودية": "🇸🇦", "المنتخب السعودي": "🇸🇦",
  "egypt": "🇪🇬", "مصر": "🇪🇬",
  "morocco": "🇲🇦", "المغرب": "🇲🇦",
  "tunisia": "🇹🇳", "تونس": "🇹🇳",
  "algeria": "🇩🇿", "الجزائر": "🇩🇿",
  "libya": "🇱🇾", "ليبيا": "🇱🇾",
  "qatar": "🇶🇦", "قطر": "🇶🇦",
  "uae": "🇦🇪", "united arab emirates": "🇦🇪", "emirates": "🇦🇪", "الإمارات": "🇦🇪",
  "kuwait": "🇰🇼", "الكويت": "🇰🇼",
  "bahrain": "🇧🇭", "البحرين": "🇧🇭",
  "oman": "🇴🇲", "عمان": "🇴🇲", "سلطنة عمان": "🇴🇲",
  "yemen": "🇾🇪", "اليمن": "🇾🇪",
  "iraq": "🇮🇶", "العراق": "🇮🇶",
  "jordan": "🇯🇴", "الأردن": "🇯🇴",
  "lebanon": "🇱🇧", "لبنان": "🇱🇧",
  "syria": "🇸🇾", "سوريا": "🇸🇾",
  "palestine": "🇵🇸", "فلسطين": "🇵🇸",
  "sudan": "🇸🇩", "السودان": "🇸🇩",
  "mauritania": "🇲🇷", "موريتانيا": "🇲🇷",
  "iran": "🇮🇷", "إيران": "🇮🇷",
  // Asia & Oceania
  "japan": "🇯🇵", "اليابان": "🇯🇵",
  "south korea": "🇰🇷", "korea republic": "🇰🇷", "republic of korea": "🇰🇷", "كوريا الجنوبية": "🇰🇷", "كوريا": "🇰🇷",
  "north korea": "🇰🇵", "كوريا الشمالية": "🇰🇵",
  "china": "🇨🇳", "pr china": "🇨🇳", "الصين": "🇨🇳",
  "australia": "🇦🇺", "أستراليا": "🇦🇺",
  "new zealand": "🇳🇿", "نيوزيلندا": "🇳🇿",
  "uzbekistan": "🇺🇿", "أوزبكستان": "🇺🇿",
  "thailand": "🇹🇭", "تايلاند": "🇹🇭",
  "vietnam": "🇻🇳", "فيتنام": "🇻🇳",
  "indonesia": "🇮🇩", "إندونيسيا": "🇮🇩",
  "malaysia": "🇲🇾", "ماليزيا": "🇲🇾",
  "india": "🇮🇳", "الهند": "🇮🇳",
  "pakistan": "🇵🇰", "باكستان": "🇵🇰",
  "bangladesh": "🇧🇩", "بنغلاديش": "🇧🇩",
  // Americas
  "usa": "🇺🇸", "united states": "🇺🇸", "america": "🇺🇸", "أمريكا": "🇺🇸", "الولايات المتحدة": "🇺🇸",
  "canada": "🇨🇦", "كندا": "🇨🇦",
  "mexico": "🇲🇽", "المكسيك": "🇲🇽",
  "brazil": "🇧🇷", "البرازيل": "🇧🇷",
  "argentina": "🇦🇷", "الأرجنتين": "🇦🇷",
  "uruguay": "🇺🇾", "الأوروغواي": "🇺🇾",
  "colombia": "🇨🇴", "كولومبيا": "🇨🇴",
  "chile": "🇨🇱", "تشيلي": "🇨🇱",
  "ecuador": "🇪🇨", "الإكوادور": "🇪🇨",
  "peru": "🇵🇪", "بيرو": "🇵🇪",
  "paraguay": "🇵🇾", "باراغواي": "🇵🇾",
  "panama": "🇵🇦", "بنما": "🇵🇦",
  "costa rica": "🇨🇷", "كوستاريكا": "🇨🇷",
  "honduras": "🇭🇳", "هندوراس": "🇭🇳",
  "jamaica": "🇯🇲", "جامايكا": "🇯🇲",
  "el salvador": "🇸🇻", "السلفادور": "🇸🇻",
  "guatemala": "🇬🇹", "غواتيمالا": "🇬🇹",
  "trinidad and tobago": "🇹🇹", "ترينيداد وتوباغو": "🇹🇹",
  "haiti": "🇭🇹", "هايتي": "🇭🇹",
  "cuba": "🇨🇺", "كوبا": "🇨🇺",
  "venezuela": "🇻🇪", "فنزويلا": "🇻🇪",
  "bolivia": "🇧🇴", "بوليفيا": "🇧🇴",
  // Europe
  "england": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "إنجلترا": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "اسكتلندا": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "ويلز": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "northern ireland": "🇬🇧", "أيرلندا الشمالية": "🇬🇧",
  "united kingdom": "🇬🇧", "uk": "🇬🇧", "بريطانيا": "🇬🇧", "المملكة المتحدة": "🇬🇧",
  "ireland": "🇮🇪", "أيرلندا": "🇮🇪",
  "france": "🇫🇷", "فرنسا": "🇫🇷",
  "germany": "🇩🇪", "ألمانيا": "🇩🇪",
  "spain": "🇪🇸", "إسبانيا": "🇪🇸", "اسبانيا": "🇪🇸",
  "portugal": "🇵🇹", "البرتغال": "🇵🇹",
  "italy": "🇮🇹", "إيطاليا": "🇮🇹",
  "netherlands": "🇳🇱", "holland": "🇳🇱", "هولندا": "🇳🇱",
  "belgium": "🇧🇪", "بلجيكا": "🇧🇪",
  "switzerland": "🇨🇭", "سويسرا": "🇨🇭",
  "austria": "🇦🇹", "النمسا": "🇦🇹",
  "denmark": "🇩🇰", "الدنمارك": "🇩🇰",
  "sweden": "🇸🇪", "السويد": "🇸🇪",
  "norway": "🇳🇴", "النرويج": "🇳🇴",
  "iceland": "🇮🇸", "أيسلندا": "🇮🇸",
  "finland": "🇫🇮", "فنلندا": "🇫🇮",
  "poland": "🇵🇱", "بولندا": "🇵🇱",
  "czech republic": "🇨🇿", "czechia": "🇨🇿", "التشيك": "🇨🇿", "جمهورية التشيك": "🇨🇿",
  "slovakia": "🇸🇰", "سلوفاكيا": "🇸🇰",
  "slovenia": "🇸🇮", "سلوفينيا": "🇸🇮",
  "croatia": "🇭🇷", "كرواتيا": "🇭🇷",
  "serbia": "🇷🇸", "صربيا": "🇷🇸",
  "albania": "🇦🇱", "ألبانيا": "🇦🇱",
  "bosnia and herzegovina": "🇧🇦", "bosnia": "🇧🇦", "البوسنة والهرسك": "🇧🇦",
  "north macedonia": "🇲🇰", "مقدونيا الشمالية": "🇲🇰", "macedonia": "🇲🇰",
  "montenegro": "🇲🇪", "الجبل الأسود": "🇲🇪",
  "kosovo": "🇽🇰", "كوسوفو": "🇽🇰",
  "hungary": "🇭🇺", "المجر": "🇭🇺",
  "romania": "🇷🇴", "رومانيا": "🇷🇴",
  "bulgaria": "🇧🇬", "بلغاريا": "🇧🇬",
  "greece": "🇬🇷", "اليونان": "🇬🇷",
  "turkey": "🇹🇷", "türkiye": "🇹🇷", "تركيا": "🇹🇷",
  "russia": "🇷🇺", "روسيا": "🇷🇺",
  "ukraine": "🇺🇦", "أوكرانيا": "🇺🇦",
  "belarus": "🇧🇾", "بيلاروسيا": "🇧🇾",
  // Africa
  "south africa": "🇿🇦", "جنوب أفريقيا": "🇿🇦", "جنوب افريقيا": "🇿🇦",
  "nigeria": "🇳🇬", "نيجيريا": "🇳🇬",
  "ghana": "🇬🇭", "غانا": "🇬🇭",
  "senegal": "🇸🇳", "السنغال": "🇸🇳",
  "ivory coast": "🇨🇮", "côte d'ivoire": "🇨🇮", "cote d'ivoire": "🇨🇮", "ساحل العاج": "🇨🇮",
  "cameroon": "🇨🇲", "الكاميرون": "🇨🇲",
  "kenya": "🇰🇪", "كينيا": "🇰🇪",
  "ethiopia": "🇪🇹", "إثيوبيا": "🇪🇹",
  "mali": "🇲🇱", "مالي": "🇲🇱",
  "burkina faso": "🇧🇫", "بوركينا فاسو": "🇧🇫",
  "dr congo": "🇨🇩", "congo dr": "🇨🇩", "democratic republic of congo": "🇨🇩", "الكونغو الديمقراطية": "🇨🇩",
  "cape verde": "🇨🇻", "الرأس الأخضر": "🇨🇻",
  "tanzania": "🇹🇿", "تنزانيا": "🇹🇿",
  "uganda": "🇺🇬", "أوغندا": "🇺🇬",
  "zambia": "🇿🇲", "زامبيا": "🇿🇲",
  "zimbabwe": "🇿🇼", "زيمبابوي": "🇿🇼",
  "angola": "🇦🇴", "أنغولا": "🇦🇴",
};

const normalize = (s: string) =>
  String(s || "")
    .toLowerCase()
    .trim()
    // strip leading/trailing common decorations
    // Strip leading/trailing decorations only (anchored), preserve internal spaces
    .replace(/^[•·\-—–|\s]+|[•·\-—–|\s]+$/g, "")
    .replace(/\s+/g, " ");

/** Resolve a country/team name to a flag emoji. Returns 🏳️ if unknown. */
export const getTeamFlag = (team: string): string => {
  const key = normalize(team);
  if (!key) return "🏳️";
  if (TEAM_FLAGS[key]) return TEAM_FLAGS[key];
  // Fuzzy: substring (e.g. "south korea team" → 🇰🇷)
  for (const [name, flag] of Object.entries(TEAM_FLAGS)) {
    if (name.length >= 3 && (key.includes(name) || name.includes(key))) return flag;
  }
  return "🏳️";
};

/** Treat 🏳️ / "" / undefined as missing so callers can re-resolve from the team name. */
export const isMissingFlag = (flag?: string) => {
  const v = String(flag || "").trim();
  return !v || v === "🏳️" || v === "🏳" || v === "🏳️‍🌈"; // also if rainbow accidentally crept in
};
