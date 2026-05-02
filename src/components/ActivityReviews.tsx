import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Star, Send, Camera, Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  user_id: string;
  activity_name: string;
  destination?: string;
  rating: number;
  comment: string;
  photos: string[];
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null };
}

interface ActivityReviewsProps {
  activityName: string;
  destination?: string;
}

const ActivityReviews = ({ activityName, destination }: ActivityReviewsProps) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadReviews();
  }, [activityName]);

  const loadReviews = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("activity_reviews")
      .select("*")
      .eq("activity_name", activityName)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      // Fetch profiles for each review
      const userIds = [...new Set(data.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);
      setReviews(
        data.map((r: any) => ({
          ...r,
          profile: profileMap.get(r.user_id) || null,
        }))
      );
    }
    setLoading(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !user) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files).slice(0, 3)) {
      const ext = file.name.split(".").pop();
      const path = `reviews/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("story-media").upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(path);
        uploaded.push(urlData.publicUrl);
      }
    }
    setNewPhotos((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error(isArabic ? "يجب تسجيل الدخول أولاً" : "Please sign in first");
      return;
    }
    if (newRating === 0) {
      toast.error(isArabic ? "اختر تقييماً" : "Select a rating");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("activity_reviews").insert({
      user_id: user.id,
      activity_name: activityName,
      destination: destination || null,
      rating: newRating,
      comment: newComment.trim(),
      photos: newPhotos,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isArabic ? "تم إضافة تقييمك ✅" : "Review added ✅");
      setNewRating(0);
      setNewComment("");
      setNewPhotos([]);
      loadReviews();
    }
    setSubmitting(false);
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Star size={16} className="text-yellow-500" />
          {isArabic ? "تقييمات المستخدمين" : "User Reviews"}
          {avgRating && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
              ⭐ {avgRating} ({reviews.length})
            </span>
          )}
        </h3>
      </div>

      {/* Add Review Form */}
      {user && (
        <div className="bg-muted/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setNewRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-0.5"
              >
                <Star
                  size={18}
                  className={cn(
                    "transition-colors",
                    (hoverRating || newRating) >= star
                      ? "fill-yellow-500 text-yellow-500"
                      : "text-muted-foreground"
                  )}
                />
              </button>
            ))}
          </div>
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={isArabic ? "اكتب تعليقك..." : "Write your review..."}
            rows={2}
            className="text-sm"
          />
          {newPhotos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {newPhotos.map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setNewPhotos((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileRef}
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="gap-1 text-xs"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              {isArabic ? "صورة" : "Photo"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || newRating === 0}
              className="gap-1 text-xs flex-1"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {isArabic ? "إرسال" : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="text-center py-3">
          <Loader2 size={16} className="animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          {isArabic ? "لا توجد تقييمات بعد - كن أول من يقيّم!" : "No reviews yet - be the first!"}
        </p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {reviews.map((review) => (
            <div key={review.id} className="bg-muted/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {review.profile?.avatar_url ? (
                    <img src={review.profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(review.profile?.full_name || "U").charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {review.profile?.full_name || (isArabic ? "مسافر" : "Traveler")}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={10} className={cn(s <= review.rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} />
                  ))}
                </div>
              </div>
              {review.comment && (
                <p className="text-xs text-muted-foreground leading-relaxed mb-1">{review.comment}</p>
              )}
              {review.photos?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {review.photos.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-80" onClick={() => window.open(url, "_blank")} />
                  ))}
                </div>
              )}
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {new Date(review.created_at).toLocaleDateString(isArabic ? "ar-SA" : "en-US")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityReviews;
