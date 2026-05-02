import { supabase } from "@/integrations/supabase/client";

export interface SavedBooking {
  category: string;
  status: "selected" | "booked" | "skipped";
  details?: string;
  destination: string;
  travelDate: string;
  savedAt: string;
}

const STORAGE_KEY = "saved_bookings_for_later";

export function savePendingBooking(booking: SavedBooking) {
  const existing = getPendingBookings();
  existing.push(booking);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  // Schedule push notification check
  schedulePushReminder(booking);
}

/**
 * Request browser push notification permission and schedule reminders
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function schedulePushReminder(booking: SavedBooking) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  
  const travelDate = new Date(booking.travelDate);
  const now = new Date();
  const threeDaysBefore = new Date(travelDate);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  
  const msUntilReminder = threeDaysBefore.getTime() - now.getTime();
  
  if (msUntilReminder > 0 && msUntilReminder < 7 * 24 * 60 * 60 * 1000) {
    // Only schedule if within 7 days (setTimeout limit)
    setTimeout(() => {
      showPushNotification(booking);
    }, msUntilReminder);
  }
}

function showPushNotification(booking: SavedBooking) {
  if (Notification.permission !== "granted") return;
  const isAr = document.documentElement.lang?.startsWith("ar") || navigator.language?.startsWith("ar");
  const categoryLabel = getCategoryLabelInternal(booking.category, isAr);
  
  new Notification(
    isAr ? `⚠️ تذكير حجز - ${categoryLabel}` : `⚠️ Booking Reminder - ${categoryLabel}`,
    {
      body: isAr
        ? `رحلتك إلى ${booking.destination} بعد 3 أيام! لم تكمل حجز ${categoryLabel} بعد.`
        : `Your trip to ${booking.destination} is in 3 days! Complete your ${categoryLabel} booking.`,
      icon: "/favicon.ico",
      tag: `booking-${booking.category}-${booking.travelDate}`,
    }
  );
}

function getCategoryLabelInternal(category: string, isAr: boolean): string {
  const labels: Record<string, { ar: string; en: string }> = {
    flight: { ar: "الطيران", en: "Flight" },
    hotel: { ar: "الفندق", en: "Hotel" },
    car: { ar: "السيارة", en: "Car Rental" },
    transfer: { ar: "النقل", en: "Transfer" },
    activities: { ar: "الأنشطة", en: "Activities" },
  };
  return labels[category]?.[isAr ? "ar" : "en"] || category;
}

/**
 * Check all pending bookings and show push notifications for urgent ones
 */
export function checkAndNotifyUrgentBookings() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  
  const bookings = getPendingBookings();
  const now = new Date();
  
  bookings.forEach(booking => {
    const travelDate = new Date(booking.travelDate);
    const daysUntil = Math.ceil((travelDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil > 0 && daysUntil <= 3) {
      const lastNotified = localStorage.getItem(`push_notified_${booking.category}_${booking.travelDate}`);
      const today = now.toISOString().split("T")[0];
      
      if (lastNotified !== today) {
        showPushNotification(booking);
        localStorage.setItem(`push_notified_${booking.category}_${booking.travelDate}`, today);
      }
    }
  });
}

