ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[
  {"id":"snapchat","name":"Snapchat","platform":"snapchat","url":"https://www.snapchat.com/add/aseelaitrip?share_id=sdQ4HDjys5o&locale=ar-AE","enabled":true,"sortOrder":1},
  {"id":"x","name":"X","platform":"x","url":"https://x.com/Aseelaitrip","enabled":true,"sortOrder":2},
  {"id":"tiktok","name":"TikTok","platform":"tiktok","url":"https://www.tiktok.com/@aseelaitrip?_r=1&_t=ZN-95zpQrYrY2w","enabled":true,"sortOrder":3},
  {"id":"instagram","name":"Instagram","platform":"instagram","url":"https://www.instagram.com/aseelaitrip?igsh=MXh3bGNreHdkOWhqNQ==","enabled":true,"sortOrder":4},
  {"id":"facebook","name":"Facebook","platform":"facebook","url":"https://www.facebook.com/share/1GhHPg3gmL/","enabled":true,"sortOrder":5}
]'::jsonb;

UPDATE public.site_settings
SET social_links = '[
  {"id":"snapchat","name":"Snapchat","platform":"snapchat","url":"https://www.snapchat.com/add/aseelaitrip?share_id=sdQ4HDjys5o&locale=ar-AE","enabled":true,"sortOrder":1},
  {"id":"x","name":"X","platform":"x","url":"https://x.com/Aseelaitrip","enabled":true,"sortOrder":2},
  {"id":"tiktok","name":"TikTok","platform":"tiktok","url":"https://www.tiktok.com/@aseelaitrip?_r=1&_t=ZN-95zpQrYrY2w","enabled":true,"sortOrder":3},
  {"id":"instagram","name":"Instagram","platform":"instagram","url":"https://www.instagram.com/aseelaitrip?igsh=MXh3bGNreHdkOWhqNQ==","enabled":true,"sortOrder":4},
  {"id":"facebook","name":"Facebook","platform":"facebook","url":"https://www.facebook.com/share/1GhHPg3gmL/","enabled":true,"sortOrder":5}
]'::jsonb
WHERE id = 'default'
  AND (social_links IS NULL OR social_links = '[]'::jsonb);