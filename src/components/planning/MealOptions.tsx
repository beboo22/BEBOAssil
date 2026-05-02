import { useTranslation } from 'react-i18next';
import { UtensilsCrossed } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/hooks/useCurrency';

export interface MealPreferences {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  snacks: boolean;
  budgetPerMeal: 'budget' | 'moderate' | 'premium';
  cuisineTypes?: string[];
}

interface MealOptionsProps {
  preferences: MealPreferences;
  onChange: (prefs: MealPreferences) => void;
  duration: number;
}

const MEAL_COSTS: Record<string, Record<string, number>> = {
  budget: { breakfast: 5, lunch: 8, dinner: 12, snacks: 3 },
  moderate: { breakfast: 12, lunch: 20, dinner: 35, snacks: 8 },
  premium: { breakfast: 25, lunch: 45, dinner: 80, snacks: 15 },
};

type Lang = 'en' | 'ar' | 'ur' | 'de' | 'fr' | 'es' | 'zh' | 'ru';

const STRINGS: Record<Lang, {
  title: string; optional: string; cuisines: string; budget: string; days: string;
  budgetOpt: string; moderate: string; premium: string;
  meals: { breakfast: string; lunch: string; dinner: string; snacks: string };
}> = {
  en: { title: 'Meal & Food Preferences', optional: 'Optional', cuisines: 'Preferred Cuisine Types:', budget: 'Meal budget:', days: 'days', budgetOpt: '💰 Budget', moderate: '🍽️ Moderate', premium: '⭐ Premium', meals: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' } },
  ar: { title: 'تفضيلات الوجبات والطعام', optional: 'اختياري', cuisines: 'أنواع المأكولات المفضلة:', budget: 'ميزانية الوجبات:', days: 'أيام', budgetOpt: '💰 اقتصادي', moderate: '🍽️ متوسط', premium: '⭐ فاخر', meals: { breakfast: 'فطور', lunch: 'غداء', dinner: 'عشاء', snacks: 'وجبات خفيفة' } },
  ur: { title: 'کھانے کی ترجیحات', optional: 'اختیاری', cuisines: 'پسندیدہ کھانوں کی اقسام:', budget: 'کھانے کا بجٹ:', days: 'دن', budgetOpt: '💰 کفایتی', moderate: '🍽️ درمیانہ', premium: '⭐ پریمیم', meals: { breakfast: 'ناشتہ', lunch: 'دوپہر کا کھانا', dinner: 'رات کا کھانا', snacks: 'ہلکا کھانا' } },
  de: { title: 'Mahlzeiten- & Essensvorlieben', optional: 'Optional', cuisines: 'Bevorzugte Küchen:', budget: 'Mahlzeitenbudget:', days: 'Tage', budgetOpt: '💰 Günstig', moderate: '🍽️ Mittel', premium: '⭐ Premium', meals: { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snacks: 'Snacks' } },
  fr: { title: 'Préférences de repas', optional: 'Optionnel', cuisines: 'Cuisines préférées :', budget: 'Budget repas :', days: 'jours', budgetOpt: '💰 Économique', moderate: '🍽️ Modéré', premium: '⭐ Premium', meals: { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snacks: 'Collations' } },
  es: { title: 'Preferencias de comida', optional: 'Opcional', cuisines: 'Tipos de cocina preferidos:', budget: 'Presupuesto de comida:', days: 'días', budgetOpt: '💰 Económico', moderate: '🍽️ Moderado', premium: '⭐ Premium', meals: { breakfast: 'Desayuno', lunch: 'Almuerzo', dinner: 'Cena', snacks: 'Aperitivos' } },
  zh: { title: '餐饮偏好', optional: '可选', cuisines: '偏好的菜系：', budget: '餐饮预算：', days: '天', budgetOpt: '💰 经济', moderate: '🍽️ 中等', premium: '⭐ 高端', meals: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snacks: '小吃' } },
  ru: { title: 'Предпочтения в еде', optional: 'Необязательно', cuisines: 'Предпочитаемые кухни:', budget: 'Бюджет на еду:', days: 'дней', budgetOpt: '💰 Эконом', moderate: '🍽️ Средний', premium: '⭐ Премиум', meals: { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snacks: 'Закуски' } },
};