export function getPendingBookings(): SavedBooking[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function removePendingBooking(index: number) {
  const existing = getPendingBookings();
  existing.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export async function createBookingReminder(
  userId: string,
  category: string,
  destination: string,
  travelDate: string,
  isAr: boolean
) {
  const travelDateObj = new Date(travelDate);
  const now = new Date();
  const daysUntilTravel = Math.ceil((travelDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Create immediate notification
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "booking_reminder",
    title: isAr ? `📌 حجز محفوظ - ${getCategoryLabel(category, isAr)}` : `📌 Saved Booking - ${getCategoryLabel(category, false)}`,
    message: isAr
      ? `لديك حجز ${getCategoryLabel(category, true)} محفوظ لرحلتك إلى ${destination}. تبقى ${daysUntilTravel} يوم على موعد السفر.`
      : `You have a pending ${getCategoryLabel(category, false)} booking for your trip to ${destination}. ${daysUntilTravel} days until travel.`,
    metadata: { category, destination, travel_date: travelDate, reminder_type: "saved_booking" } as any,
  });

  // Create pre-travel reminder (3 days before)
  if (daysUntilTravel > 3) {
    const reminderDate = new Date(travelDateObj);
    reminderDate.setDate(reminderDate.getDate() - 3);

    await supabase.from("notifications").insert({
      user_id: userId,
      type: "booking_urgent",
      title: isAr ? `⚠️ تذكير عاجل - ${getCategoryLabel(category, isAr)}` : `⚠️ Urgent Reminder - ${getCategoryLabel(category, false)}`,
      message: isAr
        ? `رحلتك إلى ${destination} بعد 3 أيام! لم تكمل حجز ${getCategoryLabel(category, true)} بعد.`
        : `Your trip to ${destination} is in 3 days! You haven't completed your ${getCategoryLabel(category, false)} booking yet.`,
      metadata: { category, destination, travel_date: travelDate, reminder_type: "pre_travel", scheduled_for: reminderDate.toISOString() } as any,
    });
  }
}

function getCategoryLabel(category: string, isAr: boolean): string {
  const labels: Record<string, { ar: string; en: string }> = {
    flight: { ar: "الطيران", en: "Flight" },
    hotel: { ar: "الفندق", en: "Hotel" },
    car: { ar: "السيارة", en: "Car Rental" },
    transfer: { ar: "النقل", en: "Transfer" },
    activities: { ar: "الأنشطة", en: "Activities" },
  };
  return labels[category]?.[isAr ? "ar" : "en"] || category;
}

/**
 * Auto-update itinerary based on booking selections
 * Injects actual flight/hotel/car details into the itinerary activities
 */
export function applyBookingToItinerary(
  itinerary: any,
  selections: any,
  isAr: boolean
): any {
  if (!itinerary?.days?.length) return itinerary;

  const updated = JSON.parse(JSON.stringify(itinerary));
  const firstDay = updated.days[0];
  const lastDay = updated.days[updated.days.length - 1];

  const flightData = selections.flight?.data;
  const hotelData = selections.hotel?.data;
  const carData = selections.car?.data;
  const flightStatus = selections.flight?.status;
  const hotelStatus = selections.hotel?.status;
  const carStatus = selections.car?.status;

  // ── Flight → add arrival/departure with real details ──
  if (flightStatus === "booked" || flightStatus === "selected") {
    const hasArrivalTransfer = firstDay.activities?.some((a: any) =>
      a.type === "airport_transfer" || a.type === "flight_arrival"
    );

    if (!hasArrivalTransfer) {
      const depTime = flightData?.departure_at ? new Date(flightData.departure_at) : null;
      const arrivalTimeStr = depTime
        ? `${String(depTime.getHours()).padStart(2, "0")}:${String(depTime.getMinutes()).padStart(2, "0")}`
        : "08:00";
      const durationMins = flightData?.duration_to || 0;
      const arrivalHour = depTime ? depTime.getHours() + Math.floor(durationMins / 60) : 12;
      const landingTime = `${String(Math.min(arrivalHour, 23)).padStart(2, "0")}:00`;

      const statusBadge = flightStatus === "booked"
        ? (isAr ? "✅ مؤكد" : "✅ Confirmed")
        : (isAr ? "⏳ غير مؤكد" : "⏳ Pending");

      firstDay.activities.unshift({
        id: `flight-arrival-${Date.now()}`,
        title: isAr
          ? `🛬 رحلة الوصول - ${flightData?.airline || ""} ${flightData?.flight_number || ""}`
          : `🛬 Arrival Flight - ${flightData?.airline || ""} ${flightData?.flight_number || ""}`,
        description: isAr
          ? `${flightData?.origin || ""} → ${flightData?.destination || ""} | المغادرة: ${arrivalTimeStr} | المدة: ${Math.floor(durationMins / 60)}h ${durationMins % 60}m | ${flightData?.transfers === 0 ? "مباشر" : `${flightData?.transfers} توقف`} | السعر: $${flightData?.price || "—"} | الحالة: ${statusBadge}`
          : `${flightData?.origin || ""} → ${flightData?.destination || ""} | Departs: ${arrivalTimeStr} | Duration: ${Math.floor(durationMins / 60)}h ${durationMins % 60}m | ${flightData?.transfers === 0 ? "Direct" : `${flightData?.transfers} stop(s)`} | Price: $${flightData?.price || "—"} | Status: ${statusBadge}`,
        startTime: arrivalTimeStr,
        endTime: landingTime,
        type: "flight_arrival",
        cost: `$${flightData?.price || 0}`,
        bookingStatus: flightStatus,
        bookingLink: flightData?.link || "",
        bookingData: flightData,
      });
    }

    // Departure on last day
    const hasDeparture = lastDay.activities?.some((a: any) =>
      a.type === "airport_departure" || a.type === "flight_departure"
    );

    if (!hasDeparture) {
      const returnTime = flightData?.return_at ? new Date(flightData.return_at) : null;
      const depTimeStr = returnTime
        ? `${String(returnTime.getHours()).padStart(2, "0")}:${String(returnTime.getMinutes()).padStart(2, "0")}`
        : "18:00";

      lastDay.activities.push({
        id: `flight-departure-${Date.now()}`,
        title: isAr
          ? `🛫 رحلة المغادرة - ${flightData?.airline || ""} ${flightData?.flight_number || ""}`
          : `🛫 Departure Flight - ${flightData?.airline || ""} ${flightData?.flight_number || ""}`,
        description: isAr
          ? `${flightData?.destination || ""} → ${flightData?.origin || ""} | الحالة: ${flightStatus === "booked" ? "✅ مؤكد" : "⏳ غير مؤكد"}`
          : `${flightData?.destination || ""} → ${flightData?.origin || ""} | Status: ${flightStatus === "booked" ? "✅ Confirmed" : "⏳ Pending"}`,
        startTime: depTimeStr,
        endTime: `${String(Math.min(parseInt(depTimeStr) + 2, 23)).padStart(2, "0")}:00`,
        type: "flight_departure",
        cost: isAr ? "مشمول" : "Included",
        bookingStatus: flightStatus,
        bookingLink: flightData?.link || "",
      });
    }
  }

  // ── Hotel → add check-in/out with real details ──
  if (hotelStatus === "booked" || hotelStatus === "selected") {
    const hasCheckin = firstDay.activities?.some((a: any) =>
      a.type === "hotel_checkin"
    );

    if (!hasCheckin) {
      const statusBadge = hotelStatus === "booked"
        ? (isAr ? "✅ مؤكد" : "✅ Confirmed")
        : (isAr ? "⏳ غير مؤكد" : "⏳ Pending");

      const insertIdx = firstDay.activities.findIndex((a: any) => {
        const [h] = (a.startTime || "12:00").split(":").map(Number);
        return h >= 14;
      });

      const checkinActivity = {
        id: `hotel-checkin-${Date.now()}`,
        title: isAr
          ? `🏨 تسجيل الدخول - ${hotelData?.hotelName || "الفندق"}`
          : `🏨 Check-in - ${hotelData?.hotelName || "Hotel"}`,
        description: isAr
          ? `${"⭐".repeat(hotelData?.stars || 0)} | السعر: $${hotelData?.price || "—"}/ليلة | التقييم: ${hotelData?.rating || "—"}/10 | الحالة: ${statusBadge}`
          : `${"⭐".repeat(hotelData?.stars || 0)} | Price: $${hotelData?.price || "—"}/night | Rating: ${hotelData?.rating || "—"}/10 | Status: ${statusBadge}`,
        startTime: "14:00",
        endTime: "14:30",
        type: "hotel_checkin",
        cost: `$${hotelData?.price || 0}/night`,
        bookingStatus: hotelStatus,
        bookingLink: hotelData?.link || "",
        bookingData: hotelData,
        imageUrl: hotelData?.image || "",
      };
      if (insertIdx >= 0) firstDay.activities.splice(insertIdx, 0, checkinActivity);
      else firstDay.activities.push(checkinActivity);
    }

    // Checkout on last day
    const hasCheckout = lastDay.activities?.some((a: any) =>
      a.type === "hotel_checkout"
    );

    if (!hasCheckout) {
      lastDay.activities.unshift({
        id: `hotel-checkout-${Date.now()}`,
        title: isAr
          ? `🏨 مغادرة - ${hotelData?.hotelName || "الفندق"}`
          : `🏨 Check-out - ${hotelData?.hotelName || "Hotel"}`,
        description: isAr ? "تسليم الغرفة ومغادرة الفندق" : "Check out and leave hotel",
        startTime: "09:00",
        endTime: "09:30",
        type: "hotel_checkout",
        cost: isAr ? "مشمول" : "Included",
        bookingStatus: hotelStatus,
        bookingLink: hotelData?.link || "",
      });
    }
  }

  // ── Car → add pickup/return with real details ──
  if (carStatus === "booked" || carStatus === "selected") {
    const hasCarPickup = firstDay.activities?.some((a: any) =>
      a.type === "car_pickup"
    );

    if (!hasCarPickup) {
      const statusBadge = carStatus === "booked"
        ? (isAr ? "✅ مؤكد" : "✅ Confirmed")
        : (isAr ? "⏳ غير مؤكد" : "⏳ Pending");

      firstDay.activities.splice(Math.min(1, firstDay.activities.length), 0, {
        id: `car-pickup-${Date.now()}`,
        title: isAr
          ? `🚗 استلام السيارة - ${carData?.name || ""}`
          : `🚗 Car Pickup - ${carData?.name || ""}`,
        description: isAr
          ? `${carData?.className || carData?.type || ""} | ${carData?.vendor || ""} | ${carData?.transmission || ""} | ${carData?.seats || ""} مقاعد | السعر: $${carData?.price || "—"}/يوم | الحالة: ${statusBadge}`
          : `${carData?.className || carData?.type || ""} | ${carData?.vendor || ""} | ${carData?.transmission || ""} | ${carData?.seats || ""} seats | Price: $${carData?.price || "—"}/day | Status: ${statusBadge}`,
        startTime: "10:00",
        endTime: "10:30",
        type: "car_pickup",
        cost: `$${carData?.price || 0}/day`,
        bookingStatus: carStatus,
        bookingLink: carData?.link || "",
        bookingData: carData,
        imageUrl: carData?.image || "",
      });
    }

    const hasCarReturn = lastDay.activities?.some((a: any) =>
      a.type === "car_return"
    );

    if (!hasCarReturn) {
      lastDay.activities.push({
        id: `car-return-${Date.now()}`,
        title: isAr
          ? `🚗 تسليم السيارة - ${carData?.name || ""}`
          : `🚗 Return Car - ${carData?.name || ""}`,
        description: isAr ? "تسليم السيارة لمكتب التأجير" : "Return car to rental agency",
        startTime: "17:00",
        endTime: "17:30",
        type: "car_return",
        cost: isAr ? "مشمول" : "Included",
        bookingStatus: carStatus,
        bookingLink: carData?.link || "",
      });
    }
  }

  // Re-sort activities by time
  updated.days.forEach((day: any) => {
    if (day.activities) {
      day.activities.sort((a: any, b: any) => (a.startTime || "12:00").localeCompare(b.startTime || "12:00"));
    }
  });

  updated.bookingSelections = selections;
  return updated;
}
