ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_news_uses integer NOT NULL DEFAULT 0;