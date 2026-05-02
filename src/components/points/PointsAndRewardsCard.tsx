import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, Trophy, Crown, Star, Gift, History } from "lucide-react";
import { motion } from "framer-motion";
import { 
  getUserPointsHistory, 
  getUserTotalPoints, 
  getPointsLeaderboard,
  redeemPoints,
  canAffordReward 
} from "@/utils/pointsSystem";
import { useToast } from "@/hooks/use-toast";

interface PointsHistory {
  id: string;
  points: number;
  reason: string;
  created_at: string;
}

interface LeaderboardUser {
  id: string;
  full_name: string;
  avatar_url: string;
  total_points: number;
}

interface Reward {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  type: 'discount' | 'free_trip' | 'premium';
  discount?: number; // percentage
  icon: React.ReactNode;
}

const REWARDS: Reward[] = [
  {
    id: 'discount_10',
    title: 'خصم 10%',
    description: 'خصم 10% على حجزك القادم',
    pointsCost: 50,
    type: 'discount',
    discount: 10,
    icon: <Gift className="w-5 h-5" />
  },
  {
    id: 'discount_15',
    title: 'خصم 15%',
    description: 'خصم 15% على حجزك القادم',
    pointsCost: 100,
    type: 'discount',
    discount: 15,
    icon: <Star className="w-5 h-5" />
  },
  {
    id: 'discount_25',
    title: 'خصم 25%',
    description: 'خصم 25% على حجزك القادم',
    pointsCost: 200,
    type: 'discount',
    discount: 25,
    icon: <Trophy className="w-5 h-5" />
  },
  {
    id: 'free_trip',
    title: 'رحلة مجانية',
    description: 'رحلة نهاية أسبوع مجانية',
    pointsCost: 500,
    type: 'free_trip',
    icon: <Crown className="w-5 h-5" />
  }
];

const PointsAndRewardsCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [totalPoints, setTotalPoints] = useState(0);
  const [pointsHistory, setPointsHistory] = useState<PointsHistory[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch user's total points
      const totalResult = await getUserTotalPoints(user.id);
      if (totalResult.success) {
        setTotalPoints(totalResult.totalPoints);
      }

      // Fetch points history
      const historyResult = await getUserPointsHistory(user.id);
      if (historyResult.success) {
        setPointsHistory(historyResult.data || []);
      }

      // Fetch leaderboard
      const leaderboardResult = await getPointsLeaderboard();
      if (leaderboardResult.success) {
        setLeaderboard(leaderboardResult.leaderboard || []);
      }
    } catch (error) {
      console.error("Error fetching points data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemReward = async (reward: Reward) => {
    if (!user) return;

    const canAfford = await canAffordReward(user.id, reward.pointsCost);
    if (!canAfford) {
      toast({
        title: "نقاط غير كافية",
        description: `تحتاج إلى ${reward.pointsCost} نقطة لاستبدال هذه المكافأة`,
        variant: "destructive",
      });
      return;
    }

    setRedeeming(reward.id);
    try {
      const result = await redeemPoints(user.id, reward.pointsCost, reward.title);
      
      if (result.success) {
        setTotalPoints(result.newTotal);
        toast({
          title: "تم الاستبدال بنجاح! 🎉",
          description: `تم استبدال ${reward.title} بنجاح`,
        });
        
        // Refresh data
        fetchUserData();
      } else {
        throw new Error("Redemption failed");
      }
    } catch (error) {
      console.error("Error redeeming reward:", error);
      toast({
        title: "خطأ في الاستبدال",
        description: "حدث خطأ في استبدال المكافأة",
        variant: "destructive",
      });
    } finally {
      setRedeeming(null);
    }
  };

  const getNextMilestone = () => {
    const milestones = [50, 100, 200, 500, 1000];
    return milestones.find(milestone => totalPoints < milestone) || 1000;
  };

  const getProgressToNextMilestone = () => {
    const nextMilestone = getNextMilestone();
    return Math.min((totalPoints / nextMilestone) * 100, 100);
  };

  const getUserRank = () => {
    if (!user) return null;
    const userIndex = leaderboard.findIndex(u => u.id === user.id);
    return userIndex >= 0 ? userIndex + 1 : null;
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-600">سجل دخولك لرؤية نقاطك ومكافآتك</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Points Overview */}
      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">{totalPoints.toLocaleString()}</h3>
              <p className="text-blue-100">إجمالي النقاط</p>
              {getUserRank() && (
                <div className="flex items-center gap-1 mt-2">
                  <Trophy className="w-4 h-4" />
                  <span className="text-sm">المرتبة #{getUserRank()}</span>
                </div>
              )}
            </div>
            <Award className="w-12 h-12 text-blue-200" />
          </div>
          
          {/* Progress to next milestone */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>التقدم إلى المستوى التالي</span>
              <span>{getNextMilestone()} نقطة</span>
            </div>
            <Progress 
              value={getProgressToNextMilestone()} 
              className="h-2 bg-blue-400" 
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="rewards" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rewards">المكافآت</TabsTrigger>
          <TabsTrigger value="history">تاريخ النقاط</TabsTrigger>
          <TabsTrigger value="leaderboard">المتصدرون</TabsTrigger>
        </TabsList>

        {/* Rewards Tab */}
        <TabsContent value="rewards">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                المكافآت المتاحة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REWARDS.map((reward) => {
                  const canAfford = totalPoints >= reward.pointsCost;
                  return (
                    <motion.div
                      key={reward.id}
                      whileHover={{ scale: 1.02 }}
                      className={`border rounded-lg p-4 transition-all ${
                        canAfford 
                          ? 'border-green-200 bg-green-50 hover:border-green-300' 
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            canAfford ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {reward.icon}
                          </div>
                          <div>
                            <h4 className="font-semibold">{reward.title}</h4>
                            <p className="text-sm text-gray-600">{reward.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant={canAfford ? "default" : "secondary"}>
                                {reward.pointsCost} نقطة
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={!canAfford || redeeming === reward.id}
                          onClick={() => handleRedeemReward(reward)}
                          className={
                            canAfford 
                              ? "bg-green-600 hover:bg-green-700" 
                              : "bg-gray-400"
                          }
                        >
                          {redeeming === reward.id ? "جاري..." : "استبدال"}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                تاريخ النقاط
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : pointsHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  لا توجد نقاط حتى الآن. ابدأ بمشاركة قصصك!
                </p>
              ) : (
                <div className="space-y-3">
                  {pointsHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{entry.reason}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(entry.created_at).toLocaleDateString('ar')}
                        </p>
                      </div>
                      <Badge variant={entry.points > 0 ? "default" : "secondary"}>
                        {entry.points > 0 ? '+' : ''}{entry.points}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                المتصدرون
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((user, index) => (
                    <div 
                      key={user.id} 
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        index < 3 ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200' : 'border'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                          index === 0 ? 'bg-yellow-500 text-white' :
                          index === 1 ? 'bg-gray-400 text-white' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          <span className="text-sm font-bold">#{index + 1}</span>
                        </div>
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user.avatar_url || ""} />
                          <AvatarFallback>{user.full_name?.[0] || "M"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.full_name || "مسافر"}</span>
                      </div>
                      <Badge variant="secondary">
                        {user.total_points?.toLocaleString()} نقطة
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PointsAndRewardsCard;