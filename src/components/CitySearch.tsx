
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { MapPin, Search, X, ArrowRight, Globe2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Localized hint shown at the bottom of the dropdown letting users know they
// can search any of 50,000+ cities worldwide (the curated list is just the
// most popular tourist destinations — full global database is searchable).
const SEARCH_ALL_CITIES_HINT: Record<string, string> = {
  ar: 'يمكنك البحث في أكثر من 50,000 مدينة حول العالم — اكتب الاسم لإظهارها',
  en: 'Search 50,000+ cities worldwide — just type any city name',
  fr: 'Recherchez parmi plus de 50 000 villes — tapez n\'importe quel nom',
  es: 'Busca entre más de 50.000 ciudades — escribe cualquier nombre',
  de: 'Suche in über 50.000 Städten weltweit — gib einen Namen ein',
  tr: 'Dünyada 50.000+ şehri arayın — herhangi bir adı yazın',
  ru: 'Поиск более чем по 50 000 городам — введите любое название',
  zh: '搜索全球 50,000+ 个城市 — 输入任意城市名称',
  ja: '世界5万以上の都市を検索 — 都市名を入力してください',
};

interface CitySearchProps {
  onSelect: (city: string) => void;
  placeholder?: string;
  initialValue?: string;
  combined?: boolean;
  departureValue?: string;
  destinationValue?: string;
  onDepartureSelect?: (city: string) => void;
  onDestinationSelect?: (city: string) => void;
}

interface CityEntry {
  name: string;
  nameAr: string;
  country: string;
  countryAr: string;
  iata?: string;
  aliases?: string[];
}

const worldCitiesData: CityEntry[] = [
  // Middle East
  { name: 'Jeddah', nameAr: 'جدة', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'JED', aliases: ['جده', 'Jiddah'] },
  { name: 'Riyadh', nameAr: 'الرياض', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'RUH', aliases: ['رياض'] },
  { name: 'Mecca', nameAr: 'مكة المكرمة', country: 'Saudi Arabia', countryAr: 'السعودية', aliases: ['مكه', 'Makkah'] },
  { name: 'Medina', nameAr: 'المدينة المنورة', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'MED', aliases: ['المدينه', 'Madinah'] },
  { name: 'Dammam', nameAr: 'الدمام', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'DMM' },
  { name: 'Tabuk', nameAr: 'تبوك', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'TUU' },
  { name: 'Abha', nameAr: 'أبها', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'AHB' },
  { name: 'Taif', nameAr: 'الطائف', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'TIF', aliases: ['طائف'] },
  { name: 'Al Khobar', nameAr: 'الخبر', country: 'Saudi Arabia', countryAr: 'السعودية' },
  { name: 'Dubai', nameAr: 'دبي', country: 'UAE', countryAr: 'الإمارات', iata: 'DXB', aliases: ['دبى'] },
  { name: 'Abu Dhabi', nameAr: 'أبوظبي', country: 'UAE', countryAr: 'الإمارات', iata: 'AUH', aliases: ['ابوظبي'] },
  { name: 'Sharjah', nameAr: 'الشارقة', country: 'UAE', countryAr: 'الإمارات', iata: 'SHJ' },
  { name: 'Doha', nameAr: 'الدوحة', country: 'Qatar', countryAr: 'قطر', iata: 'DOH', aliases: ['الدوحه'] },
  { name: 'Muscat', nameAr: 'مسقط', country: 'Oman', countryAr: 'عمان', iata: 'MCT' },
  { name: 'Manama', nameAr: 'المنامة', country: 'Bahrain', countryAr: 'البحرين', iata: 'BAH', aliases: ['المنامه'] },
  { name: 'Kuwait City', nameAr: 'مدينة الكويت', country: 'Kuwait', countryAr: 'الكويت', iata: 'KWI', aliases: ['الكويت'] },
  { name: 'Amman', nameAr: 'عمّان', country: 'Jordan', countryAr: 'الأردن', iata: 'AMM', aliases: ['عمان'] },
  { name: 'Beirut', nameAr: 'بيروت', country: 'Lebanon', countryAr: 'لبنان', iata: 'BEY' },
  { name: 'Baghdad', nameAr: 'بغداد', country: 'Iraq', countryAr: 'العراق', iata: 'BGW' },
  { name: 'Erbil', nameAr: 'أربيل', country: 'Iraq', countryAr: 'العراق', iata: 'EBL' },
  { name: 'Tehran', nameAr: 'طهران', country: 'Iran', countryAr: 'إيران', iata: 'IKA' },
  { name: 'Jerusalem', nameAr: 'القدس', country: 'Palestine', countryAr: 'فلسطين' },
  { name: 'Tel Aviv', nameAr: 'تل أبيب', country: 'Israel', countryAr: 'إسرائيل', iata: 'TLV' },
  { name: 'Damascus', nameAr: 'دمشق', country: 'Syria', countryAr: 'سوريا', iata: 'DAM' },
  { name: 'Sana\'a', nameAr: 'صنعاء', country: 'Yemen', countryAr: 'اليمن', iata: 'SAH' },
  { name: 'Aden', nameAr: 'عدن', country: 'Yemen', countryAr: 'اليمن', iata: 'ADE' },

  // North Africa
  { name: 'Cairo', nameAr: 'القاهرة', country: 'Egypt', countryAr: 'مصر', iata: 'CAI', aliases: ['القاهره'] },
  { name: 'Alexandria', nameAr: 'الإسكندرية', country: 'Egypt', countryAr: 'مصر', iata: 'HBE', aliases: ['الاسكندريه', 'الاسكندرية'] },
  { name: 'Sharm El Sheikh', nameAr: 'شرم الشيخ', country: 'Egypt', countryAr: 'مصر', iata: 'SSH' },
  { name: 'Hurghada', nameAr: 'الغردقة', country: 'Egypt', countryAr: 'مصر', iata: 'HRG', aliases: ['الغردقه'] },
  { name: 'Luxor', nameAr: 'الأقصر', country: 'Egypt', countryAr: 'مصر', iata: 'LXR' },
  { name: 'Casablanca', nameAr: 'الدار البيضاء', country: 'Morocco', countryAr: 'المغرب', iata: 'CMN' },
  { name: 'Marrakech', nameAr: 'مراكش', country: 'Morocco', countryAr: 'المغرب', iata: 'RAK' },
  { name: 'Tunis', nameAr: 'تونس', country: 'Tunisia', countryAr: 'تونس', iata: 'TUN' },
  { name: 'Algiers', nameAr: 'الجزائر', country: 'Algeria', countryAr: 'الجزائر', iata: 'ALG' },
  { name: 'Tripoli', nameAr: 'طرابلس', country: 'Libya', countryAr: 'ليبيا', iata: 'TIP' },
  { name: 'Khartoum', nameAr: 'الخرطوم', country: 'Sudan', countryAr: 'السودان', iata: 'KRT' },

  // Europe
  { name: 'Paris', nameAr: 'باريس', country: 'France', countryAr: 'فرنسا', iata: 'CDG' },
  { name: 'London', nameAr: 'لندن', country: 'UK', countryAr: 'بريطانيا', iata: 'LHR' },
  { name: 'Rome', nameAr: 'روما', country: 'Italy', countryAr: 'إيطاليا', iata: 'FCO' },
  { name: 'Barcelona', nameAr: 'برشلونة', country: 'Spain', countryAr: 'إسبانيا', iata: 'BCN', aliases: ['برشلونه'] },
  { name: 'Madrid', nameAr: 'مدريد', country: 'Spain', countryAr: 'إسبانيا', iata: 'MAD' },
  { name: 'Amsterdam', nameAr: 'أمستردام', country: 'Netherlands', countryAr: 'هولندا', iata: 'AMS' },
  { name: 'Berlin', nameAr: 'برلين', country: 'Germany', countryAr: 'ألمانيا', iata: 'BER' },
  { name: 'Munich', nameAr: 'ميونخ', country: 'Germany', countryAr: 'ألمانيا', iata: 'MUC' },
  { name: 'Frankfurt', nameAr: 'فرانكفورت', country: 'Germany', countryAr: 'ألمانيا', iata: 'FRA' },
  { name: 'Vienna', nameAr: 'فيينا', country: 'Austria', countryAr: 'النمسا', iata: 'VIE' },
  { name: 'Prague', nameAr: 'براغ', country: 'Czech Republic', countryAr: 'التشيك', iata: 'PRG' },
  { name: 'Budapest', nameAr: 'بودابست', country: 'Hungary', countryAr: 'المجر', iata: 'BUD' },
  { name: 'Athens', nameAr: 'أثينا', country: 'Greece', countryAr: 'اليونان', iata: 'ATH' },
  { name: 'Istanbul', nameAr: 'إسطنبول', country: 'Turkey', countryAr: 'تركيا', iata: 'IST', aliases: ['اسطنبول', 'استانبول'] },
  { name: 'Antalya', nameAr: 'أنطاليا', country: 'Turkey', countryAr: 'تركيا', iata: 'AYT', aliases: ['انطاليا'] },
  { name: 'Trabzon', nameAr: 'طرابزون', country: 'Turkey', countryAr: 'تركيا', iata: 'TZX' },
  { name: 'Bodrum', nameAr: 'بودروم', country: 'Turkey', countryAr: 'تركيا', iata: 'BJV' },
  { name: 'Lisbon', nameAr: 'لشبونة', country: 'Portugal', countryAr: 'البرتغال', iata: 'LIS', aliases: ['لشبونه'] },
  { name: 'Dublin', nameAr: 'دبلن', country: 'Ireland', countryAr: 'أيرلندا', iata: 'DUB' },
  { name: 'Edinburgh', nameAr: 'إدنبرة', country: 'UK', countryAr: 'بريطانيا', iata: 'EDI', aliases: ['ادنبره'] },
  { name: 'Brussels', nameAr: 'بروكسل', country: 'Belgium', countryAr: 'بلجيكا', iata: 'BRU' },
  { name: 'Copenhagen', nameAr: 'كوبنهاغن', country: 'Denmark', countryAr: 'الدنمارك', iata: 'CPH' },
  { name: 'Oslo', nameAr: 'أوسلو', country: 'Norway', countryAr: 'النرويج', iata: 'OSL' },
  { name: 'Stockholm', nameAr: 'ستوكهولم', country: 'Sweden', countryAr: 'السويد', iata: 'ARN' },
  { name: 'Helsinki', nameAr: 'هلسنكي', country: 'Finland', countryAr: 'فنلندا', iata: 'HEL' },
  { name: 'Warsaw', nameAr: 'وارسو', country: 'Poland', countryAr: 'بولندا', iata: 'WAW' },
  { name: 'Krakow', nameAr: 'كراكوف', country: 'Poland', countryAr: 'بولندا', iata: 'KRK' },
  { name: 'Moscow', nameAr: 'موسكو', country: 'Russia', countryAr: 'روسيا', iata: 'SVO' },
  { name: 'Zurich', nameAr: 'زيورخ', country: 'Switzerland', countryAr: 'سويسرا', iata: 'ZRH' },
  { name: 'Geneva', nameAr: 'جنيف', country: 'Switzerland', countryAr: 'سويسرا', iata: 'GVA' },
  { name: 'Milan', nameAr: 'ميلان', country: 'Italy', countryAr: 'إيطاليا', iata: 'MXP' },
  { name: 'Florence', nameAr: 'فلورنسا', country: 'Italy', countryAr: 'إيطاليا', iata: 'FLR' },
  { name: 'Venice', nameAr: 'فينيسيا', country: 'Italy', countryAr: 'إيطاليا', iata: 'VCE', aliases: ['البندقية'] },

  // Asia
  { name: 'Tokyo', nameAr: 'طوكيو', country: 'Japan', countryAr: 'اليابان', iata: 'NRT' },
  { name: 'Osaka', nameAr: 'أوساكا', country: 'Japan', countryAr: 'اليابان', iata: 'KIX' },
  { name: 'Kyoto', nameAr: 'كيوتو', country: 'Japan', countryAr: 'اليابان' },
  { name: 'Singapore', nameAr: 'سنغافورة', country: 'Singapore', countryAr: 'سنغافورة', iata: 'SIN' },
  { name: 'Hong Kong', nameAr: 'هونغ كونغ', country: 'China', countryAr: 'الصين', iata: 'HKG' },
  { name: 'Beijing', nameAr: 'بكين', country: 'China', countryAr: 'الصين', iata: 'PEK' },
  { name: 'Shanghai', nameAr: 'شنغهاي', country: 'China', countryAr: 'الصين', iata: 'PVG' },
  { name: 'Seoul', nameAr: 'سيول', country: 'South Korea', countryAr: 'كوريا الجنوبية', iata: 'ICN' },
  { name: 'Bangkok', nameAr: 'بانكوك', country: 'Thailand', countryAr: 'تايلاند', iata: 'BKK' },
  { name: 'Phuket', nameAr: 'بوكيت', country: 'Thailand', countryAr: 'تايلاند', iata: 'HKT' },
  { name: 'Kuala Lumpur', nameAr: 'كوالالمبور', country: 'Malaysia', countryAr: 'ماليزيا', iata: 'KUL' },
  { name: 'Bali', nameAr: 'بالي', country: 'Indonesia', countryAr: 'إندونيسيا', iata: 'DPS' },
  { name: 'Jakarta', nameAr: 'جاكرتا', country: 'Indonesia', countryAr: 'إندونيسيا', iata: 'CGK' },
  { name: 'Mumbai', nameAr: 'مومباي', country: 'India', countryAr: 'الهند', iata: 'BOM' },
  { name: 'Delhi', nameAr: 'دلهي', country: 'India', countryAr: 'الهند', iata: 'DEL' },
  { name: 'Manila', nameAr: 'مانيلا', country: 'Philippines', countryAr: 'الفلبين', iata: 'MNL' },
  { name: 'Taipei', nameAr: 'تايبيه', country: 'Taiwan', countryAr: 'تايوان', iata: 'TPE' },
  { name: 'Ho Chi Minh City', nameAr: 'هو تشي منه', country: 'Vietnam', countryAr: 'فيتنام', iata: 'SGN' },
  { name: 'Hanoi', nameAr: 'هانوي', country: 'Vietnam', countryAr: 'فيتنام', iata: 'HAN' },
  { name: 'Colombo', nameAr: 'كولومبو', country: 'Sri Lanka', countryAr: 'سريلانكا', iata: 'CMB' },
  { name: 'Kathmandu', nameAr: 'كاتماندو', country: 'Nepal', countryAr: 'نيبال', iata: 'KTM' },

  // Africa
  { name: 'Lagos', nameAr: 'لاغوس', country: 'Nigeria', countryAr: 'نيجيريا', iata: 'LOS' },
  { name: 'Nairobi', nameAr: 'نيروبي', country: 'Kenya', countryAr: 'كينيا', iata: 'NBO' },
  { name: 'Cape Town', nameAr: 'كيب تاون', country: 'South Africa', countryAr: 'جنوب أفريقيا', iata: 'CPT' },
  { name: 'Johannesburg', nameAr: 'جوهانسبرغ', country: 'South Africa', countryAr: 'جنوب أفريقيا', iata: 'JNB' },
  { name: 'Addis Ababa', nameAr: 'أديس أبابا', country: 'Ethiopia', countryAr: 'إثيوبيا', iata: 'ADD' },
  { name: 'Dar es Salaam', nameAr: 'دار السلام', country: 'Tanzania', countryAr: 'تنزانيا', iata: 'DAR' },
  { name: 'Accra', nameAr: 'أكرا', country: 'Ghana', countryAr: 'غانا', iata: 'ACC' },

  // North America
  { name: 'New York', nameAr: 'نيويورك', country: 'USA', countryAr: 'أمريكا', iata: 'JFK', aliases: ['NYC'] },
  { name: 'Los Angeles', nameAr: 'لوس أنجلوس', country: 'USA', countryAr: 'أمريكا', iata: 'LAX', aliases: ['LA'] },
  { name: 'Chicago', nameAr: 'شيكاغو', country: 'USA', countryAr: 'أمريكا', iata: 'ORD' },
  { name: 'San Francisco', nameAr: 'سان فرانسيسكو', country: 'USA', countryAr: 'أمريكا', iata: 'SFO', aliases: ['SF'] },
  { name: 'Las Vegas', nameAr: 'لاس فيغاس', country: 'USA', countryAr: 'أمريكا', iata: 'LAS' },
  { name: 'Miami', nameAr: 'ميامي', country: 'USA', countryAr: 'أمريكا', iata: 'MIA' },
  { name: 'Washington D.C.', nameAr: 'واشنطن', country: 'USA', countryAr: 'أمريكا', iata: 'IAD' },
  { name: 'Toronto', nameAr: 'تورنتو', country: 'Canada', countryAr: 'كندا', iata: 'YYZ' },
  { name: 'Vancouver', nameAr: 'فانكوفر', country: 'Canada', countryAr: 'كندا', iata: 'YVR' },
  { name: 'Montreal', nameAr: 'مونتريال', country: 'Canada', countryAr: 'كندا', iata: 'YUL' },
  { name: 'Mexico City', nameAr: 'مكسيكو سيتي', country: 'Mexico', countryAr: 'المكسيك', iata: 'MEX' },
  { name: 'Cancun', nameAr: 'كانكون', country: 'Mexico', countryAr: 'المكسيك', iata: 'CUN' },

  // South America
  { name: 'Rio de Janeiro', nameAr: 'ريو دي جانيرو', country: 'Brazil', countryAr: 'البرازيل', iata: 'GIG' },
  { name: 'Sao Paulo', nameAr: 'ساو باولو', country: 'Brazil', countryAr: 'البرازيل', iata: 'GRU' },
  { name: 'Buenos Aires', nameAr: 'بوينس آيرس', country: 'Argentina', countryAr: 'الأرجنتين', iata: 'EZE' },
  { name: 'Lima', nameAr: 'ليما', country: 'Peru', countryAr: 'بيرو', iata: 'LIM' },
  { name: 'Santiago', nameAr: 'سانتياغو', country: 'Chile', countryAr: 'تشيلي', iata: 'SCL' },
  { name: 'Bogota', nameAr: 'بوغوتا', country: 'Colombia', countryAr: 'كولومبيا', iata: 'BOG' },

  // Oceania
  { name: 'Sydney', nameAr: 'سيدني', country: 'Australia', countryAr: 'أستراليا', iata: 'SYD' },
  { name: 'Melbourne', nameAr: 'ملبورن', country: 'Australia', countryAr: 'أستراليا', iata: 'MEL' },
  { name: 'Auckland', nameAr: 'أوكلاند', country: 'New Zealand', countryAr: 'نيوزيلندا', iata: 'AKL' },
  { name: 'Queenstown', nameAr: 'كوينزتاون', country: 'New Zealand', countryAr: 'نيوزيلندا', iata: 'ZQN' },
  { name: 'Honolulu', nameAr: 'هونولولو', country: 'USA', countryAr: 'أمريكا', iata: 'HNL' },

  // ── Expanded global tourist coverage (100+ curated) ──
  // Europe – extra
  { name: 'Naples', nameAr: 'نابولي', country: 'Italy', countryAr: 'إيطاليا', iata: 'NAP' },
  { name: 'Verona', nameAr: 'فيرونا', country: 'Italy', countryAr: 'إيطاليا', iata: 'VRN' },
  { name: 'Pisa', nameAr: 'بيزا', country: 'Italy', countryAr: 'إيطاليا', iata: 'PSA' },
  { name: 'Seville', nameAr: 'إشبيلية', country: 'Spain', countryAr: 'إسبانيا', iata: 'SVQ' },
  { name: 'Valencia', nameAr: 'فالنسيا', country: 'Spain', countryAr: 'إسبانيا', iata: 'VLC' },
  { name: 'Granada', nameAr: 'غرناطة', country: 'Spain', countryAr: 'إسبانيا', iata: 'GRX' },
  { name: 'Malaga', nameAr: 'مالقة', country: 'Spain', countryAr: 'إسبانيا', iata: 'AGP' },
  { name: 'Bilbao', nameAr: 'بلباو', country: 'Spain', countryAr: 'إسبانيا', iata: 'BIO' },
  { name: 'Porto', nameAr: 'بورتو', country: 'Portugal', countryAr: 'البرتغال', iata: 'OPO' },
  { name: 'Nice', nameAr: 'نيس', country: 'France', countryAr: 'فرنسا', iata: 'NCE' },
  { name: 'Lyon', nameAr: 'ليون', country: 'France', countryAr: 'فرنسا', iata: 'LYS' },
  { name: 'Marseille', nameAr: 'مرسيليا', country: 'France', countryAr: 'فرنسا', iata: 'MRS' },
  { name: 'Bordeaux', nameAr: 'بوردو', country: 'France', countryAr: 'فرنسا', iata: 'BOD' },
  { name: 'Cannes', nameAr: 'كان', country: 'France', countryAr: 'فرنسا' },
  { name: 'Hamburg', nameAr: 'هامبورغ', country: 'Germany', countryAr: 'ألمانيا', iata: 'HAM' },
  { name: 'Cologne', nameAr: 'كولونيا', country: 'Germany', countryAr: 'ألمانيا', iata: 'CGN' },
  { name: 'Düsseldorf', nameAr: 'دوسلدورف', country: 'Germany', countryAr: 'ألمانيا', iata: 'DUS' },
  { name: 'Salzburg', nameAr: 'سالزبورغ', country: 'Austria', countryAr: 'النمسا', iata: 'SZG' },
  { name: 'Innsbruck', nameAr: 'إنسبروك', country: 'Austria', countryAr: 'النمسا', iata: 'INN' },
  { name: 'Lucerne', nameAr: 'لوسيرن', country: 'Switzerland', countryAr: 'سويسرا' },
  { name: 'Interlaken', nameAr: 'إنترلاكن', country: 'Switzerland', countryAr: 'سويسرا' },
  { name: 'Bern', nameAr: 'برن', country: 'Switzerland', countryAr: 'سويسرا', iata: 'BRN' },
  { name: 'Bruges', nameAr: 'بروج', country: 'Belgium', countryAr: 'بلجيكا' },
  { name: 'Rotterdam', nameAr: 'روتردام', country: 'Netherlands', countryAr: 'هولندا', iata: 'RTM' },
  { name: 'Manchester', nameAr: 'مانشستر', country: 'UK', countryAr: 'بريطانيا', iata: 'MAN' },
  { name: 'Liverpool', nameAr: 'ليفربول', country: 'UK', countryAr: 'بريطانيا', iata: 'LPL' },
  { name: 'Glasgow', nameAr: 'غلاسكو', country: 'UK', countryAr: 'بريطانيا', iata: 'GLA' },
  { name: 'Santorini', nameAr: 'سانتوريني', country: 'Greece', countryAr: 'اليونان', iata: 'JTR' },
  { name: 'Mykonos', nameAr: 'ميكونوس', country: 'Greece', countryAr: 'اليونان', iata: 'JMK' },
  { name: 'Heraklion', nameAr: 'هيراكليون', country: 'Greece', countryAr: 'اليونان', iata: 'HER' },
  { name: 'Dubrovnik', nameAr: 'دوبروفنيك', country: 'Croatia', countryAr: 'كرواتيا', iata: 'DBV' },
  { name: 'Split', nameAr: 'سبليت', country: 'Croatia', countryAr: 'كرواتيا', iata: 'SPU' },
  { name: 'Zagreb', nameAr: 'زغرب', country: 'Croatia', countryAr: 'كرواتيا', iata: 'ZAG' },
  { name: 'Reykjavik', nameAr: 'ريكيافيك', country: 'Iceland', countryAr: 'آيسلندا', iata: 'KEF' },
  { name: 'Saint Petersburg', nameAr: 'سان بطرسبرغ', country: 'Russia', countryAr: 'روسيا', iata: 'LED' },
  { name: 'Cappadocia', nameAr: 'كابادوكيا', country: 'Turkey', countryAr: 'تركيا', iata: 'NAV' },
  { name: 'Izmir', nameAr: 'إزمير', country: 'Turkey', countryAr: 'تركيا', iata: 'ADB' },

  // Asia – extra
  { name: 'Sapporo', nameAr: 'سابورو', country: 'Japan', countryAr: 'اليابان', iata: 'CTS' },
  { name: 'Nagoya', nameAr: 'ناغويا', country: 'Japan', countryAr: 'اليابان', iata: 'NGO' },
  { name: 'Busan', nameAr: 'بوسان', country: 'South Korea', countryAr: 'كوريا الجنوبية', iata: 'PUS' },
  { name: 'Jeju', nameAr: 'جيجو', country: 'South Korea', countryAr: 'كوريا الجنوبية', iata: 'CJU' },
  { name: 'Macau', nameAr: 'ماكاو', country: 'China', countryAr: 'الصين', iata: 'MFM' },
  { name: 'Guangzhou', nameAr: 'قوانغتشو', country: 'China', countryAr: 'الصين', iata: 'CAN' },
  { name: 'Chengdu', nameAr: 'تشنغدو', country: 'China', countryAr: 'الصين', iata: 'CTU' },
  { name: 'Chiang Mai', nameAr: 'شيانغ ماي', country: 'Thailand', countryAr: 'تايلاند', iata: 'CNX' },
  { name: 'Pattaya', nameAr: 'باتايا', country: 'Thailand', countryAr: 'تايلاند' },
  { name: 'Krabi', nameAr: 'كرابي', country: 'Thailand', countryAr: 'تايلاند', iata: 'KBV' },
  { name: 'Penang', nameAr: 'بينانغ', country: 'Malaysia', countryAr: 'ماليزيا', iata: 'PEN' },
  { name: 'Langkawi', nameAr: 'لنكاوي', country: 'Malaysia', countryAr: 'ماليزيا', iata: 'LGK' },
  { name: 'Siem Reap', nameAr: 'سيم ريب', country: 'Cambodia', countryAr: 'كمبوديا', iata: 'REP' },
  { name: 'Phnom Penh', nameAr: 'بنوم بنه', country: 'Cambodia', countryAr: 'كمبوديا', iata: 'PNH' },
  { name: 'Da Nang', nameAr: 'دا نانغ', country: 'Vietnam', countryAr: 'فيتنام', iata: 'DAD' },
  { name: 'Bengaluru', nameAr: 'بنغالورو', country: 'India', countryAr: 'الهند', iata: 'BLR' },
  { name: 'Goa', nameAr: 'غوا', country: 'India', countryAr: 'الهند', iata: 'GOI' },
  { name: 'Jaipur', nameAr: 'جايبور', country: 'India', countryAr: 'الهند', iata: 'JAI' },
  { name: 'Agra', nameAr: 'أغرا', country: 'India', countryAr: 'الهند' },
  { name: 'Male', nameAr: 'ماليه', country: 'Maldives', countryAr: 'المالديف', iata: 'MLE' },

  // North America – extra
  { name: 'Boston', nameAr: 'بوسطن', country: 'USA', countryAr: 'أمريكا', iata: 'BOS' },
  { name: 'Seattle', nameAr: 'سياتل', country: 'USA', countryAr: 'أمريكا', iata: 'SEA' },
  { name: 'Orlando', nameAr: 'أورلاندو', country: 'USA', countryAr: 'أمريكا', iata: 'MCO' },
  { name: 'Dallas', nameAr: 'دالاس', country: 'USA', countryAr: 'أمريكا', iata: 'DFW' },
  { name: 'Houston', nameAr: 'هيوستن', country: 'USA', countryAr: 'أمريكا', iata: 'IAH' },
  { name: 'Atlanta', nameAr: 'أتلانتا', country: 'USA', countryAr: 'أمريكا', iata: 'ATL' },
  { name: 'Denver', nameAr: 'دنفر', country: 'USA', countryAr: 'أمريكا', iata: 'DEN' },
  { name: 'Phoenix', nameAr: 'فينيكس', country: 'USA', countryAr: 'أمريكا', iata: 'PHX' },
  { name: 'San Diego', nameAr: 'سان دييغو', country: 'USA', countryAr: 'أمريكا', iata: 'SAN' },
  { name: 'New Orleans', nameAr: 'نيو أورلينز', country: 'USA', countryAr: 'أمريكا', iata: 'MSY' },
  { name: 'Austin', nameAr: 'أوستن', country: 'USA', countryAr: 'أمريكا', iata: 'AUS' },
  { name: 'Calgary', nameAr: 'كالغاري', country: 'Canada', countryAr: 'كندا', iata: 'YYC' },
  { name: 'Quebec City', nameAr: 'مدينة كيبيك', country: 'Canada', countryAr: 'كندا', iata: 'YQB' },
  { name: 'Playa del Carmen', nameAr: 'بلايا ديل كارمن', country: 'Mexico', countryAr: 'المكسيك' },
  { name: 'Tulum', nameAr: 'تولوم', country: 'Mexico', countryAr: 'المكسيك' },

  // Latin America – extra
  { name: 'Cusco', nameAr: 'كوسكو', country: 'Peru', countryAr: 'بيرو', iata: 'CUZ' },
  { name: 'Cartagena', nameAr: 'كارتاخينا', country: 'Colombia', countryAr: 'كولومبيا', iata: 'CTG' },
  { name: 'Havana', nameAr: 'هافانا', country: 'Cuba', countryAr: 'كوبا', iata: 'HAV' },
  { name: 'Punta Cana', nameAr: 'بونتا كانا', country: 'Dominican Republic', countryAr: 'الدومينيكان', iata: 'PUJ' },
  { name: 'San Jose', nameAr: 'سان خوسيه', country: 'Costa Rica', countryAr: 'كوستاريكا', iata: 'SJO' },
  { name: 'Panama City', nameAr: 'مدينة بنما', country: 'Panama', countryAr: 'بنما', iata: 'PTY' },
  { name: 'Quito', nameAr: 'كيتو', country: 'Ecuador', countryAr: 'الإكوادور', iata: 'UIO' },

  // Africa – extra (no Arab cities per requirement)
  { name: 'Zanzibar', nameAr: 'زنجبار', country: 'Tanzania', countryAr: 'تنزانيا', iata: 'ZNZ' },
  { name: 'Mombasa', nameAr: 'مومباسا', country: 'Kenya', countryAr: 'كينيا', iata: 'MBA' },
  { name: 'Victoria Falls', nameAr: 'شلالات فيكتوريا', country: 'Zimbabwe', countryAr: 'زيمبابوي', iata: 'VFA' },
  { name: 'Kigali', nameAr: 'كيغالي', country: 'Rwanda', countryAr: 'رواندا', iata: 'KGL' },
  { name: 'Durban', nameAr: 'ديربان', country: 'South Africa', countryAr: 'جنوب أفريقيا', iata: 'DUR' },

  // Oceania – extra
  { name: 'Brisbane', nameAr: 'بريزبن', country: 'Australia', countryAr: 'أستراليا', iata: 'BNE' },
  { name: 'Perth', nameAr: 'بيرث', country: 'Australia', countryAr: 'أستراليا', iata: 'PER' },
  { name: 'Gold Coast', nameAr: 'غولد كوست', country: 'Australia', countryAr: 'أستراليا', iata: 'OOL' },
  { name: 'Wellington', nameAr: 'ولينغتون', country: 'New Zealand', countryAr: 'نيوزيلندا', iata: 'WLG' },
  { name: 'Nadi', nameAr: 'نادي', country: 'Fiji', countryAr: 'فيجي', iata: 'NAN' },
  { name: 'Papeete', nameAr: 'بابيتي', country: 'French Polynesia', countryAr: 'بولينيزيا الفرنسية', iata: 'PPT' },

  // ── Extra Arab cities (placed in the middle of the suggestion list via tier sort) ──
  { name: 'Yanbu', nameAr: 'ينبع', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'YNB' },
  { name: 'Hail', nameAr: 'حائل', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'HAS' },
  { name: 'Najran', nameAr: 'نجران', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'EAM' },
  { name: 'Jazan', nameAr: 'جازان', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'GIZ' },
  { name: 'AlUla', nameAr: 'العُلا', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'ULH', aliases: ['العلا', 'Al Ula'] },
  { name: 'NEOM', nameAr: 'نيوم', country: 'Saudi Arabia', countryAr: 'السعودية', iata: 'NUM' },
  { name: 'Buraidah', nameAr: 'بريدة', country: 'Saudi Arabia', countryAr: 'السعودية', aliases: ['بريده'] },
  { name: 'Al Ain', nameAr: 'العين', country: 'UAE', countryAr: 'الإمارات', iata: 'AAN' },
  { name: 'Ras Al Khaimah', nameAr: 'رأس الخيمة', country: 'UAE', countryAr: 'الإمارات', iata: 'RKT', aliases: ['راس الخيمه'] },
  { name: 'Fujairah', nameAr: 'الفجيرة', country: 'UAE', countryAr: 'الإمارات', iata: 'FJR' },
  { name: 'Salalah', nameAr: 'صلالة', country: 'Oman', countryAr: 'عمان', iata: 'SLL', aliases: ['صلاله'] },
  { name: 'Sohar', nameAr: 'صحار', country: 'Oman', countryAr: 'عمان', iata: 'OHS' },
  { name: 'Aqaba', nameAr: 'العقبة', country: 'Jordan', countryAr: 'الأردن', iata: 'AQJ', aliases: ['العقبه'] },
  { name: 'Petra', nameAr: 'البتراء', country: 'Jordan', countryAr: 'الأردن', aliases: ['بترا'] },
  { name: 'Tripoli', nameAr: 'طرابلس', country: 'Lebanon', countryAr: 'لبنان', aliases: ['طرابلس لبنان'] },
  { name: 'Byblos', nameAr: 'جبيل', country: 'Lebanon', countryAr: 'لبنان' },
  { name: 'Basra', nameAr: 'البصرة', country: 'Iraq', countryAr: 'العراق', iata: 'BSR', aliases: ['البصره'] },
  { name: 'Najaf', nameAr: 'النجف', country: 'Iraq', countryAr: 'العراق', iata: 'NJF' },
  { name: 'Karbala', nameAr: 'كربلاء', country: 'Iraq', countryAr: 'العراق' },
  { name: 'Sulaymaniyah', nameAr: 'السليمانية', country: 'Iraq', countryAr: 'العراق', iata: 'ISU' },
  { name: 'Mosul', nameAr: 'الموصل', country: 'Iraq', countryAr: 'العراق' },
  { name: 'Aleppo', nameAr: 'حلب', country: 'Syria', countryAr: 'سوريا', iata: 'ALP' },
  { name: 'Latakia', nameAr: 'اللاذقية', country: 'Syria', countryAr: 'سوريا', iata: 'LTK', aliases: ['اللاذقيه'] },
  { name: 'Gaza', nameAr: 'غزة', country: 'Palestine', countryAr: 'فلسطين', aliases: ['غزه'] },
  { name: 'Bethlehem', nameAr: 'بيت لحم', country: 'Palestine', countryAr: 'فلسطين' },
  { name: 'Ramallah', nameAr: 'رام الله', country: 'Palestine', countryAr: 'فلسطين' },
  { name: 'Hebron', nameAr: 'الخليل', country: 'Palestine', countryAr: 'فلسطين' },
  { name: 'Nablus', nameAr: 'نابلس', country: 'Palestine', countryAr: 'فلسطين' },
  { name: 'Aswan', nameAr: 'أسوان', country: 'Egypt', countryAr: 'مصر', iata: 'ASW', aliases: ['اسوان'] },
  { name: 'Marsa Alam', nameAr: 'مرسى علم', country: 'Egypt', countryAr: 'مصر', iata: 'RMF' },
  { name: 'Dahab', nameAr: 'دهب', country: 'Egypt', countryAr: 'مصر' },
  { name: 'Taba', nameAr: 'طابا', country: 'Egypt', countryAr: 'مصر', iata: 'TCP' },
  { name: 'Port Said', nameAr: 'بورسعيد', country: 'Egypt', countryAr: 'مصر' },
  { name: 'Suez', nameAr: 'السويس', country: 'Egypt', countryAr: 'مصر' },
  { name: 'Mansoura', nameAr: 'المنصورة', country: 'Egypt', countryAr: 'مصر', aliases: ['المنصوره'] },
  { name: 'Fes', nameAr: 'فاس', country: 'Morocco', countryAr: 'المغرب', iata: 'FEZ' },
  { name: 'Rabat', nameAr: 'الرباط', country: 'Morocco', countryAr: 'المغرب', iata: 'RBA' },
  { name: 'Tangier', nameAr: 'طنجة', country: 'Morocco', countryAr: 'المغرب', iata: 'TNG', aliases: ['طنجه'] },
  { name: 'Agadir', nameAr: 'أكادير', country: 'Morocco', countryAr: 'المغرب', iata: 'AGA', aliases: ['اكادير'] },
  { name: 'Chefchaouen', nameAr: 'شفشاون', country: 'Morocco', countryAr: 'المغرب' },
  { name: 'Essaouira', nameAr: 'الصويرة', country: 'Morocco', countryAr: 'المغرب', iata: 'ESU' },
  { name: 'Sousse', nameAr: 'سوسة', country: 'Tunisia', countryAr: 'تونس', aliases: ['سوسه'] },
  { name: 'Hammamet', nameAr: 'الحمامات', country: 'Tunisia', countryAr: 'تونس' },
  { name: 'Djerba', nameAr: 'جربة', country: 'Tunisia', countryAr: 'تونس', iata: 'DJE', aliases: ['جربه'] },
  { name: 'Oran', nameAr: 'وهران', country: 'Algeria', countryAr: 'الجزائر', iata: 'ORN' },
  { name: 'Constantine', nameAr: 'قسنطينة', country: 'Algeria', countryAr: 'الجزائر', iata: 'CZL', aliases: ['قسنطينه'] },
  { name: 'Annaba', nameAr: 'عنابة', country: 'Algeria', countryAr: 'الجزائر', iata: 'AAE', aliases: ['عنابه'] },
  { name: 'Benghazi', nameAr: 'بنغازي', country: 'Libya', countryAr: 'ليبيا', iata: 'BEN' },
  { name: 'Misrata', nameAr: 'مصراتة', country: 'Libya', countryAr: 'ليبيا', aliases: ['مصراته'] },
  { name: 'Port Sudan', nameAr: 'بورتسودان', country: 'Sudan', countryAr: 'السودان', iata: 'PZU' },
  { name: 'Nouakchott', nameAr: 'نواكشوط', country: 'Mauritania', countryAr: 'موريتانيا', iata: 'NKC' },
  { name: 'Mogadishu', nameAr: 'مقديشو', country: 'Somalia', countryAr: 'الصومال', iata: 'MGQ' },
  { name: 'Djibouti', nameAr: 'جيبوتي', country: 'Djibouti', countryAr: 'جيبوتي', iata: 'JIB' },
  { name: 'Moroni', nameAr: 'موروني', country: 'Comoros', countryAr: 'جزر القمر', iata: 'HAH' },
];

function getDisplayName(city: CityEntry): string {
  return `${city.name}, ${city.country}`;
}

const GLOBAL_TOURIST_ORDER = [
  'paris','london','tokyo','new york','rome','barcelona','dubai','singapore','bangkok','amsterdam',
  'istanbul','venice','florence','madrid','vienna','prague','athens','lisbon','berlin','munich',
  'seoul','hong kong','sydney','melbourne','los angeles','las vegas','miami','san francisco','toronto','vancouver',
  'zurich','geneva','milan','phuket','bali','kuala lumpur','beijing','shanghai','kyoto','osaka',
];
const GLOBAL_TOURIST_RANK = new Map(GLOBAL_TOURIST_ORDER.map((name, index) => [name, index]));
const WESTERN_COUNTRIES = new Set(['france','uk','usa','canada','italy','spain','netherlands','germany','austria','czech republic','hungary','greece','turkey','portugal','ireland','belgium','denmark','norway','sweden','finland','poland','russia','switzerland','australia','new zealand','mexico','brazil','argentina','peru','chile','colombia']);
const ARAB_COUNTRIES = new Set(['saudi arabia','uae','qatar','oman','bahrain','kuwait','jordan','lebanon','iraq','palestine','syria','yemen','egypt','morocco','tunisia','algeria','libya','sudan']);

function citySortTier(city: CityEntry): number {
  const name = city.name.toLowerCase().trim();
  const country = city.country.toLowerCase().trim();
  if (name === 'dubai') return 0;
  if (ARAB_COUNTRIES.has(country)) return 3;
  if (GLOBAL_TOURIST_RANK.has(name)) return 0;
  if (WESTERN_COUNTRIES.has(country)) return 1;
  return 2;
}

function sortCitySuggestions(cities: CityEntry[]): CityEntry[] {
  return [...cities].sort((a, b) => {
    const tierA = citySortTier(a);
    const tierB = citySortTier(b);
    if (tierA !== tierB) return tierA - tierB;
    const rankA = GLOBAL_TOURIST_RANK.get(a.name.toLowerCase().trim()) ?? 999;
    const rankB = GLOBAL_TOURIST_RANK.get(b.name.toLowerCase().trim()) ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    return `${a.name}, ${a.country}`.localeCompare(`${b.name}, ${b.country}`, 'en', { sensitivity: 'base' });
  });
}

// Defensive dedup of the curated city list. Keys on lowercased "name|country"
// so accidental future duplicates never reach the dropdown. Order is preserved
// for the first occurrence so tier sort + global rank still apply downstream.
const dedupedWorldCities: CityEntry[] = (() => {
  const seen = new Set<string>();
  const out: CityEntry[] = [];
  for (const c of worldCitiesData) {
    const k = `${c.name}|${c.country}`.toLowerCase().trim();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
})();

const defaultCitySuggestions = sortCitySuggestions(dedupedWorldCities);

function matchesQuery(city: CityEntry, q: string): boolean {
  const lower = q.toLowerCase().trim();
  if (!lower) return false;

  if (city.name.toLowerCase().includes(lower)) return true;
  if (city.nameAr.includes(q.trim())) return true;
  if (city.country.toLowerCase().includes(lower)) return true;
  if (city.countryAr.includes(q.trim())) return true;
  if (city.iata && city.iata.toLowerCase() === lower) return true;
  if (city.aliases?.some(a => a.toLowerCase().includes(lower) || a.includes(q.trim()))) return true;
  
  const display = `${city.name}, ${city.country}`.toLowerCase();
  if (display.includes(lower)) return true;
  const displayAr = `${city.nameAr}, ${city.countryAr}`;
  if (displayAr.includes(q.trim())) return true;

  return false;
}

const CitySearch = ({ 
  onSelect, 
  placeholder = 'Search for a city', 
  initialValue = '', 
  combined = false,
  departureValue = '',
  destinationValue = '',
  onDepartureSelect,
  onDestinationSelect
}: CitySearchProps) => {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').toLowerCase().split('-')[0];
  const searchAllHint = SEARCH_ALL_CITIES_HINT[lang] || SEARCH_ALL_CITIES_HINT.en;
  const [query, setQuery] = useState(initialValue || '');

  // Sync query when initialValue changes externally (including being cleared)
  useEffect(() => {
    if ((initialValue || '') !== query) {
      setQuery(initialValue || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);
  const [departureQuery, setDepartureQuery] = useState(departureValue || '');
  const [destinationQuery, setDestinationQuery] = useState(destinationValue || '');

  // Sync combined values when parent clears/changes them
  useEffect(() => { if ((departureValue || '') !== departureQuery) setDepartureQuery(departureValue || ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureValue]);
  useEffect(() => { if ((destinationValue || '') !== destinationQuery) setDestinationQuery(destinationValue || ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationValue]);

  const [activeField, setActiveField] = useState<'departure' | 'destination' | ''>('');
  const [results, setResults] = useState<CityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const justSelectedRef = useRef(false);
  const justClearedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const departureInputRef = useRef<HTMLInputElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);

  const searchCities = async (searchQuery: string) => {
    if (!searchQuery || !searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    // 1) Instant local match (curated list) — show immediately
    const local = sortCitySuggestions(dedupedWorldCities.filter(city => matchesQuery(city, searchQuery)));
    if (local.length > 0) setResults(local.slice(0, 10));

    // 2) Global search via edge function (GeoNames + Photon/OSM)
    let remote: CityEntry[] = [];
    try {
      const url = `https://kphgbuxwtggnnnakpodh.supabase.co/functions/v1/search-cities?q=${encodeURIComponent(searchQuery)}&limit=25`;
      const res = await fetch(url, {
        headers: {
          apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwaGdidXh3dGdnbm5uYWtwb2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzEwOTUsImV4cCI6MjA4OTgwNzA5NX0.XmIRK1jU8k5zX7yws06-dKfs-IE421r1e4jxW8itxN8',
        },
      });
      if (res.ok) {
        const json = await res.json();
        remote = (json.results || []).map((r: any) => ({
          name: r.name,
          nameAr: r.name_ar || r.name,
          country: r.country,
          countryAr: r.country,
        }));
      }
    } catch (err) {
      console.warn('Remote city search failed, using local only:', err);
    }

    // Merge: remote first to prioritize the full global dataset, then curated local list
    const seen = new Set(remote.map(c => `${c.name}|${c.country}`.toLowerCase()));
    const merged = [...remote];
    for (const l of local) {
      const k = `${l.name}|${l.country}`.toLowerCase();
      if (!seen.has(k)) { seen.add(k); merged.push(l); }
    }

    if (merged.length > 0) {
      setResults(sortCitySuggestions(merged).slice(0, 25));
    } else {
      // Final fallback: allow user's typed text
      setResults([{ name: searchQuery.trim(), nameAr: searchQuery.trim(), country: '', countryAr: '' }]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!combined) {
      if (!query || !query.trim()) {
        if (isOpen) setResults(defaultCitySuggestions);
        else setResults([]);
        return;
      }
      const debounce = setTimeout(() => searchCities(query), 200);
      return () => clearTimeout(debounce);
    } else {
      const activeQuery = activeField === 'departure' ? departureQuery : destinationQuery;
      if (!activeQuery || !activeQuery.trim()) {
        if (isOpen && activeField) setResults(defaultCitySuggestions);
        else setResults([]);
        return;
      }
      const debounce = setTimeout(() => { if (activeField) searchCities(activeQuery); }, 200);
      return () => clearTimeout(debounce);
    }
  }, [query, isOpen, combined, activeField, departureQuery, destinationQuery]);

  const handleSelect = (city: CityEntry) => {
    const displayName = city.country ? `${city.name}, ${city.country}` : city.name;
    justSelectedRef.current = true;
    if (!combined) {
      setQuery(displayName);
      onSelect(displayName);
    } else {
      if (activeField === 'departure') {
        setDepartureQuery(displayName);
        onDepartureSelect?.(displayName);
      } else if (activeField === 'destination') {
        setDestinationQuery(displayName);
        onDestinationSelect?.(displayName);
      }
    }
    setIsOpen(false);
    setResults([]);
    setActiveField('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      if (results[selectedIndex]) handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveField('');
    }
  };

  const clearInput = () => {
    justClearedRef.current = true;
    justSelectedRef.current = true; // prevents onBlur from re-applying old text
    if (!combined) {
      setQuery('');
      setResults([]);
      onSelect('');
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      if (activeField === 'departure') { setDepartureQuery(''); onDepartureSelect?.(''); setIsOpen(true); departureInputRef.current?.focus(); }
      else if (activeField === 'destination') { setDestinationQuery(''); onDestinationSelect?.(''); setIsOpen(true); destinationInputRef.current?.focus(); }
    }
  };

  // Track touch start position so we can distinguish a tap (select)
  // from a vertical scroll (don't select). This fixes the issue where
  // tapping anywhere in the dropdown immediately selected a city even
  // when the user was just trying to scroll through the list.
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const TAP_MOVE_THRESHOLD = 10; // px
  const TAP_TIME_THRESHOLD = 500; // ms

  const renderCityItem = (city: CityEntry, index: number) => (
    <div
      key={`${city.name}-${city.country}-${index}`}
      onMouseDown={(e) => { e.preventDefault(); handleSelect(city); }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = Math.abs(t.clientX - start.x);
        const dy = Math.abs(t.clientY - start.y);
        const dt = Date.now() - start.t;
        // Only treat as a tap if the finger barely moved and lifted quickly.
        if (dx < TAP_MOVE_THRESHOLD && dy < TAP_MOVE_THRESHOLD && dt < TAP_TIME_THRESHOLD) {
          e.preventDefault();
          handleSelect(city);
        }
      }}
      onTouchCancel={() => { touchStartRef.current = null; }}
      onMouseEnter={() => setSelectedIndex(index)}
      className={cn(
        "px-4 py-2.5 text-sm cursor-pointer flex items-center gap-2 select-none",
        selectedIndex === index ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
      )}
    >
      <MapPin size={14} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0 text-right" dir="auto">
        <div className="flex items-center gap-2 justify-end">
          {city.iata && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">{city.iata}</span>
          )}
          <span className="font-bold truncate">{city.name}, {city.country}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{city.nameAr}، {city.countryAr}</span>
      </div>
    </div>
  );

  if (combined) {
    return (
      <div className="relative">
        <div className="flex items-center bg-background rounded-md border border-input overflow-hidden">
          <div className="flex-1 relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              ref={departureInputRef}
              type="text"
              value={departureQuery}
              onChange={(e) => setDepartureQuery(e.target.value)}
              onFocus={() => { setActiveField('departure'); setIsOpen(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Starting point"
              className="pl-10 pr-10 border-0 rounded-none focus:ring-0"
            />
            {departureQuery && activeField === 'departure' && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setActiveField('departure'); clearInput(); }}
                onTouchStart={(e) => { e.preventDefault(); setActiveField('departure'); clearInput(); }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                type="button"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="px-2 flex items-center">
            <ArrowRight className="text-muted-foreground" size={16} />
          </div>
          <div className="flex-1 relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              ref={destinationInputRef}
              type="text"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              onFocus={() => { setActiveField('destination'); setIsOpen(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Destination"
              className="pl-10 pr-10 border-0 rounded-none focus:ring-0"
            />
            {destinationQuery && activeField === 'destination' && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setActiveField('destination'); clearInput(); }}
                onTouchStart={(e) => { e.preventDefault(); setActiveField('destination'); clearInput(); }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                type="button"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <AnimatePresence>
          {isOpen && (results.length > 0 || isLoading) && (
            <motion.div
              key="combined-results-dropdown"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto overscroll-contain touch-pan-y"
            >
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <div className="inline-block h-4 w-4 border-t-2 border-primary rounded-full animate-spin mr-2"></div>
                  Searching...
                </div>
              ) : (
                <>
                  <div className="py-1">
                    {results.map((city, index) => renderCityItem(city, index))}
                  </div>
                  <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground" dir="auto">
                    <Globe2 size={12} className="text-primary shrink-0" />
                    <span className="truncate">{searchAllHint}</span>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); justSelectedRef.current = false; }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            setTimeout(() => {
              setIsOpen(false);
              if (justClearedRef.current) { justClearedRef.current = false; return; }
              // Only set free text if no selection was just made
              if (!justSelectedRef.current && query && query.trim()) {
                onSelect(query.trim());
              }
              justSelectedRef.current = false;
            }, 300);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-10 pr-10"
        />
        {query && (
          <button
            onMouseDown={(e) => { e.preventDefault(); clearInput(); }}
            onTouchStart={(e) => { e.preventDefault(); clearInput(); }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            type="button"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <AnimatePresence>
        {isOpen && (results.length > 0 || isLoading) && (
          <motion.div
            key="single-results-dropdown"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto overscroll-contain touch-pan-y"
          >
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <div className="inline-block h-4 w-4 border-t-2 border-primary rounded-full animate-spin mr-2"></div>
                Searching...
              </div>
            ) : (
              <>
                <div className="py-1">
                  {results.map((city, index) => renderCityItem(city, index))}
                </div>
                <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground" dir="auto">
                  <Globe2 size={12} className="text-primary shrink-0" />
                  <span className="truncate">{searchAllHint}</span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CitySearch;
