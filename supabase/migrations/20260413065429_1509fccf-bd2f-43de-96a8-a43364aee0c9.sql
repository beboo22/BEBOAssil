
-- Partner listings table for hotels, cars, apartments, activities
CREATE TABLE public.partner_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_type text NOT NULL DEFAULT 'hotel',
  title text NOT NULL,
  title_ar text,
  description text NOT NULL DEFAULT '',
  description_ar text,
  city text NOT NULL,
  country text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  media_urls text[] DEFAULT '{}'::text[],
  booking_url text,
  contact_phone text,
  contact_email text,
  contact_whatsapp text,
  specs jsonb DEFAULT '{}'::jsonb,
  amenities text[] DEFAULT '{}'::text[],
  rating numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  address text,
  latitude numeric,
  longitude numeric,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  start_date date,
  end_date date,
  partner_name text,
  partner_logo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active partner listings" ON public.partner_listings
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage partner listings" ON public.partner_listings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_partner_listings_updated_at
  BEFORE UPDATE ON public.partner_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Products table for store
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  name_ar text,
  description text NOT NULL DEFAULT '',
  description_ar text,
  category text NOT NULL DEFAULT 'general',
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  media_urls text[] DEFAULT '{}'::text[],
  stock_quantity integer DEFAULT 0,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  specs jsonb DEFAULT '{}'::jsonb,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Orders table for purchases
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  order_type text NOT NULL DEFAULT 'product',
  item_id uuid NOT NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  payment_reference text,
  shipping_address jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all orders" ON public.orders
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
