import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, Quote, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

interface Review {
  id: string;
  user_name: string;
  avatar_url: string;
  rating: number;
  comment: string;
  destination: string;
  created_at: string;
}

const Testimonials = () => {
  const { t, i18n } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      // Fetch approved comments with ratings
      const { data: comments } = await supabase
        .from("comments")
        .select("*")
        .eq("status", "approved")
        .not("rating", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);

      // Also fetch activity reviews (no FK, so fetch profiles separately)
      const { data: activityReviews } = await supabase
        .from("activity_reviews")
        .select("*")
        .not("rating", "is", null)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);

      // Fetch profile info for activity review users
      const userIds = [...new Set((activityReviews || []).map((r: any) => r.user_id))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);
        if (profiles) {
          for (const p of profiles) profilesMap[p.id] = p;
        }
      }

      const mapped: Review[] = [];

      if (comments?.length) {
        for (const c of comments) {
          mapped.push({
            id: c.id,
            user_name: c.user_name || t('testimonials.anonymousUser', { defaultValue: 'مستخدم الموقع' }),
            avatar_url: c.user_avatar || '',
            rating: c.rating || 5,
            comment: c.content,
            destination: c.destination,
            created_at: c.created_at,
          });
        }
      }

      if (activityReviews?.length) {
        for (const r of activityReviews as any[]) {
          const profile = profilesMap[r.user_id];
          mapped.push({
            id: r.id,
            user_name: profile?.full_name || t('testimonials.anonymousUser', { defaultValue: 'مستخدم الموقع' }),
            avatar_url: profile?.avatar_url || '',
            rating: r.rating || 5,
            comment: r.comment,
            destination: r.destination || r.activity_name,
            created_at: r.created_at,
          });
        }
      }

      // Sort by date and take top 3
      mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setReviews(mapped.slice(0, 3));
      setLoading(false);
    };

    fetchReviews();
  }, [t]);

  // Fallback testimonials when no real reviews exist
  const fallbackTestimonials = [
    { name: t('testimonials.name1'), location: t('testimonials.loc1'), rating: 5, text: t('testimonials.text1'), avatar: "https://images.unsplash.com/photo-1494790108755-2616b612b566?q=80&w=200&h=200&auto=format&fit=crop" },
    { name: t('testimonials.name2'), location: t('testimonials.loc2'), rating: 5, text: t('testimonials.text2'), avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop" },
    { name: t('testimonials.name3'), location: t('testimonials.loc3'), rating: 5, text: t('testimonials.text3'), avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&h=200&auto=format&fit=crop" },
  ];

  const displayItems = reviews.length > 0
    ? reviews.map(r => ({
        name: r.user_name,
        location: r.destination,
        rating: r.rating,
        text: r.comment,
        avatar: r.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user_name)}&background=random&size=200`,
      }))
    : fallbackTestimonials;

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="text-primary text-sm font-semibold tracking-wider uppercase">{t('testimonials.badge')}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-2 mb-4 gradient-text">{t('testimonials.title')}</h2>
          <p className="text-muted-foreground max-w-3xl mx-auto text-lg">{t('testimonials.subtitle')}</p>
          {reviews.length > 0 && (
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              <MessageSquare size={12} />
              {t('testimonials.realReviews', { defaultValue: 'Real reviews from real users' })}
            </span>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              whileHover={{ y: -4 }}
              className="bg-card p-7 rounded-2xl relative border border-border shadow-sm hover:shadow-md transition-all"
            >
              <Quote className="w-8 h-8 text-primary/10 absolute top-6 right-6" />
              <div className="flex items-center mb-5">
                <img src={item.avatar} alt={item.name} className="w-14 h-14 rounded-full object-cover mr-4 ring-3 ring-primary/20" />
                <div>
                  <h4 className="font-bold text-foreground">{item.name}</h4>
                  <p className="text-muted-foreground text-sm">{item.location}</p>
                </div>
              </div>
              <div className="flex mb-3">
                {[...Array(item.rating)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 text-accent fill-accent" />
                ))}
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">"{item.text}"</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
