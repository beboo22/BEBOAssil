
-- Destinations table for admin to manage Popular Destinations
CREATE TABLE public.destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  description_ar TEXT,
  rating NUMERIC(2,1) NOT NULL DEFAULT 4.5,
  avg_price NUMERIC(10,2) NOT NULL DEFAULT 100,
  best_season TEXT NOT NULL DEFAULT 'Winter',
  highlights JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

-- Anyone can read active destinations
CREATE POLICY "Anyone can read active destinations"
  ON public.destinations FOR SELECT
  USING (is_active = true);

-- Admins can manage all destinations
CREATE POLICY "Admins can manage destinations"
  ON public.destinations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed with existing destinations
INSERT INTO public.destinations (city, country, code, image, description, rating, avg_price, best_season, highlights, sort_order) VALUES
('Mecca', 'Saudi Arabia', 'JED', 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?q=80&w=2070&auto=format&fit=crop', 'The holiest city in Islam — Masjid al-Haram, Kaaba, Mount Arafat, and a deeply spiritual journey', 4.9, 180, 'Winter', '["Masjid al-Haram", "Kaaba", "Mount Arafat", "Mina"]', 0),
('Medina', 'Saudi Arabia', 'MED', 'https://images.unsplash.com/photo-1590076215667-875c2d76b1d2?q=80&w=2070&auto=format&fit=crop', 'The Prophet''s city — Al-Masjid an-Nabawi, Quba Mosque, Mount Uhud, and serene spiritual atmosphere', 4.9, 150, 'Winter', '["Al-Masjid an-Nabawi", "Quba Mosque", "Mount Uhud", "Qiblatain Mosque"]', 1),
('Riyadh', 'Saudi Arabia', 'RUH', 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?q=80&w=2070&auto=format&fit=crop', 'The Saudi capital with historic Diriyah, Boulevard entertainment, and modern transformation', 4.4, 120, 'Winter', '["Diriyah", "Boulevard Riyadh", "Kingdom Tower", "Edge of the World"]', 2),
('Jeddah', 'Saudi Arabia', 'JED', 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?q=80&w=2070&auto=format&fit=crop', 'The Red Sea bride — historic Al-Balad, Jeddah Corniche, floating mosque, and vibrant culture', 4.5, 110, 'Spring', '["Al-Balad Historic Area", "King Fahd Fountain", "Corniche", "Floating Mosque"]', 3),
('Dubai', 'UAE', 'DXB', 'https://images.unsplash.com/photo-1518684079-3c830dcef090?q=80&w=2080&auto=format&fit=crop', 'A city of luxury — Burj Khalifa, desert safaris, gold souks, and world-class shopping malls', 4.7, 200, 'Winter', '["Burj Khalifa", "Desert Safari", "Dubai Mall", "Palm Jumeirah"]', 4),
('Abu Dhabi', 'UAE', 'AUH', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2070&auto=format&fit=crop', 'Culture capital with Sheikh Zayed Grand Mosque, Louvre Abu Dhabi, and Yas Island adventures', 4.6, 180, 'Winter', '["Sheikh Zayed Mosque", "Louvre Abu Dhabi", "Yas Island", "Corniche Beach"]', 5),
('Doha', 'Qatar', 'DOH', 'https://images.unsplash.com/photo-1572096259886-6bded6e7be4b?q=80&w=2070&auto=format&fit=crop', 'The Pearl of the Gulf — Souq Waqif, Museum of Islamic Art, The Pearl island, and desert adventures', 4.5, 160, 'Winter', '["Souq Waqif", "Museum of Islamic Art", "The Pearl", "Katara Cultural Village"]', 6),
('Muscat', 'Oman', 'MCT', 'https://images.unsplash.com/photo-1587308263806-3820cd8e0e78?q=80&w=2070&auto=format&fit=crop', 'Stunning natural beauty — Sultan Qaboos Grand Mosque, Mutrah Souq, and pristine coastline', 4.5, 100, 'Winter', '["Sultan Qaboos Mosque", "Mutrah Souq", "Royal Opera House", "Wadi Shab"]', 7),
('Istanbul', 'Turkey', 'IST', 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=2071&auto=format&fit=crop', 'Where East meets West — Hagia Sophia, Grand Bazaar, Bosphorus cruises, and Turkish delights', 4.6, 80, 'Spring', '["Hagia Sophia", "Grand Bazaar", "Bosphorus Cruise", "Blue Mosque"]', 8),
('Paris', 'France', 'CDG', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=2073&auto=format&fit=crop', 'Enjoy the romance of the City of Lights with the Eiffel Tower, Louvre Museum, and charming cafés along the Seine', 4.8, 150, 'Spring', '["Eiffel Tower", "Louvre Museum", "Seine River", "Montmartre"]', 9),
('London', 'UK', 'LHR', 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=2070&auto=format&fit=crop', 'Big Ben, Buckingham Palace, world-class museums, and iconic red double-decker buses', 4.7, 170, 'Summer', '["Big Ben", "British Museum", "Tower of London", "Hyde Park"]', 10),
('Tokyo', 'Japan', 'NRT', 'https://images.unsplash.com/photo-1532236204992-f5e85c024202?q=80&w=2071&auto=format&fit=crop', 'Discover the perfect blend of modernity and tradition — Shibuya, temples, sushi markets, and neon nightlife', 4.9, 120, 'Autumn', '["Shibuya Crossing", "Senso-ji Temple", "Tsukiji Market", "Mount Fuji"]', 11),
('Cairo', 'Egypt', 'CAI', 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?q=80&w=2070&auto=format&fit=crop', 'The Great Pyramids, Sphinx, Egyptian Museum, and a cruise down the Nile River', 4.5, 50, 'Winter', '["Pyramids of Giza", "Egyptian Museum", "Khan el-Khalili", "Nile Cruise"]', 12),
('Bali', 'Indonesia', 'DPS', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=2038&auto=format&fit=crop', 'Tropical paradise with rice terraces, ancient temples, surf beaches, and wellness retreats', 4.8, 60, 'Summer', '["Ubud Rice Terraces", "Tanah Lot Temple", "Seminyak Beach", "Sacred Monkey Forest"]', 13),
('Maldives', 'Maldives', 'MLE', 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?q=80&w=2065&auto=format&fit=crop', 'Crystal clear waters, overwater villas, world-class diving, and ultimate relaxation', 4.9, 300, 'Winter', '["Overwater Villas", "Snorkeling", "Sunset Dolphins", "Underwater Restaurant"]', 14),
('New York', 'USA', 'JFK', 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=2070&auto=format&fit=crop', 'Experience Central Park, Times Square, Broadway shows, and the Statue of Liberty', 4.6, 180, 'Autumn', '["Times Square", "Central Park", "Statue of Liberty", "Broadway"]', 15);
