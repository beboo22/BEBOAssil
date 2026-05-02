// Localized labels for trip-planning interests and meals across all supported UI languages.
// Used by per-day preference cards (ItinerarySchedule) and the trip-wide Preference
// Verification panel (ItineraryPage) so backend-emitted English/Arabic strings always
// render in the active UI language.

export type SupportedLang = 'en' | 'ar' | 'fr' | 'es' | 'de' | 'ru' | 'zh' | 'ur';

export const resolveLang = (language?: string): SupportedLang => {
  const code = (language || 'en').slice(0, 2).toLowerCase();
  return (['en', 'ar', 'fr', 'es', 'de', 'ru', 'zh', 'ur'] as const).includes(code as SupportedLang)
    ? (code as SupportedLang)
    : 'en';
};

const INTEREST_MAP: Record<string, { icon: string } & Record<SupportedLang, string>> = {
  relaxation: { icon: '🌿', en: 'Relaxation', ar: 'استرخاء', fr: 'Détente', es: 'Relajación', de: 'Entspannung', ru: 'Отдых', zh: '放松', ur: 'آرام' },
  wellness:   { icon: '🧘', en: 'Wellness', ar: 'استرخاء', fr: 'Bien-être', es: 'Bienestar', de: 'Wellness', ru: 'Велнес', zh: '健康', ur: 'تندرستی' },
  nature:     { icon: '🌲', en: 'Nature', ar: 'طبيعة', fr: 'Nature', es: 'Naturaleza', de: 'Natur', ru: 'Природа', zh: '自然', ur: 'فطرت' },
  shopping:   { icon: '🛍️', en: 'Shopping', ar: 'تسوق', fr: 'Shopping', es: 'Compras', de: 'Einkaufen', ru: 'Шопинг', zh: '购物', ur: 'خریداری' },
  culture:    { icon: '🏛️', en: 'Culture & History', ar: 'ثقافة وتاريخ', fr: 'Culture & Histoire', es: 'Cultura e Historia', de: 'Kultur & Geschichte', ru: 'Культура и история', zh: '文化与历史', ur: 'ثقافت و تاریخ' },
  cultural:   { icon: '🏛️', en: 'Culture & History', ar: 'ثقافة وتاريخ', fr: 'Culture & Histoire', es: 'Cultura e Historia', de: 'Kultur & Geschichte', ru: 'Культура и история', zh: '文化与历史', ur: 'ثقافت و تاریخ' },
  history:    { icon: '🏛️', en: 'History', ar: 'تاريخ', fr: 'Histoire', es: 'Historia', de: 'Geschichte', ru: 'История', zh: '历史', ur: 'تاریخ' },
  beaches:    { icon: '🏖️', en: 'Beaches', ar: 'شواطئ', fr: 'Plages', es: 'Playas', de: 'Strände', ru: 'Пляжи', zh: '海滩', ur: 'ساحل' },
  adventure:  { icon: '🧗', en: 'Adventure', ar: 'مغامرات', fr: 'Aventure', es: 'Aventura', de: 'Abenteuer', ru: 'Приключения', zh: '冒险', ur: 'مہم جوئی' },
  art:        { icon: '🎨', en: 'Art & Museums', ar: 'فن ومتاحف', fr: 'Art & Musées', es: 'Arte y Museos', de: 'Kunst & Museen', ru: 'Искусство и музеи', zh: '艺术与博物馆', ur: 'فن و عجائب گھر' },
  entertainment: { icon: '🎡', en: 'Entertainment', ar: 'ترفيه', fr: 'Divertissement', es: 'Entretenimiento', de: 'Unterhaltung', ru: 'Развлечения', zh: '娱乐', ur: 'تفریح' },
  nightlife:  { icon: '🌃', en: 'Nightlife', ar: 'حياة ليلية', fr: 'Vie nocturne', es: 'Vida nocturna', de: 'Nachtleben', ru: 'Ночная жизнь', zh: '夜生活', ur: 'شب زندگی' },
  sports:     { icon: '⚽', en: 'Sports', ar: 'رياضة', fr: 'Sports', es: 'Deportes', de: 'Sport', ru: 'Спорт', zh: '体育', ur: 'کھیل' },
  food:       { icon: '🍽️', en: 'Food', ar: 'طعام', fr: 'Gastronomie', es: 'Comida', de: 'Essen', ru: 'Еда', zh: '美食', ur: 'کھانا' },
};

