// Browser Push Notification utilities

export const isPushSupported = () => {
  return "Notification" in window;
};

export const getPushPermission = () => {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

export const requestPushPermission = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;
  
  const permission = await Notification.requestPermission();
  return permission === "granted";
};

export const sendBrowserNotification = (title: string, options?: NotificationOptions) => {
  if (getPushPermission() !== "granted") return;
  
  try {
    const notification = new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      dir: "rtl",
      lang: "ar",
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 8 seconds
    setTimeout(() => notification.close(), 8000);
  } catch (e) {
    console.error("Failed to send browser notification:", e);
  }
};

// Check for new notifications and show browser push
export const startNotificationPolling = (userId: string) => {
  let lastCheck = new Date().toISOString();

  const checkNew = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, type")
        .eq("user_id", userId)
        .eq("read", false)
        .gt("created_at", lastCheck)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        lastCheck = new Date().toISOString();
        for (const n of data) {
          sendBrowserNotification(n.title, {
            body: n.message,
            tag: n.id, // Prevent duplicates
          });
        }
      }
    } catch (e) {
      console.error("Push poll error:", e);
    }
  };

  // Poll every 30 seconds
  const interval = setInterval(checkNew, 30000);
  return () => clearInterval(interval);
};
