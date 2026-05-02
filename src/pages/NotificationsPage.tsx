import { useState, useEffect } from "react";
import { Bell, Check, Trash2, MapPin, Share2, Archive, Filter, CheckCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

type FilterType = "all" | "trip_shared" | "trip_share_created" | "general";
type TabType = "inbox" | "archived";

const NotificationsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("archived_notifications");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [activeTab, setActiveTab] = useState<TabType>("inbox");
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setNotifications(data as Notification[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel("notifications-page-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const customEvent = event as CustomEvent<NotificationSyncDetail>;
      setNotifications((prev) => applyNotificationSync(prev, customEvent.detail));
    };

    window.addEventListener(NOTIFICATIONS_SYNC_EVENT, handleSync as EventListener);
    return () => window.removeEventListener(NOTIFICATIONS_SYNC_EVENT, handleSync as EventListener);
  }, []);

  useEffect(() => {
    localStorage.setItem("archived_notifications", JSON.stringify([...archivedIds]));
  }, [archivedIds]);

  const inboxNotifications = notifications.filter((n) => !archivedIds.has(n.id));
  const archivedNotifications = notifications.filter((n) => archivedIds.has(n.id));

  const currentList = activeTab === "inbox" ? inboxNotifications : archivedNotifications;
  const filteredList = filter === "all" ? currentList : currentList.filter((n) => n.type === filter);

  const unreadCount = inboxNotifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    dispatchNotificationSync({ action: 'mark-read', ids: [id] });
  };

  const markAllAsRead = async () => {
    const unreadIds = inboxNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    dispatchNotificationSync({ action: 'mark-all-read', ids: unreadIds });
    toast.success(t('notifications.markAllReadSuccess', { defaultValue: isAr ? 'تم تحديد الكل كمقروء' : 'All notifications marked as read' }));
  };

  const archiveNotification = (id: string) => {
    setArchivedIds((prev) => new Set([...prev, id]));
    toast.success(t('notifications.archived', { defaultValue: isAr ? 'تمت الأرشفة' : 'Archived' }));
  };

  const unarchiveNotification = (id: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success(t('notifications.unarchived', { defaultValue: isAr ? 'تم إلغاء الأرشفة' : 'Removed from archive' }));
  };

  const archiveAllRead = () => {
    const readIds = inboxNotifications.filter((n) => n.read).map((n) => n.id);
    if (readIds.length === 0) return;
    setArchivedIds((prev) => new Set([...prev, ...readIds]));
    toast.success(t('notifications.archiveReadSuccess', {
      count: readIds.length,
      defaultValue: isAr ? `تمت أرشفة ${readIds.length} إشعار` : `${readIds.length} notifications archived`,
    }));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    dispatchNotificationSync({ action: 'delete', ids: [id] });
    toast.success(t('notifications.deleted', { defaultValue: isAr ? 'تم الحذف' : 'Deleted' }));
  };

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.metadata?.share_code) {
      navigate(`/shared/${n.metadata.share_code}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "trip_shared": return <Share2 className="h-5 w-5 text-primary" />;
      case "trip_share_created": return <MapPin className="h-5 w-5 text-accent-foreground" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "trip_shared": return "رحلة مشاركة";
      case "trip_share_created": return "مشاركة صادرة";
      default: return "عام";
    }
  };

  const filters: { value: FilterType; label: string }[] = [
    { value: "all", label: "الكل" },
    { value: "trip_shared", label: "رحلات مشاركة" },
    { value: "trip_share_created", label: "مشاركات صادرة" },
    { value: "general", label: "عام" },
  ];

  if (!user) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">سجّل الدخول لعرض إشعاراتك</p>
            <Button className="mt-4" onClick={() => navigate("/auth")}>تسجيل الدخول</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">
        {/* Header */}
        <div className="mb-5 sm:mb-6 rounded-2xl border border-border/60 bg-card/70 px-4 py-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-2xl font-bold text-foreground flex flex-wrap items-center gap-2">
              <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              {t('notifications.title', { defaultValue: isAr ? 'الإشعارات' : 'Notifications' })}
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] sm:text-xs shrink-0">{t('notifications.unreadBadge', { count: unreadCount, defaultValue: isAr ? `${unreadCount} جديد` : `${unreadCount} new` })}</Badge>
              )}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {t('notifications.subtitle', { defaultValue: isAr ? 'تابع تحديثاتك واقرأ التنبيهات أولاً بأول' : 'Stay on top of your latest updates and alerts' })}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-border/60 bg-background px-3 py-2 text-center min-w-[92px]">
            <div className="text-lg font-semibold text-foreground">{unreadCount}</div>
            <div className="text-[10px] text-muted-foreground">{t('notifications.unreadOnly', { defaultValue: isAr ? 'غير مقروء' : 'Unread' })}</div>
          </div>
        </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div className="w-full overflow-x-auto no-scrollbar">
              <TabsList className="grid w-full min-w-max grid-cols-2 sm:flex">
                <TabsTrigger value="inbox" className="gap-1.5 min-w-[120px] sm:min-w-0">
                <Bell className="h-3.5 w-3.5" />
                {t('notifications.inbox', { defaultValue: isAr ? 'الوارد' : 'Inbox' })}
                {inboxNotifications.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{inboxNotifications.length}</Badge>
                )}
              </TabsTrigger>
                <TabsTrigger value="archived" className="gap-1.5 min-w-[120px] sm:min-w-0">
                <Archive className="h-3.5 w-3.5" />
                {t('notifications.archivedTab', { defaultValue: isAr ? 'الأرشيف' : 'Archived' })}
                {archivedNotifications.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{archivedNotifications.length}</Badge>
                )}
              </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex w-full sm:w-auto items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              {activeTab === "inbox" && unreadCount > 0 && (
                <Button variant="outline" size="sm" className="text-xs gap-1 shrink-0" onClick={markAllAsRead}>
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t('notifications.markAllRead', { defaultValue: isAr ? 'قراءة الكل' : 'Mark all read' })}
                </Button>
              )}
              {activeTab === "inbox" && inboxNotifications.some((n) => n.read) && (
                <Button variant="outline" size="sm" className="text-xs gap-1 shrink-0" onClick={archiveAllRead}>
                  <Archive className="h-3.5 w-3.5" />
                  {t('notifications.archiveRead', { defaultValue: isAr ? 'أرشفة المقروء' : 'Archive read' })}
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="-mx-1 mt-4 flex items-center gap-1.5 overflow-x-auto px-1 no-scrollbar">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            {filters.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 rounded-full shrink-0"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <TabsContent value="inbox">
            <NotificationList
              notifications={filteredList}
              loading={loading}
              getIcon={getIcon}
              getTypeLabel={getTypeLabel}
              isAr={isAr}
              onClickNotification={handleClick}
              onMarkAsRead={markAsRead}
              onArchive={archiveNotification}
              onDelete={deleteNotification}
               emptyMessage={t('notifications.emptyInbox', { defaultValue: isAr ? 'لا توجد إشعارات في الوارد' : 'No inbox notifications' })}
              archiveMode="archive"
            />
          </TabsContent>

          <TabsContent value="archived">
            <NotificationList
              notifications={filteredList}
              loading={loading}
              getIcon={getIcon}
              getTypeLabel={getTypeLabel}
              isAr={isAr}
              onClickNotification={handleClick}
              onMarkAsRead={markAsRead}
              onArchive={unarchiveNotification}
              onDelete={deleteNotification}
               emptyMessage={t('notifications.emptyArchived', { defaultValue: isAr ? 'لا توجد إشعارات مؤرشفة' : 'No archived notifications' })}
              archiveMode="unarchive"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  getIcon: (type: string) => React.ReactNode;
  getTypeLabel: (type: string) => string;
  isAr: boolean;
  onClickNotification: (n: Notification) => void;
  onMarkAsRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  emptyMessage: string;
  archiveMode: "archive" | "unarchive";
}

const NotificationList = ({
  notifications, loading, getIcon, getTypeLabel, isAr,
  onClickNotification, onMarkAsRead, onArchive, onDelete, emptyMessage, archiveMode,
}: NotificationListProps) => {
  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="p-12 text-center">
          <Archive className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2 mt-4">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.2 }}
          >
              <Card
                className={`cursor-pointer transition-all hover:shadow-md overflow-hidden ${!n.read ? "border-primary/30 bg-primary/5" : ""}`}
              onClick={() => onClickNotification(n)}
            >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5 p-2 rounded-full bg-muted shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-sm font-semibold ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0">{getTypeLabel(n.type)}</Badge>
                        <span className="text-[10px] text-muted-foreground/70 break-words">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: isAr ? ar : undefined,
                        })}
                      </span>
                    </div>
                  </div>
                    </div>
                    <div className="flex flex-row sm:flex-col gap-1 shrink-0 justify-end">
                    {!n.read && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" title="تحديد كمقروء"
                        onClick={(e) => { e.stopPropagation(); onMarkAsRead(n.id); }}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" title={archiveMode === "archive" ? "أرشفة" : "إلغاء الأرشفة"}
                      onClick={(e) => { e.stopPropagation(); onArchive(n.id); }}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7 text-destructive" title="حذف"
                      onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotificationsPage;
