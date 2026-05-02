import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Send, Trash2, Loader2, Smile, Heart, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { awardPoints } from "@/utils/pointsSystem";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: { full_name?: string; avatar_url?: string };
}

interface CommentsSectionProps {
  storyId: string;
  currentUser?: any;
  onCommentAdded?: () => void;
}

const EMOJI_PICKS = ['❤️', '🔥', '😍', '👏', '🙌', '✈️', '🌍', '📸', '⭐', '💯', '🤩', '😂'];

export const CommentsSection = ({ storyId, currentUser, onCommentAdded }: CommentsSectionProps) => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith('ar');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-${storyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_comments', filter: `story_id=eq.${storyId}` },
        async (payload) => {
          const { data } = await supabase.from("story_comments").select(`*, profiles:user_id (full_name, avatar_url)`).eq("id", payload.new.id).single();
          if (data) setComments(prev => [...prev, data as any]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storyId]);

  const fetchComments = async () => {
    setLoading(true);
    const { data } = await supabase.from("story_comments").select(`*, profiles:user_id (full_name, avatar_url)`).eq("story_id", storyId).order("created_at", { ascending: true });
    setComments((data as any) || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!currentUser || !newComment.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("story_comments").insert({ story_id: storyId, user_id: currentUser.id, content: newComment.trim() });
      if (error) throw error;
      setNewComment("");
      setShowEmojis(false);
      await awardPoints({ userId: currentUser.id, action: "COMMENT_ON_STORY", reason: "Commented on a story" });
      if (onCommentAdded) onCommentAdded();
      try {
        const { data: story } = await supabase.from("travel_stories").select("user_id, title").eq("id", storyId).single();
        if (story && story.user_id !== currentUser.id) {
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", currentUser.id).single();
          const name = profile?.full_name || (isArabic ? 'مسافر' : 'Traveler');
          await supabase.from("notifications").insert({
            user_id: story.user_id, type: 'comment',
            title: isArabic ? 'تعليق جديد 💬' : 'New Comment 💬',
            message: isArabic ? `${name} علّق على قصتك "${story.title}"` : `${name} commented on "${story.title}"`,
            metadata: { story_id: storyId, commenter_id: currentUser.id } as any,
          });
        }
      } catch {}
    } catch {
      toast({ title: isArabic ? 'خطأ في إضافة التعليق' : 'Error adding comment', variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (commentId: string) => {
    await supabase.from("story_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const insertEmoji = (emoji: string) => {
    setNewComment(prev => prev + emoji);
    inputRef.current?.focus();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      {/* Comments list */}
      <div className="space-y-2 max-h-96 overflow-y-auto px-1">
        {comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">{isArabic ? 'لا توجد تعليقات بعد. كن أول من يعلّق!' : 'No comments yet. Be the first!'}</p>
          </div>
        ) : (
          <AnimatePresence>
            {comments.map((comment) => (
              <motion.div key={comment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex gap-2.5 p-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors group">
                <Avatar className="w-8 h-8 shrink-0 cursor-pointer" onClick={() => navigate(`/profile/${comment.user_id}`)}>
                  <AvatarImage src={comment.profiles?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs"><User className="w-3.5 h-3.5" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/profile/${comment.user_id}`)}>
                      {comment.profiles?.full_name || (isArabic ? 'مسافر' : 'Traveler')}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, ...(isArabic ? { locale: ar } : {}) })}
                      </span>
                      {currentUser?.id === comment.user_id && (
                        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(comment.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{comment.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* New comment input */}
      {currentUser ? (
        <div className="border-t border-border pt-3 space-y-2">
          {/* Emoji picker */}
          <AnimatePresence>
            {showEmojis && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-1.5 pb-2">
                {EMOJI_PICKS.map(e => (
                  <button key={e} onClick={() => insertEmoji(e)}
                    className="text-xl hover:scale-125 active:scale-95 transition-transform p-1 rounded-lg hover:bg-muted">{e}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea ref={inputRef} value={newComment} onChange={(e) => setNewComment(e.target.value)}
                placeholder={isArabic ? 'اكتب تعليقك...' : 'Write a comment...'}
                className="w-full min-h-[44px] max-h-[120px] resize-none rounded-2xl bg-muted/50 border border-border px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                dir="auto" />
              <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setShowEmojis(!showEmojis)}>
                <Smile className="w-4 h-4" />
              </Button>
            </div>
            <Button size="icon" className="rounded-full h-10 w-10 shrink-0 bg-primary hover:bg-primary/90 shadow-md"
              onClick={handleSubmit} disabled={submitting || !newComment.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-3 space-y-2 border-t border-border">
          <p>{isArabic ? 'سجل دخول للتعليق' : 'Sign in to comment'}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="rounded-xl">
            {isArabic ? 'تسجيل الدخول' : 'Sign In'}
          </Button>
        </div>
      )}
    </div>
  );
};
