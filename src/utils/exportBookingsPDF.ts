import jsPDF from "jspdf";
import { getPendingBookings, type SavedBooking } from "./bookingReminders";

export function exportBookingsPDF(bookings?: SavedBooking[], isAr = false) {
  const items = bookings || getPendingBookings();
  if (items.length === 0) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(0, 169, 145);
  doc.text(isAr ? "Saved Bookings Report" : "Saved Bookings Report", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: "center" });
  y += 15;

  items.forEach((booking, index) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    // Category badge
    doc.setFillColor(0, 169, 145);
    doc.roundedRect(15, y - 4, 40, 8, 2, 2, "F");
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.text(booking.category.toUpperCase(), 35, y + 1, { align: "center" });

    doc.setTextColor(50);
    doc.setFontSize(11);
    doc.text(`${booking.destination}`, 60, y + 1);
    y += 12;

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Travel Date: ${booking.travelDate}`, 20, y);
    y += 5;
    doc.text(`Status: ${booking.status}`, 20, y);
    y += 5;
    doc.text(`Saved: ${new Date(booking.savedAt).toLocaleDateString()}`, 20, y);
    y += 8;

    // Separator
    doc.setDrawColor(220);
    doc.line(15, y, pageWidth - 15, y);
    y += 8;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Powered by Aseel AI Trip Planner", pageWidth / 2, 290, { align: "center" });

  doc.save("saved-bookings.pdf");
}
