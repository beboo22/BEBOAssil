import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  Coins, Trophy, Gift, UserPlus, Share2, Heart, MessageCircle, 
  BookOpen, Sparkles, ArrowRight, Crown, Zap, Camera, Star
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POINTS_SYSTEM, REWARD_THRESHOLDS, getPointsConfig, getRewardsConfig } from "@/utils/pointsSystem";

const HomepageRewards = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [pts, setPts] = useState<Record<string, number>>({ ...POINTS_SYSTEM });
  const [rwds, setRwds] = useState<any[]>([...REWARD_THRESHOLDS]);

  useEffect(() => {
    getPointsConfig().then(setPts);
    getRewardsConfig().then(setRwds);
  }, []);

  const earnMethods = [
    { icon: BookOpen, actionKey: "rewards.postStory", pts: pts.CREATE_STORY || 5, color: "from-rose-500 to-pink-600" },
    { icon: Heart, actionKey: "rewards.like", pts: pts.LIKE_STORY || 1, color: "from-red-400 to-rose-500" },
    { icon: MessageCircle, actionKey: "rewards.comment", pts: pts.COMMENT_ON_STORY || 2, color: "from-blue-500 to-cyan-600" },
    { icon: Share2, actionKey: "rewards.share", pts: pts.SHARE_STORY || 3, color: "from-emerald-500 to-green-600" },
    { icon: UserPlus, actionKey: "rewards.inviteFriend", pts: pts.INVITE_FRIEND || 10, color: "from-violet-500 to-purple-600" },
    { icon: Zap, actionKey: "rewards.bookTrip", pts: pts.BOOK_TRIP || 20, color: "from-amber-500 to-orange-600" },
    { icon: Camera, actionKey: "rewards.dailyLogin", pts: pts.DAILY_LOGIN || 2, color: "from-teal-500 to-cyan-600" },
    { icon: Crown, actionKey: "rewards.referralSignup", pts: pts.REFERRED_SIGNUP || 15, color: "from-yellow-500 to-amber-600" },
  ];

  return (
    <section className="py-16 bg-gradient-to-b from-secondary/20 to-background overflow-hidden">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 text-accent text-sm font-semibold tracking-wider uppercase bg-accent/10 px-4 py-1.5 rounded-full mb-3">
            <Coins size={14} /> {t('rewards.systemTitle')}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-3 gradient-text">
            {t('rewards.earnTitle')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t('rewards.earnSubtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left: How to earn */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              {t('rewards.howToEarn')}
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {earnMethods.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -3, scale: 1.02 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
                  onClick={() => navigate("/profile")}
                >
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{t(item.actionKey)}</p>
                  </div>
                  <Badge className="bg-accent/10 text-accent border-accent/20 text-[11px] font-bold shrink-0">
                    +{item.pts}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Rewards tiers */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              {t('rewards.availableRewards')}
            </h3>
            <div className="space-y-3">
              {rwds.map((reward: any, i: number) => (
                <motion.div
                  key={reward.points}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ x: 5 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:shadow-lg hover:border-primary/30 transition-all"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    i === 3 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                    i === 2 ? 'bg-gradient-to-br from-yellow-500 to-amber-600' :
                    i === 1 ? 'bg-gradient-to-br from-blue-500 to-cyan-600' :
                    'bg-gradient-to-br from-emerald-500 to-green-600'
                  }`}>
                    {i === 3 ? <Crown className="w-6 h-6 text-white" /> :
                     i === 2 ? <Star className="w-6 h-6 text-white" /> :
                     i === 1 ? <Gift className="w-6 h-6 text-white" /> :
                     <Coins className="w-6 h-6 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {reward.rewardEn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {reward.points} {t('rewards.points')}
                      {reward.freeGenerations > 0 && (
                        <span className="text-primary ml-2">🎁 {reward.freeGenerations} {t('rewards.freeGenerations')}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold shrink-0">
                    {reward.points}
                  </Badge>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mt-5 text-center"
            >
              <Button
                onClick={() => navigate("/auth")}
                className="gap-2 rounded-xl px-6"
                size="lg"
              >
                {t('rewards.signUpCta')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HomepageRewards;
