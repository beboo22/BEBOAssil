import React, { useState, useEffect } from 'react';
import { Copy, Check, Users, Gift, Share2, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { getOrCreateReferralCode, getReferralLink, getReferralStats } from '@/utils/referralSystem';
import { toast } from 'sonner';

interface ReferralCardProps {
  userId: string;
}

export const ReferralCard: React.FC<ReferralCardProps> = ({ userId }) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, pointsEarned: 0 });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      getOrCreateReferralCode(userId),
      getReferralStats(userId),
    ]).then(([code, statsResult]) => {
      setReferralCode(code);
      if (statsResult.success) setStats(statsResult as any);
      setLoading(false);
    });
  }, [userId]);

  const handleCopy = () => {
    if (!referralCode) return;
    const link = getReferralLink(referralCode);
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(isArabic ? 'تم نسخ رابط الدعوة!' : 'Referral link copied!', { duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!referralCode) return;
    const link = getReferralLink(referralCode);
    const text = isArabic 
      ? 'انضم لي في رحلات مذهلة! استخدم رابط الدعوة واحصل على نقاط مجانية 🎁'
      : 'Join me for amazing trips! Use my referral link and get free points 🎁';
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Travel Invitation', text, url: link });
      } catch {}
    } else {
      handleCopy();
    }
  };

  if (loading) {
    return <div className="bg-card rounded-xl p-4 border border-border animate-pulse h-40" />;
  }

  return (
    <div className="bg-gradient-to-br from-accent/10 via-primary/5 to-accent/5 rounded-2xl p-4 border border-accent/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center">
          <Gift className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{isArabic ? 'ادعُ أصدقاءك' : 'Invite Friends'}</p>
          <p className="text-[10px] text-muted-foreground">{isArabic ? 'اكسب 10 نقاط لكل صديق' : 'Earn 10 pts per friend'}</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-background/60 rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground truncate border border-border">
          <Link className="w-3 h-3 inline mr-1.5" />
          {referralCode ? getReferralLink(referralCode).replace('https://', '').slice(0, 35) + '...' : '...'}
        </div>
        <Button size="sm" variant="outline" onClick={handleCopy} className="h-8 px-3 gap-1 shrink-0">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <Button onClick={handleShare} size="sm" className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
        <Share2 className="w-4 h-4" />
        {isArabic ? 'شارك الرابط' : 'Share Link'}
      </Button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: isArabic ? 'المدعوون' : 'Invited', value: stats.total, icon: Users },
          { label: isArabic ? 'انضموا' : 'Joined', value: stats.completed, icon: Check },
          { label: isArabic ? 'نقاط مكتسبة' : 'Pts earned', value: stats.pointsEarned, icon: Gift },
        ].map(item => (
          <div key={item.label} className="text-center bg-background/50 rounded-xl py-2">
            <item.icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-accent" />
            <p className="text-sm font-bold text-foreground">{item.value}</p>
            <p className="text-[9px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
