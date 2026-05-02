import { useState, useEffect } from "react";
import { Bell, Check, Trash2, MapPin, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { requestPushPermission, sendBrowserNotification, isPushSupported } from "@/utils/pushNotifications";
import { applyNotificationSync, dispatchNotificationSync, NOTIFICATIONS_SYNC_EVENT, type NotificationSyncDetail } from "@/utils/notificationsSync";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: any;
  read: boolean;
  created_at: string;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;

    // Request push permission on first load
    if (isPushSupported() && Notification.permission === "default") {
      requestPushPermission();
    }

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);

          // Send browser push notification
          sendBrowserNotification(newNotif.title, {
            body: newNotif.message,
            tag: newNotif.id,
          });

          // Play notification sound
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1lZ2hocXKEjZGTk5CLhHxybGhlZWdscnmBiI2PkI+MiIN9d3JuamhnaGptcnmAhYqNj5CPjIiDfnlzcG1ramhqbXF3fYKHi46Pj42KhYB7dnJva2lpamxvdHmAhIiLjY6NjImFgHx3c3BtamppbG9zeH2Ch4qMjY2MiYaAfHdzb21qampsb3N5foKGioyNjY2Jhn99eHRwbmtqaWxvdHl+g4eKjI6NjImFgHx3c3BtamhpbG9zeX6DhomMjo6MiYWAfHdzb21qamxvcnZ7gISHi42OjoyJhYF8d3NwbWppamxvcnZ7gISHio2OjoyJhYF8d3RwbWtqamxvcnd7gIOHio2OjouJhYF8eHRxbmtqamxucnd7gISHio2OjouJhYF9eHRxbmtqaWtucnZ7gIOHio2OjYyJhYF9eHRxbmtqamtucnZ7gIOHio2OjYyJhYF9eHRxbWtqamxvcnZ7gIOHio2OjYuJhYF8eHRxbmtqamxvcnd7gISHio2Ojo2JhYB8');
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const customEvent = event as CustomEvent<NotificationSyncDetail>;
      setNotifications((prev) => applyNotificationSync(prev, customEvent.detail));
    };

    window.addEventListener(NOTIFICATIONS_SYNC_EVENT, handleSync as EventListener);
    return () => window.removeEventListener(NOTIFICATIONS_SYNC_EVENT, handleSync as EventListener);
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    dispatchNotificationSync({ action: 'mark-read', ids: [id] });
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    dispatchNotificationSync({ action: 'mark-all-read', ids: unreadIds });
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    dispatchNotificationSync({ action: 'delete', ids: [id] });
  };

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.metadata?.share_code) {
      navigate(`/shared/${n.metadata.share_code}`);
      setOpen(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "trip_shared": return <Share2 className="h-4 w-4 text-primary" />;
      case "trip_share_created": return <MapPin className="h-4 w-4 text-primary" />;
      case "story_liked": return <Bell className="h-4 w-4 text-destructive" />;
      case "story_comment": return <Bell className="h-4 w-4 text-accent" />;
      default: return <Bell className="h-4 w-4 text-primary" />;
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              key="notification-dropdown"
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-14 sm:top-10 z-50 w-auto sm:w-80 max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="font-semibold text-sm text-foreground">
                  {t("notifications.title", { defaultValue: "الإشعارات" })}
                </h3>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllAsRead}>
                      <Check className="h-3 w-3 mr-1" />
                      {t("notifications.markAllRead", { defaultValue: "قراءة الكل" })}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ScrollArea className="max-h-80">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    {t("notifications.empty", { defaultValue: "لا توجد إشعارات" })}
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 p-3 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors ${
                        !n.read ? "bg-primary/5" : ""
                      }`}
                      onClick={() => handleClick(n)}
                    >
                      <div className="mt-0.5">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: i18n.language === "ar" ? ar : undefined,
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(n.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </ScrollArea>
              <div className="p-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-primary"
                  onClick={() => { navigate("/notifications"); setOpen(false); }}
                >
                  {t("notifications.viewAll", { defaultValue: "عرض كل الإشعارات" })}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
