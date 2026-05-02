ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS max_chat_uses integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_voice_uses integer NOT NULL DEFAULT 0;