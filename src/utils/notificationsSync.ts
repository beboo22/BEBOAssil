export type NotificationSyncDetail = {
  action: 'mark-read' | 'mark-all-read' | 'delete' | 'refresh';
  ids?: string[];
};

export const NOTIFICATIONS_SYNC_EVENT = 'aseel:notifications-sync';

export function dispatchNotificationSync(detail: NotificationSyncDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotificationSyncDetail>(NOTIFICATIONS_SYNC_EVENT, { detail }));
}

export function applyNotificationSync<T extends { id: string; read: boolean }>(
  notifications: T[],
  detail: NotificationSyncDetail,
) {
  const ids = new Set(detail.ids || []);

  switch (detail.action) {
    case 'mark-read':
      return notifications.map((notification) =>
        ids.has(notification.id) ? { ...notification, read: true } : notification,
      );
    case 'mark-all-read':
      return notifications.map((notification) => ({ ...notification, read: true }));
    case 'delete':
      return notifications.filter((notification) => !ids.has(notification.id));
    default:
      return notifications;
  }
}