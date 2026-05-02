
ALTER TABLE public.global_events ADD COLUMN IF NOT EXISTS ai_prompt text;
ALTER TABLE public.promotions   ADD COLUMN IF NOT EXISTS ai_prompt text;
