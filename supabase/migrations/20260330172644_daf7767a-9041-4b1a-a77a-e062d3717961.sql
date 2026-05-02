ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS app_store_links jsonb DEFAULT '{"apple": {"enabled": false, "url": ""}, "google": {"enabled": false, "url": ""}, "huawei": {"enabled": false, "url": ""}}'::jsonb;

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS scheduled_notifications jsonb DEFAULT '[]'::jsonb;