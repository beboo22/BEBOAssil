import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Check, X, Trash2, Loader2, Star, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const AdminComments = () => {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => { fetchComments(); }, [filter]);

  const fetchComments = async () => {
    setLoading(true);
    let query = supabase.from("comments").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (!error && data) setComments(data);
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("comments").update({ status }).eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(status === "approved" ? "✅ Approved" : "❌ Rejected");
    setComments(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("🗑️ Deleted");
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600",
    approved: "bg-green-500/10 text-green-600",
    rejected: "bg-red-500/10 text-red-600",
  };

  const pendingCount = comments.filter(c => c.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-primary" />
          <h3 className="font-bold text-foreground">{t("admin.comments", { defaultValue: "Comments Management" })}</h3>
          {pendingCount > 0 && <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>}
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <Filter size={12} className="mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No comments found</p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{c.user_name || "User"}</span>
                    <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                    <Badge className={`text-[10px] ${statusColors[c.status] || ""}`}>{c.status}</Badge>
                    <span className="text-[10px] text-muted-foreground">{c.destination}</span>
                    {c.rating && (
                      <span className="flex items-center gap-0.5 text-xs">
                        <Star size={10} className="fill-yellow-400 text-yellow-400" />{c.rating}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 mt-1" dir="auto">{c.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.status === "pending" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={() => updateStatus(c.id, "approved")}>
                        <Check size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => updateStatus(c.id, "rejected")}>
                        <X size={14} />
                      </Button>
                    </>
                  )}
                  {c.status === "approved" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600" onClick={() => updateStatus(c.id, "pending")}>
                      <X size={14} />
                    </Button>
                  )}
                  {c.status === "rejected" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => updateStatus(c.id, "approved")}>
                      <Check size={14} />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteComment(c.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminComments;
