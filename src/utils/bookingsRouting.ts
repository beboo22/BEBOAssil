export type BookingsTab = "flights" | "hotels" | "cars" | "transfers";

interface BuildBookingsRouteParams {
  tab: BookingsTab;
  from?: string;
  to?: string;
  date?: Date | string;
  returnDate?: Date | string;
  guests?: number;
  itineraryId?: string;
}

const formatRouteDate = (value?: Date | string) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).split("T")[0];
};

export const buildBookingsRoute = ({ tab, from, to, date, returnDate, guests, itineraryId }: BuildBookingsRouteParams) => {
  const params = new URLSearchParams();
  params.set("tab", tab);

  if (from?.trim()) params.set("from", from.trim());
  if (to?.trim()) params.set("to", to.trim());

  const formattedDate = formatRouteDate(date);
  const formattedReturnDate = formatRouteDate(returnDate);

  if (formattedDate) params.set("date", formattedDate);
  if (formattedReturnDate) params.set("returnDate", formattedReturnDate);
  if (typeof guests === "number" && guests > 0) params.set("guests", String(guests));
  if (itineraryId?.trim()) params.set("itineraryId", itineraryId.trim());

  return `/bookings?${params.toString()}`;
};