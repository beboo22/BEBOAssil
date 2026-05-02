-- ============================================================
-- ASEEL AI TRIP - Full Database Backup
-- Generated: 2026-03-16
-- Project: vdcwzcurjhkjxadehuhm
-- ============================================================

-- ===================== ENUMS =====================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- ===================== TABLES =====================

-- profiles
CREATE TABLE public.profiles (
    id uuid NOT NULL PRIMARY KEY,
    email text,
    full_name text,
    avatar_url text,
    preferred_currency text DEFAULT 'USD',
    preferred_language text DEFAULT 'en',
    travel_interests text[] DEFAULT '{}',
    total_points integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_roles
CREATE TABLE public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- destinations
CREATE TABLE public.destinations (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    city text NOT NULL,
    country text NOT NULL,
    code text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    description_ar text,
    image text NOT NULL,
    rating numeric NOT NULL DEFAULT 4.5,
    avg_price numeric NOT NULL DEFAULT 100,
    best_season text NOT NULL DEFAULT 'Winter',
    highlights jsonb DEFAULT '[]',
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- subscription_plans
CREATE TABLE public.subscription_plans (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    name_ar text,
    description text,
    description_ar text,
    price numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    duration_days integer NOT NULL DEFAULT 30,
    daily_limit integer NOT NULL DEFAULT 50,
    features jsonb DEFAULT '[]',
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_subscriptions
CREATE TABLE public.user_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    plan_id uuid REFERENCES public.subscription_plans(id),
    status text NOT NULL DEFAULT 'active',
    starts_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- site_settings
CREATE TABLE public.site_settings (
    id text NOT NULL DEFAULT 'default' PRIMARY KEY,
    guest_trial_limit integer NOT NULL DEFAULT 1,
    free_user_daily_limit integer NOT NULL DEFAULT 5,
    announcement_banner_enabled boolean DEFAULT false,
    announcement_banner_text text DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- comments
CREATE TABLE public.comments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    destination text NOT NULL,
    content text NOT NULL,
    rating integer,
    user_name text,
    user_avatar text,
    status text NOT NULL DEFAULT 'pending',
    type text NOT NULL DEFAULT 'comment',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- favorites
CREATE TABLE public.favorites (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    place_name text NOT NULL,
    place_type text,
    destination text,
    image_url text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications
CREATE TABLE public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    type text NOT NULL DEFAULT 'general',
    title text NOT NULL,
    message text NOT NULL,
    read boolean NOT NULL DEFAULT false,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- saved_trips
CREATE TABLE public.saved_trips (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    trip_id text NOT NULL,
    destination text NOT NULL,
    trip_data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- shared_trips
CREATE TABLE public.shared_trips (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id text NOT NULL,
    destination text NOT NULL,
    trip_data jsonb NOT NULL,
    share_code text NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
    shared_by uuid,
    shared_with_email text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- search_history
CREATE TABLE public.search_history (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    search_type text NOT NULL DEFAULT 'trip',
    query_text text,
    destination text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- search_analytics
CREATE TABLE public.search_analytics (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    guest_id text,
    search_query text,
    search_type text DEFAULT 'trip',
    destination text,
    results_count integer DEFAULT 0,
    clicked_result text,
    session_id text,
    user_agent text,
    ip_address inet,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- usage_tracking
CREATE TABLE public.usage_tracking (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    guest_id text,
    feature text NOT NULL DEFAULT 'planner',
    used_at timestamptz NOT NULL DEFAULT now()
);

-- discount_codes
CREATE TABLE public.discount_codes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL,
    description text,
    discount_percent integer DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    applicable_to text DEFAULT 'all',
    max_uses integer DEFAULT 0,
    current_uses integer DEFAULT 0,
    is_active boolean DEFAULT true,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- travel_stories
CREATE TABLE public.travel_stories (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    title text NOT NULL,
    content text NOT NULL,
    location_name text,
    latitude numeric,
    longitude numeric,
    media_urls text[] DEFAULT '{}',
    video_url text,
    trip_data jsonb,
    likes_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- story_comments
CREATE TABLE public.story_comments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.travel_stories(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    content text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- story_likes
CREATE TABLE public.story_likes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.travel_stories(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- story_reports
CREATE TABLE public.story_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.travel_stories(id),
    reported_by uuid NOT NULL REFERENCES public.profiles(id),
    reviewed_by uuid REFERENCES public.profiles(id),
    reason text NOT NULL DEFAULT 'other',
    details text,
    status text NOT NULL DEFAULT 'pending',
    resolution_notes text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- user_follows
CREATE TABLE public.user_follows (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id uuid NOT NULL REFERENCES public.profiles(id),
    following_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- user_points
CREATE TABLE public.user_points (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    points integer NOT NULL,
    reason text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- user_vehicles
CREATE TABLE public.user_vehicles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    year integer,
    color text,
    license_plate text,
    fuel_type text DEFAULT 'gasoline',
    fuel_consumption numeric,
    fuel_capacity numeric,
    is_primary boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- vehicle_analytics
CREATE TABLE public.vehicle_analytics (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    vehicle_id uuid,
    destination text,
    trip_distance numeric,
    fuel_cost numeric,
    fuel_stops integer DEFAULT 0,
    trip_date date,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== FUNCTIONS =====================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_shared_trip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
  sharer_name text;
BEGIN
  IF NEW.shared_with_email IS NOT NULL THEN
    SELECT p.id INTO target_user_id FROM public.profiles p WHERE p.email = NEW.shared_with_email;
    IF target_user_id IS NOT NULL THEN
      SELECT COALESCE(p.full_name, p.email, 'Someone') INTO sharer_name FROM public.profiles p WHERE p.id = NEW.shared_by;
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (target_user_id, 'trip_shared', 'رحلة جديدة مشاركة معك', sharer_name || ' شارك معك رحلة إلى ' || NEW.destination, jsonb_build_object('share_code', NEW.share_code, 'destination', NEW.destination, 'shared_by', NEW.shared_by));
    END IF;
  END IF;
  IF NEW.shared_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (NEW.shared_by, 'trip_share_created', 'تمت مشاركة رحلتك بنجاح', 'تمت مشاركة رحلتك إلى ' || NEW.destination || CASE WHEN NEW.shared_with_email IS NOT NULL THEN ' مع ' || NEW.shared_with_email ELSE '' END, jsonb_build_object('share_code', NEW.share_code, 'destination', NEW.destination));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_single_primary_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.user_vehicles SET is_primary = false WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_story_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  story_owner_id uuid;
  commenter_name text;
  story_title text;
BEGIN
  SELECT ts.user_id, ts.title INTO story_owner_id, story_title FROM public.travel_stories ts WHERE ts.id = NEW.story_id;
  IF story_owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(p.full_name, p.email, 'مسافر') INTO commenter_name FROM public.profiles p WHERE p.id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (story_owner_id, 'story_comment', 'تعليق جديد على قصتك', commenter_name || ' علّق على قصتك "' || LEFT(story_title, 50) || '"', jsonb_build_object('story_id', NEW.story_id, 'comment_id', NEW.id, 'commenter_id', NEW.user_id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_story_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  story_owner_id uuid;
  liker_name text;
  story_title text;
BEGIN
  SELECT ts.user_id, ts.title INTO story_owner_id, story_title FROM public.travel_stories ts WHERE ts.id = NEW.story_id;
  IF story_owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(p.full_name, p.email, 'مسافر') INTO liker_name FROM public.profiles p WHERE p.id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (story_owner_id, 'story_like', 'إعجاب جديد بقصتك', liker_name || ' أعجب بقصتك "' || LEFT(story_title, 50) || '"', jsonb_build_object('story_id', NEW.story_id, 'liker_id', NEW.user_id));
  RETURN NEW;
END;
$$;

-- ===================== RLS POLICIES =====================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view public profile info" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active destinations" ON public.destinations FOR SELECT TO public USING (is_active = true);
CREATE POLICY "Admins can manage destinations" ON public.destinations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active plans" ON public.subscription_plans FOR SELECT TO public USING (is_active = true);
CREATE POLICY "Admins can manage plans" ON public.subscription_plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscriptions" ON public.user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all subscriptions" ON public.user_subscriptions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT TO public USING (true);
CREATE POLICY "Admins can manage site settings" ON public.site_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read approved comments" ON public.comments FOR SELECT TO public USING (status = 'approved');
CREATE POLICY "Authenticated users can insert comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can read own comments" ON public.comments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own pending comments" ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending') WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all comments" ON public.comments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own favorites" ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all favorites" ON public.favorites FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own trips" ON public.saved_trips FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all trips" ON public.saved_trips FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.shared_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view shared trips" ON public.shared_trips FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can create shared trips" ON public.shared_trips FOR INSERT TO authenticated WITH CHECK (shared_by = auth.uid());
CREATE POLICY "Users can delete their own shared trips" ON public.shared_trips FOR DELETE TO authenticated USING (shared_by = auth.uid());
CREATE POLICY "Admins can manage all shared trips" ON public.shared_trips FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own history" ON public.search_history FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all history" ON public.search_history FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert search analytics" ON public.search_analytics FOR INSERT TO public WITH CHECK ((user_id IS NOT NULL AND user_id = auth.uid()) OR (user_id IS NULL AND guest_id IS NOT NULL));
CREATE POLICY "Admins can view all search analytics" ON public.search_analytics FOR SELECT TO public USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert own usage" ON public.usage_tracking FOR INSERT TO public WITH CHECK ((user_id IS NULL AND guest_id IS NOT NULL) OR (user_id = auth.uid()));
CREATE POLICY "Users can read own usage" ON public.usage_tracking FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all usage" ON public.usage_tracking FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active discount codes" ON public.discount_codes FOR SELECT TO public USING (is_active = true);
CREATE POLICY "Admins can manage discount codes" ON public.discount_codes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.travel_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stories" ON public.travel_stories FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own stories" ON public.travel_stories FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own stories" ON public.travel_stories FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own stories" ON public.travel_stories FOR DELETE TO public USING (user_id = auth.uid());

ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments" ON public.story_comments FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own comments" ON public.story_comments FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own comments" ON public.story_comments FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own comments" ON public.story_comments FOR DELETE TO public USING (user_id = auth.uid());

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON public.story_likes FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own likes" ON public.story_likes FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own likes" ON public.story_likes FOR DELETE TO public USING (user_id = auth.uid());

ALTER TABLE public.story_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create their own story reports" ON public.story_reports FOR INSERT TO authenticated WITH CHECK (reported_by = auth.uid());
CREATE POLICY "Users can view their own story reports" ON public.story_reports FOR SELECT TO authenticated USING (reported_by = auth.uid());
CREATE POLICY "Admins can manage all story reports" ON public.story_reports FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view follows" ON public.user_follows FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own follows" ON public.user_follows FOR INSERT TO public WITH CHECK (follower_id = auth.uid());
CREATE POLICY "Users can delete their own follows" ON public.user_follows FOR DELETE TO public USING (follower_id = auth.uid());

ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own points" ON public.user_points FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "Admins can view all points" ON public.user_points FOR SELECT TO public USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage points" ON public.user_points FOR ALL TO public USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own vehicles" ON public.user_vehicles FOR ALL TO public USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all vehicles" ON public.user_vehicles FOR SELECT TO public USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.vehicle_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own analytics" ON public.vehicle_analytics FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own analytics" ON public.vehicle_analytics FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all analytics" ON public.vehicle_analytics FOR ALL TO public USING (has_role(auth.uid(), 'admin'));

-- ===================== DATA: profiles =====================
INSERT INTO public.profiles (id, email, full_name, avatar_url, preferred_currency, preferred_language, total_points, travel_interests, created_at, updated_at) VALUES
('202d7b2b-6f0e-4719-91a9-96362deee27f', 'aseelsuport2025ai@gmail.com', 'ASEEL AI', 'https://lh3.googleusercontent.com/a/ACg8ocKPz9DShqYha6P3mBEhMIeAgwmScgvHBuW7N9Lghm0hyXgLf8M=s96-c', 'USD', 'en', 0, '{}', '2026-03-08 21:08:45.268138+00', '2026-03-08 21:08:45.268138+00'),
('b43d77f0-4320-4cb9-97ee-f643e1fed6cc', 'aseel@aitrip.com', 'Aseel', '', 'USD', 'en', 0, '{}', '2026-03-08 23:03:51.37492+00', '2026-03-08 23:03:51.37492+00'),
('0c77c9e4-d274-447b-91cc-ed8009994258', 'asellohaib@gmail.com', 'أصيل اللهيبي', 'https://lh3.googleusercontent.com/a/ACg8ocIziQRrfLM7qTcX-x5aI3jBRLoy41xuLlt5ir3kXsr85Ravrg=s96-c', 'USD', 'en', 0, '{}', '2026-03-10 11:13:31.811254+00', '2026-03-10 11:13:31.811254+00'),
('8590666e-025b-4782-9a50-5bf432c5d35c', 'behf154@gmail.com', '', '', 'USD', 'en', 0, '{}', '2026-03-16 06:30:36.808357+00', '2026-03-16 06:30:36.808357+00'),
('0a7f3937-a6dd-46ae-a59b-27097f41180c', 'shehab170kj@gmail.com', '', '', 'USD', 'en', 0, '{}', '2026-03-16 06:31:44.428141+00', '2026-03-16 06:31:44.428141+00'),
('18fd529b-e776-404b-9404-c5a7bfeecb2d', 'shehabhosny889@gmail.com', 'shehab hosny Mohamed', '', 'USD', 'en', 0, '{}', '2026-03-16 06:56:30.520568+00', '2026-03-16 06:56:30.520568+00'),
('10c39346-3de1-4d22-be53-064bb8ccb48b', 'shehab170@gmail.com', 'shehab hosny Mohamed', '', 'USD', 'en', 0, '{}', '2026-03-16 07:14:23.234764+00', '2026-03-16 07:14:23.234764+00'),
('d3777961-c72f-434f-b887-7107434ed9dd', 'shehab170k@gmail.com', 'shehab', '', 'USD', 'en', 0, '{}', '2026-03-16 07:26:13.654007+00', '2026-03-16 07:26:13.654007+00'),
('54a079fa-26eb-42df-961b-99067da80c0a', 'beh54@gmail.com', 'shehab hosny Mohamed', '', 'USD', 'en', 0, '{}', '2026-03-16 14:35:59.002508+00', '2026-03-16 14:35:59.002508+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: user_roles =====================
INSERT INTO public.user_roles (id, user_id, role) VALUES
('9ed5d038-597e-433b-93d5-2677751b40ca', '202d7b2b-6f0e-4719-91a9-96362deee27f', 'user'),
('4f67f84e-45c5-4d51-b4d2-e226c7f0a1b7', 'b43d77f0-4320-4cb9-97ee-f643e1fed6cc', 'user'),
('b5a9e43e-2c7b-4d7d-a50f-12df8520e7d8', 'b43d77f0-4320-4cb9-97ee-f643e1fed6cc', 'admin'),
('5f5bb666-cffa-42ad-8e0c-77c1ae38fc6d', '0c77c9e4-d274-447b-91cc-ed8009994258', 'user'),
('033c012e-9ee8-4323-a9f2-99cf571d6f16', '8590666e-025b-4782-9a50-5bf432c5d35c', 'user'),
('d5f1dd12-3c45-4bd3-b1f0-3b35ba8dcf31', '0a7f3937-a6dd-46ae-a59b-27097f41180c', 'user'),
('50e820d1-c134-4960-91d2-741d0ccd860e', '18fd529b-e776-404b-9404-c5a7bfeecb2d', 'user'),
('32633cae-477c-4e51-8351-3a6e7af7e062', '10c39346-3de1-4d22-be53-064bb8ccb48b', 'user'),
('71b1b19d-5a60-425c-bf09-8e9e3e0cabfa', 'd3777961-c72f-434f-b887-7107434ed9dd', 'user'),
('9ffe0664-7edb-4328-abb3-297c7cc4e443', '54a079fa-26eb-42df-961b-99067da80c0a', 'user')
ON CONFLICT (user_id, role) DO NOTHING;

-- ===================== DATA: destinations =====================
INSERT INTO public.destinations (id, city, country, code, description, image, rating, avg_price, best_season, highlights, is_active, sort_order, created_at, updated_at) VALUES
('730b498a-f9d3-4620-b92b-c505a282433b', 'Mecca', 'Saudi Arabia', 'JED', 'The holiest city in Islam — Masjid al-Haram, Kaaba, Mount Arafat, and a deeply spiritual journey', 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?q=80&w=2070&auto=format&fit=crop', 4.9, 180, 'Winter', '["Masjid al-Haram","Kaaba","Mount Arafat","Mina"]', true, 0, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('a5caa49f-820c-438d-96ab-893c9ff404bb', 'Medina', 'Saudi Arabia', 'MED', 'The Prophet''s city — Al-Masjid an-Nabawi, Quba Mosque, Mount Uhud, and serene spiritual atmosphere', 'https://images.unsplash.com/photo-1590076215667-875c2d76b1d2?q=80&w=2070&auto=format&fit=crop', 4.9, 150, 'Winter', '["Al-Masjid an-Nabawi","Quba Mosque","Mount Uhud","Qiblatain Mosque"]', true, 1, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('807e27af-a880-4886-9c17-36e4d888a5d8', 'Riyadh', 'Saudi Arabia', 'RUH', 'The Saudi capital with historic Diriyah, Boulevard entertainment, and modern transformation', 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?q=80&w=2070&auto=format&fit=crop', 4.4, 120, 'Winter', '["Diriyah","Boulevard Riyadh","Kingdom Tower","Edge of the World"]', true, 2, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('51f5cfaa-a25b-41ba-94a8-f368dc02b82f', 'Jeddah', 'Saudi Arabia', 'JED', 'The Red Sea bride — historic Al-Balad, Jeddah Corniche, floating mosque, and vibrant culture', 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?q=80&w=2070&auto=format&fit=crop', 4.5, 110, 'Spring', '["Al-Balad Historic Area","King Fahd Fountain","Corniche","Floating Mosque"]', true, 3, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('5407ca38-726d-4520-b1ed-86a0261b296d', 'Dubai', 'UAE', 'DXB', 'A city of luxury — Burj Khalifa, desert safaris, gold souks, and world-class shopping malls', 'https://images.unsplash.com/photo-1518684079-3c830dcef090?q=80&w=2080&auto=format&fit=crop', 4.7, 200, 'Winter', '["Burj Khalifa","Desert Safari","Dubai Mall","Palm Jumeirah"]', true, 4, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('a4c07690-4639-43e5-9239-3acc9862bf10', 'Abu Dhabi', 'UAE', 'AUH', 'Culture capital with Sheikh Zayed Grand Mosque, Louvre Abu Dhabi, and Yas Island adventures', 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2070&auto=format&fit=crop', 4.6, 180, 'Winter', '["Sheikh Zayed Mosque","Louvre Abu Dhabi","Yas Island","Corniche Beach"]', true, 5, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('1edc955c-9086-4b31-8920-7974ef776077', 'Doha', 'Qatar', 'DOH', 'The Pearl of the Gulf — Souq Waqif, Museum of Islamic Art, The Pearl island, and desert adventures', 'https://images.unsplash.com/photo-1572096259886-6bded6e7be4b?q=80&w=2070&auto=format&fit=crop', 4.5, 160, 'Winter', '["Souq Waqif","Museum of Islamic Art","The Pearl","Katara Cultural Village"]', true, 6, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('d8db8270-6a09-4515-8981-340bf92aa64b', 'Muscat', 'Oman', 'MCT', 'Stunning natural beauty — Sultan Qaboos Grand Mosque, Mutrah Souq, and pristine coastline', 'https://images.unsplash.com/photo-1587308263806-3820cd8e0e78?q=80&w=2070&auto=format&fit=crop', 4.5, 100, 'Winter', '["Sultan Qaboos Mosque","Mutrah Souq","Royal Opera House","Wadi Shab"]', true, 7, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00'),
('6dcea969-6516-4adf-8fd5-80649986efc9', 'Istanbul', 'Turkey', 'IST', 'Where East meets West — Hagia Sophia, Grand Bazaar, Bosphorus cruises, and Turkish delights', 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=2071&auto=format&fit=crop', 4.6, 80, 'Spring', '["Hagia Sophia","Grand Bazaar","Bosphorus Cruise","Blue Mosque"]', true, 8, '2026-03-08 23:33:05.827897+00', '2026-03-08 23:33:05.827897+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: subscription_plans =====================
INSERT INTO public.subscription_plans (id, name, name_ar, description, description_ar, price, currency, duration_days, daily_limit, features, is_active, sort_order) VALUES
('0b499261-c597-4bee-a50d-65e07030078c', 'Free', 'مجاني', 'Basic trip planning', 'تخطيط رحلات أساسي', 0, 'USD', 9999, 5, '["5 daily plans","Basic features"]', true, 0),
('2274ca9e-e77c-430e-9127-b6f0f366fe47', 'Pro', 'احترافي', 'Unlimited trip planning with premium features', 'تخطيط رحلات غير محدود مع ميزات متقدمة', 9.99, 'USD', 30, 100, '["100 daily plans","Voice mode","Priority support"]', true, 1),
('1372db2f-b687-4cef-9251-eae1824baef5', 'Business', 'أعمال', 'For travel agencies and businesses', 'لوكالات السفر والشركات', 29.99, 'USD', 30, 999, '["Unlimited plans","API access","Team features","Custom branding"]', true, 2)
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: site_settings =====================
INSERT INTO public.site_settings (id, guest_trial_limit, free_user_daily_limit, announcement_banner_enabled, announcement_banner_text) VALUES
('default', 1, 5, false, '')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: notifications =====================
INSERT INTO public.notifications (id, user_id, type, title, message, read, metadata, created_at) VALUES
('df26c067-7314-4bb3-ab05-5198fb3e211a', '0c77c9e4-d274-447b-91cc-ed8009994258', 'trip_share_created', 'تمت مشاركة رحلتك بنجاح', 'تمت مشاركة رحلتك إلى Riyadh, Saudi Arabia', false, '{"destination":"Riyadh, Saudi Arabia","share_code":"9b19634acc1df622"}', '2026-03-11 10:16:44.600895+00'),
('548b8e97-9f3a-4c9a-ab09-ddf37e5d823d', '0c77c9e4-d274-447b-91cc-ed8009994258', 'trip_shared', 'رحلة جديدة مشاركة معك', 'أصيل اللهيبي شارك معك رحلة إلى Riyadh, Saudi Arabia', false, '{"destination":"Riyadh, Saudi Arabia","share_code":"926464bd689226a7","shared_by":"0c77c9e4-d274-447b-91cc-ed8009994258"}', '2026-03-11 10:16:59.591852+00'),
('59489296-c900-4855-a027-1e746c41b1e4', '0c77c9e4-d274-447b-91cc-ed8009994258', 'trip_share_created', 'تمت مشاركة رحلتك بنجاح', 'تمت مشاركة رحلتك إلى Riyadh, Saudi Arabia مع asellohaib@gmail.com', false, '{"destination":"Riyadh, Saudi Arabia","share_code":"926464bd689226a7"}', '2026-03-11 10:16:59.591852+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: travel_stories =====================
INSERT INTO public.travel_stories (id, user_id, title, content, latitude, longitude, media_urls, trip_data, likes_count, created_at) VALUES
('5b3b451f-8066-49a4-8f49-c6671547627d', 'd3777961-c72f-434f-b887-7107434ed9dd', 'الالالال', 'ععغعغع', 30.15077026969593, 31.33227500687085, '{"https://vdcwzcurjhkjxadehuhm.supabase.co/storage/v1/object/public/story-media/d3777961-c72f-434f-b887-7107434ed9dd/1773647334281-rlafhi1cm1p.PNG"}', '{"category":"beach","cost_estimate":100,"difficulty":"moderate","season":"spring","travel_tips":"تاتاتااتاتا"}', 0, '2026-03-16 07:48:57.497784+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: story_likes =====================
INSERT INTO public.story_likes (id, story_id, user_id, created_at) VALUES
('92cbcdb5-7507-4b6f-bb3b-b867ff79880b', '5b3b451f-8066-49a4-8f49-c6671547627d', 'd3777961-c72f-434f-b887-7107434ed9dd', '2026-03-16 08:09:11.483702+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== DATA: user_follows =====================
INSERT INTO public.user_follows (id, follower_id, following_id, created_at) VALUES
('02762a26-3958-4bc1-a8c7-be6c46e1549c', '10c39346-3de1-4d22-be53-064bb8ccb48b', 'd3777961-c72f-434f-b887-7107434ed9dd', '2026-03-16 08:00:29.882425+00')
ON CONFLICT (id) DO NOTHING;

-- ===================== END OF BACKUP =====================
-- Note: shared_trips data contains large JSON trip_data and was excluded for file size.
-- Tables with no data: comments, favorites, saved_trips, search_history, search_analytics,
-- discount_codes, story_comments, story_reports, user_subscriptions, user_vehicles,
-- vehicle_analytics, user_points
-- usage_tracking data (30+ rows) excluded for brevity - contains planner usage logs.
