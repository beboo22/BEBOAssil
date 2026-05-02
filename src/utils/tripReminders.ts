// Lightweight reminder system stored in localStorage with browser notifications.
// Each reminder is associated with a trip/event and fires at a chosen lead time.

export interface TripReminder {
  id: string;
  refId: string;          // tripId / memoryId / storyId
  refType: 'trip' | 'memory' | 'story';
  title: string;
  destination?: string;
  fireAt: string;          // ISO datetime when the reminder should trigger
  eventDate: string;       // ISO date of the actual trip/event
  leadHours: number;       // how many hours before the event
  createdAt: string;
  notified?: boolean;
}

const STORAGE_KEY = 'travel-reminders-v1';

export const loadReminders = (): TripReminder[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TripReminder[]) : [];
  } catch {
    return [];
  }
};

export const saveReminders = (reminders: TripReminder[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
};

export const addReminder = (reminder: Omit<TripReminder, 'id' | 'createdAt' | 'notified'>): TripReminder => {
  const all = loadReminders();
  const item: TripReminder = {
    ...reminder,
    id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    notified: false,
  };
  all.push(item);
  saveReminders(all);
  return item;
};

export const removeReminder = (id: string): void => {
  saveReminders(loadReminders().filter(r => r.id !== id));
};

export const remindersForRef = (refId: string): TripReminder[] => {
  return loadReminders().filter(r => r.refId === refId);
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

// Fires due reminders. Returns the list of reminders that fired this tick.
export const checkDueReminders = (): TripReminder[] => {
  const all = loadReminders();
  const now = Date.now();
  const fired: TripReminder[] = [];
  let mutated = false;

  all.forEach(r => {
    if (r.notified) return;
    const fireTime = new Date(r.fireAt).getTime();
    if (isNaN(fireTime)) return;
    if (fireTime <= now) {
      r.notified = true;
      mutated = true;
      fired.push(r);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(r.title, {
            body: r.destination ? `${r.destination} • ${new Date(r.eventDate).toLocaleDateString()}` : new Date(r.eventDate).toLocaleDateString(),
            icon: '/logo.png',
            tag: r.id,
          });
        } catch { /* notification creation can throw on unsupported browsers */ }
      }
    }
  });

  if (mutated) saveReminders(all);
  return fired;
};