const CUISINE_LABELS: Record<string, { emoji: string; t: Record<Lang, string> }> = {
  local: { emoji: '🏠', t: { en: 'Local', ar: 'محلي', ur: 'مقامی', de: 'Lokal', fr: 'Local', es: 'Local', zh: '本地', ru: 'Местная' } },
  italian: { emoji: '🇮🇹', t: { en: 'Italian', ar: 'إيطالي', ur: 'اطالوی', de: 'Italienisch', fr: 'Italien', es: 'Italiana', zh: '意大利', ru: 'Итальянская' } },
  asian: { emoji: '🥢', t: { en: 'Asian', ar: 'آسيوي', ur: 'ایشیائی', de: 'Asiatisch', fr: 'Asiatique', es: 'Asiática', zh: '亚洲', ru: 'Азиатская' } },
  seafood: { emoji: '🦐', t: { en: 'Seafood', ar: 'مأكولات بحرية', ur: 'سمندری غذا', de: 'Meeresfrüchte', fr: 'Fruits de mer', es: 'Mariscos', zh: '海鲜', ru: 'Морепродукты' } },
  fast_food: { emoji: '🍔', t: { en: 'Fast Food', ar: 'وجبات سريعة', ur: 'فاسٹ فوڈ', de: 'Fast Food', fr: 'Fast-food', es: 'Comida rápida', zh: '快餐', ru: 'Фастфуд' } },
  vegetarian: { emoji: '🥬', t: { en: 'Vegetarian', ar: 'نباتي', ur: 'سبزی خور', de: 'Vegetarisch', fr: 'Végétarien', es: 'Vegetariana', zh: '素食', ru: 'Вегетарианская' } },
  vegan: { emoji: '🌱', t: { en: 'Vegan', ar: 'نباتي صرف', ur: 'ویگن', de: 'Vegan', fr: 'Végan', es: 'Vegana', zh: '纯素', ru: 'Веганская' } },
  halal: { emoji: '🕌', t: { en: 'Halal', ar: 'حلال', ur: 'حلال', de: 'Halal', fr: 'Halal', es: 'Halal', zh: '清真', ru: 'Халяль' } },
  kosher: { emoji: '✡️', t: { en: 'Kosher', ar: 'كوشر', ur: 'کوشر', de: 'Koscher', fr: 'Casher', es: 'Kosher', zh: '犹太洁食', ru: 'Кошер' } },
  street_food: { emoji: '🌮', t: { en: 'Street Food', ar: 'طعام الشارع', ur: 'اسٹریٹ فوڈ', de: 'Streetfood', fr: 'Cuisine de rue', es: 'Comida callejera', zh: '街头小吃', ru: 'Уличная еда' } },
  desserts: { emoji: '🍰', t: { en: 'Desserts', ar: 'حلويات', ur: 'میٹھائیاں', de: 'Desserts', fr: 'Desserts', es: 'Postres', zh: '甜点', ru: 'Десерты' } },
  coffee: { emoji: '☕', t: { en: 'Cafes', ar: 'مقاهي', ur: 'کیفے', de: 'Cafés', fr: 'Cafés', es: 'Cafés', zh: '咖啡馆', ru: 'Кафе' } },
  arabic: { emoji: '🥙', t: { en: 'Arabic', ar: 'عربي', ur: 'عربی', de: 'Arabisch', fr: 'Arabe', es: 'Árabe', zh: '阿拉伯', ru: 'Арабская' } },
  indian: { emoji: '🍛', t: { en: 'Indian', ar: 'هندي', ur: 'انڈین', de: 'Indisch', fr: 'Indien', es: 'India', zh: '印度', ru: 'Индийская' } },
  american: { emoji: '🇺🇸', t: { en: 'American', ar: 'أمريكي', ur: 'امریکی', de: 'Amerikanisch', fr: 'Américain', es: 'Americana', zh: '美式', ru: 'Американская' } },
  russian: { emoji: '🇷🇺', t: { en: 'Russian', ar: 'روسي', ur: 'روسی', de: 'Russisch', fr: 'Russe', es: 'Rusa', zh: '俄式', ru: 'Русская' } },
  pizza: { emoji: '🍕', t: { en: 'Pizza', ar: 'بيتزا', ur: 'پیزا', de: 'Pizza', fr: 'Pizza', es: 'Pizza', zh: '披萨', ru: 'Пицца' } },
  healthy: { emoji: '🥗', t: { en: 'Healthy', ar: 'صحي', ur: 'صحت بخش', de: 'Gesund', fr: 'Sain', es: 'Saludable', zh: '健康', ru: 'Здоровая' } },
  sushi: { emoji: '🍣', t: { en: 'Sushi', ar: 'سوشي', ur: 'سوشی', de: 'Sushi', fr: 'Sushi', es: 'Sushi', zh: '寿司', ru: 'Суши' } },
  mexican: { emoji: '🌯', t: { en: 'Mexican', ar: 'مكسيكي', ur: 'میکسیکن', de: 'Mexikanisch', fr: 'Mexicain', es: 'Mexicana', zh: '墨西哥', ru: 'Мексиканская' } },
  chinese: { emoji: '🥡', t: { en: 'Chinese', ar: 'صيني', ur: 'چینی', de: 'Chinesisch', fr: 'Chinois', es: 'China', zh: '中餐', ru: 'Китайская' } },
  turkish: { emoji: '🇹🇷', t: { en: 'Turkish', ar: 'تركي', ur: 'ترکی', de: 'Türkisch', fr: 'Turc', es: 'Turca', zh: '土耳其', ru: 'Турецкая' } },
  korean: { emoji: '🇰🇷', t: { en: 'Korean', ar: 'كوري', ur: 'کوریائی', de: 'Koreanisch', fr: 'Coréen', es: 'Coreana', zh: '韩式', ru: 'Корейская' } },
  bbq: { emoji: '🥩', t: { en: 'BBQ', ar: 'مشويات', ur: 'باربی کیو', de: 'Grill', fr: 'Barbecue', es: 'Parrilla', zh: '烧烤', ru: 'Барбекю' } },
  french: { emoji: '🇫🇷', t: { en: 'French', ar: 'فرنسي', ur: 'فرانسیسی', de: 'Französisch', fr: 'Français', es: 'Francesa', zh: '法式', ru: 'Французская' } },
  japanese: { emoji: '🇯🇵', t: { en: 'Japanese', ar: 'ياباني', ur: 'جاپانی', de: 'Japanisch', fr: 'Japonais', es: 'Japonesa', zh: '日式', ru: 'Японская' } },
  thai: { emoji: '🇹🇭', t: { en: 'Thai', ar: 'تايلندي', ur: 'تھائی', de: 'Thailändisch', fr: 'Thaï', es: 'Tailandesa', zh: '泰式', ru: 'Тайская' } },
  mediterranean: { emoji: '🫒', t: { en: 'Mediterranean', ar: 'متوسطي', ur: 'بحیرہ روم', de: 'Mediterran', fr: 'Méditerranéen', es: 'Mediterránea', zh: '地中海', ru: 'Средиземноморская' } },
  lebanese: { emoji: '🇱🇧', t: { en: 'Lebanese', ar: 'لبناني', ur: 'لبنانی', de: 'Libanesisch', fr: 'Libanais', es: 'Libanesa', zh: '黎巴嫩', ru: 'Ливанская' } },
  persian: { emoji: '🇮🇷', t: { en: 'Persian', ar: 'فارسي', ur: 'فارسی', de: 'Persisch', fr: 'Persan', es: 'Persa', zh: '波斯', ru: 'Персидская' } },
  ethiopian: { emoji: '🇪🇹', t: { en: 'Ethiopian', ar: 'إثيوبي', ur: 'ایتھوپیائی', de: 'Äthiopisch', fr: 'Éthiopien', es: 'Etíope', zh: '埃塞俄比亚', ru: 'Эфиопская' } },
  vietnamese: { emoji: '🇻🇳', t: { en: 'Vietnamese', ar: 'فيتنامي', ur: 'ویتنامی', de: 'Vietnamesisch', fr: 'Vietnamien', es: 'Vietnamita', zh: '越南', ru: 'Вьетнамская' } },
  gluten_free: { emoji: '🌾', t: { en: 'Gluten-Free', ar: 'خالي من الغلوتين', ur: 'گلوٹن فری', de: 'Glutenfrei', fr: 'Sans gluten', es: 'Sin gluten', zh: '无麸质', ru: 'Без глютена' } },
  brunch: { emoji: '🥞', t: { en: 'Brunch', ar: 'برانش', ur: 'برنچ', de: 'Brunch', fr: 'Brunch', es: 'Brunch', zh: '早午餐', ru: 'Бранч' } },
  buffet: { emoji: '🍽️', t: { en: 'Buffet', ar: 'بوفيه', ur: 'بوفے', de: 'Buffet', fr: 'Buffet', es: 'Bufé', zh: '自助餐', ru: 'Шведский стол' } },
  fine_dining: { emoji: '🥂', t: { en: 'Fine Dining', ar: 'مطاعم فاخرة', ur: 'فائن ڈائننگ', de: 'Gehobene Küche', fr: 'Gastronomie', es: 'Alta cocina', zh: '精致餐饮', ru: 'Высокая кухня' } },
  food_truck: { emoji: '🚚', t: { en: 'Food Trucks', ar: 'عربات طعام', ur: 'فوڈ ٹرک', de: 'Food Trucks', fr: 'Food trucks', es: 'Food trucks', zh: '餐车', ru: 'Фудтраки' } },
};

