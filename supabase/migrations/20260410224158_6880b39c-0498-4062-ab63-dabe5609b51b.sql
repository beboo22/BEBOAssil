ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS guest_chat_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS guest_voice_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS guest_max_chat_uses integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS guest_max_voice_uses integer NOT NULL DEFAULT 0;