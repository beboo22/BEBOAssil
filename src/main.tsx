import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ThemeProvider } from './providers/ThemeProvider'
import { checkAndNotifyUrgentBookings } from './utils/bookingReminders'

// Check urgent bookings on app load
setTimeout(() => checkAndNotifyUrgentBookings(), 3000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="travel-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)