const resolveLang = (raw?: string): Lang => {
  const code = String(raw || 'en').toLowerCase().split('-')[0];
  return (['en', 'ar', 'ur', 'de', 'fr', 'es', 'zh', 'ru'] as const).includes(code as Lang) ? (code as Lang) : 'en';
};

export function getMealCostEstimate(prefs: MealPreferences, duration: number): number {
  const costs = MEAL_COSTS[prefs.budgetPerMeal];
  let dailyCost = 0;
  if (prefs.breakfast) dailyCost += costs.breakfast;
  if (prefs.lunch) dailyCost += costs.lunch;
  if (prefs.dinner) dailyCost += costs.dinner;
  if (prefs.snacks) dailyCost += costs.snacks;
  return dailyCost * duration;
}

const MealOptions = ({ preferences, onChange, duration }: MealOptionsProps) => {
  const { i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const s = STRINGS[lang];
  const totalMealCost = getMealCostEstimate(preferences, duration);
  const { formatPrice } = useCurrency();

  const meals = [
    { key: 'breakfast' as const, label: s.meals.breakfast, emoji: '☕' },
    { key: 'lunch' as const, label: s.meals.lunch, emoji: '🥗' },
    { key: 'dinner' as const, label: s.meals.dinner, emoji: '🍲' },
    { key: 'snacks' as const, label: s.meals.snacks, emoji: '🍿' },
  ];

  const toggleCuisine = (key: string) => {
    const current = preferences.cuisineTypes || [];
    const updated = current.includes(key)
      ? current.filter(c => c !== key)
      : [...current, key];
    onChange({ ...preferences, cuisineTypes: updated });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{s.title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{s.optional}</span>
      </div>

      {/* Meal types */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {meals.map(({ key, label, emoji }) => (
          <label
            key={key}
            className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
              preferences[key] ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
          >
            <Checkbox
              checked={preferences[key]}
              onCheckedChange={(checked) =>
                onChange({ ...preferences, [key]: !!checked })
              }
            />
            <span className="text-base">{emoji}</span>
            <span className="text-sm font-medium">{label}</span>
          </label>
        ))}
      </div>

      {/* Cuisine Types */}
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">{s.cuisines}</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CUISINE_LABELS).map(([key, info]) => {
            const isSelected = (preferences.cuisineTypes || []).includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCuisine(key)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {info.emoji} {info.t[lang]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">{s.budget}</Label>
        <Select
          value={preferences.budgetPerMeal}
          onValueChange={(v) => onChange({ ...preferences, budgetPerMeal: v as any })}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="budget">{s.budgetOpt}</SelectItem>
            <SelectItem value="moderate">{s.moderate}</SelectItem>
            <SelectItem value="premium">{s.premium}</SelectItem>
          </SelectContent>
        </Select>
        {totalMealCost > 0 && (
          <span className="text-sm font-semibold text-primary ml-auto">
            ~{formatPrice(totalMealCost, 'USD')} ({duration} {s.days})
          </span>
        )}
      </div>
    </div>
  );
};

export default MealOptions;
