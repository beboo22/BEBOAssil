import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Star, Send, Loader2, ThumbsUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface Comment {
  id: string;
  user_id: string;
  destination: string;
  content: string;
  rating: number | null;
  type: string;
  status: string;
  user_name: string | null;
  created_at: string;
}

interface CommentsSectionProps {
  destination?: string;
}

const CommentsSection = ({ destination = "general" }: CommentsSectionProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(0);
  const [type, setType] = useState<"comment" | "suggestion" | "review">("comment");

  useEffect(() => {
    fetchComments();
  }, [destination]);

  const fetchComments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("destination", destination)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setComments(data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!user) { toast.error(t("comments.loginRequired", { defaultValue: "Please login to comment" })); return; }
    if (!content.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({
      user_id: user.id,
      destination,
      content: content.trim(),
      rating: rating || null,
      type,
      user_name: user.email?.split("@")[0] || "User",
      status: "pending",
    });

    if (error) {
      toast.error(t("comments.submitError", { defaultValue: "Failed to submit" }));
    } else {
      toast.success(t("comments.submitted", { defaultValue: "Comment submitted! It will appear after approval." }));
      setContent("");
      setRating(0);
    }
    setSubmitting(false);
  };

  const typeIcons = { comment: MessageSquare, suggestion: Lightbulb, review: Star };
  const typeLabels = {
    comment: t("comments.comment", { defaultValue: "Comment" }),
    suggestion: t("comments.suggestion", { defaultValue: "Suggestion" }),
    review: t("comments.review", { defaultValue: "Review" }),
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="text-primary" size={20} />
        <h3 className="text-lg font-bold text-foreground">{t("comments.title", { defaultValue: "Comments & Suggestions" })}</h3>
        <Badge variant="secondary" className="text-xs">{comments.length}</Badge>
      </div>

      {/* Submit form */}
      {user ? (
        <div className="space-y-3 bg-muted/30 rounded-xl p-4">
          <div className="flex gap-2">
            {(["comment", "suggestion", "review"] as const).map((t2) => {
              const Icon = typeIcons[t2];
              return (
                <Button key={t2} variant={type === t2 ? "default" : "outline"} size="sm" className="text-xs gap-1" onClick={() => setType(t2)}>
                  <Icon size={12} /> {typeLabels[t2]}
                </Button>
              );
            })}
          </div>

          {type === "review" && (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className="focus:outline-none">
                  <Star size={20} className={`transition-colors ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          )}

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("comments.placeholder", { defaultValue: "Share your thoughts..." })}
            className="min-h-[80px]"
            dir="auto"
          />
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()} size="sm" className="gap-1">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {t("comments.submit", { defaultValue: "Submit" })}
          </Button>
        </div>
      ) : (
        <div className="text-center py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("comments.loginToComment", { defaultValue: "Login to share your comments and suggestions" })}
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate('/auth')}>
            {t("auth.signIn", { defaultValue: "Sign In" })}
          </Button>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("comments.noComments", { defaultValue: "No comments yet. Be the first!" })}
        </p>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {comments.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-background border border-border rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(c.user_name || "U")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.user_name || "User"}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {typeLabels[c.type as keyof typeof typeLabels] || c.type}
                    </Badge>
                    {c.rating && (
                      <div className="flex items-center gap-0.5">
                        <Star size={10} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-medium">{c.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground/80" dir="auto">{c.content}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