const MEAL_MAP: Record<string, { icon: string } & Record<SupportedLang, string>> = {
  breakfast: { icon: '🍳', en: 'Breakfast', ar: 'فطور', fr: 'Petit-déj.', es: 'Desayuno', de: 'Frühstück', ru: 'Завтрак', zh: '早餐', ur: 'ناشتہ' },
  lunch:     { icon: '🥗', en: 'Lunch', ar: 'غداء', fr: 'Déjeuner', es: 'Almuerzo', de: 'Mittag', ru: 'Обед', zh: '午餐', ur: 'دوپہر' },
  dinner:    { icon: '🍲', en: 'Dinner', ar: 'عشاء', fr: 'Dîner', es: 'Cena', de: 'Abend', ru: 'Ужин', zh: '晚餐', ur: 'رات' },
  snack:     { icon: '🍿', en: 'Snack', ar: 'وجبة خفيفة', fr: 'Collation', es: 'Snack', de: 'Snack', ru: 'Перекус', zh: '小吃', ur: 'ہلکا' },
};

export const localizeInterest = (key: string, language?: string, withIcon = true): string => {
  const lang = resolveLang(language);
  const entry = INTEREST_MAP[String(key || '').toLowerCase().trim()];
  if (!entry) return key;
  return withIcon ? `${entry.icon} ${entry[lang]}` : entry[lang];
};

export const localizeMeal = (key: string, language?: string, withIcon = true): string => {
  const lang = resolveLang(language);
  const entry = MEAL_MAP[String(key || '').toLowerCase().trim()];
  if (!entry) return key;
  return withIcon ? `${entry.icon} ${entry[lang]}` : entry[lang];
};

export const isMealKey = (key: string): boolean =>
  ['breakfast', 'lunch', 'dinner', 'snack', 'snacks'].includes(String(key || '').toLowerCase().trim());

// Replace ar/en backend reason text with a fully localized version derived from
// matchedCount + the canonical key.
export const localizePreferenceReason = (
  args: { key: string; matched: boolean; matchedCount?: number; language?: string }
): string => {
  const lang = resolveLang(args.language);
  const k = String(args.key || '').toLowerCase().trim();
  const isMeal = isMealKey(k);
  const label = isMeal
    ? localizeMeal(k === 'snacks' ? 'snack' : k, lang, false)
    : localizeInterest(k, lang, false);
  const n = Math.max(0, Number(args.matchedCount) || 0);

  if (isMeal) {
    if (args.matched) {
      switch (lang) {
        case 'ar': return `تمت إضافة ${label}`;
        case 'fr': return `${label} ajouté`;
        case 'es': return `${label} añadido`;
        case 'de': return `${label} hinzugefügt`;
        case 'ru': return `${label} добавлено`;
        case 'zh': return `已添加${label}`;
        case 'ur': return `${label} شامل کر دیا گیا`;
        default:   return `${label} added`;
      }
    }
    switch (lang) {
      case 'ar': return `لم تتم إضافة ${label}`;
      case 'fr': return `${label} non ajouté`;
      case 'es': return `${label} no añadido`;
      case 'de': return `${label} nicht hinzugefügt`;
      case 'ru': return `${label} не добавлено`;
      case 'zh': return `未添加${label}`;
      case 'ur': return `${label} شامل نہیں کیا گیا`;
      default:   return `${label} not added`;
    }
  }

  if (args.matched) {
    switch (lang) {
      case 'ar': return `تم العثور على ${n} نشاط يطابق ${label}`;
      case 'fr': return `${n} activité(s) correspondent à ${label}`;
      case 'es': return `${n} actividad(es) coinciden con ${label}`;
      case 'de': return `${n} Aktivität(en) passen zu ${label}`;
      case 'ru': return `Найдено активностей по «${label}»: ${n}`;
      case 'zh': return `找到 ${n} 项符合「${label}」的活动`;
      case 'ur': return `${label} سے مماثل ${n} سرگرمی ملی`;
      default:   return `${n} matching item(s) found for ${label}`;
    }
  }
  switch (lang) {
    case 'ar': return `لم يتم العثور على نشاط يطابق ${label}`;
    case 'fr': return `Aucune activité ne correspond à ${label}`;
    case 'es': return `Ninguna actividad coincide con ${label}`;
    case 'de': return `Keine Aktivität passt zu ${label}`;
    case 'ru': return `Не найдено активностей по «${label}»`;
    case 'zh': return `未找到符合「${label}」的活动`;
    case 'ur': return `${label} سے کوئی مماثل سرگرمی نہیں ملی`;
    default:   return `No items matched ${label}`;
  }
};
