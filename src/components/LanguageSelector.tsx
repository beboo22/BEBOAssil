import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ur', name: 'اردو', flag: '🇵🇰' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' }
];

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false, className }) => {
  const { i18n, t } = useTranslation();
  const currentLanguage = languages.find((lang) => i18n.language?.startsWith(lang.code)) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_language', languageCode);
    }
    
    // Set RTL for Arabic and Urdu
    const isRTL = ['ar', 'ur'].includes(languageCode);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = languageCode;
  };

  return (
    <div className={cn("flex items-center", className)}>
      {!compact && <Globe className="mr-2 h-4 w-4 text-muted-foreground" />}
      <Select value={currentLanguage.code} onValueChange={handleLanguageChange}>
        <SelectTrigger className={cn(
          "w-full",
          compact && "h-8 min-w-[78px] px-2 text-xs border border-border/60 bg-card/70 shadow-none"
        )}>
          {compact ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <span>{currentLanguage.flag}</span>
              <span>{currentLanguage.code.toUpperCase()}</span>
            </span>
          ) : (
            <SelectValue placeholder={t('common.language')} />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('common.language')}</SelectLabel>
            {languages.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                <span className="flex items-center gap-2">
                  <span>{language.flag}</span>
                  <span>{language.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSelector;