
-- Create privacy_policy table
CREATE TABLE public.privacy_policy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_en TEXT NOT NULL DEFAULT '',
  content_ar TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID NULL
);

-- Enable RLS
ALTER TABLE public.privacy_policy ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Privacy policy is publicly readable"
ON public.privacy_policy
FOR SELECT
USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert privacy policy"
ON public.privacy_policy
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update privacy policy"
ON public.privacy_policy
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed default content
INSERT INTO public.privacy_policy (content_en, content_ar) VALUES (
'# Privacy Policy

**Last updated: April 2026**

## 1. Introduction
Welcome to ASEEL AI TRIP. This Privacy Policy explains how we collect, use, and protect your personal information.

## 2. Information We Collect
- Account information (name, email, profile photo)
- Travel preferences and search history
- Device and usage data
- Location data (with your consent)

## 3. How We Use Your Information
- To provide and improve our AI-powered travel planning services
- To personalize your experience
- To send notifications and updates (with your consent)
- To ensure platform security

## 4. Data Sharing
We do not sell your personal data. We may share data with:
- Service providers who help us operate the platform
- Legal authorities when required by law

## 5. Data Security
We implement industry-standard security measures to protect your data.

## 6. Your Rights
You have the right to access, correct, or delete your personal data at any time.

## 7. Cookies
We use cookies to enhance your experience. You can manage cookie preferences in your browser settings.

## 8. Disclaimer
- ASEEL AI TRIP is **not responsible** for any misuse of the platform by users.
- The platform is **not liable** for AI-generated travel plans, itineraries, or recommendations that may be inaccurate, incomplete, or outdated.
- We are **not responsible** for any bookings, reservations, or transactions made through third-party services linked on our platform.
- All AI-generated content is for informational purposes only and should be verified independently before making travel decisions.
- The platform bears **no responsibility** for any financial losses, travel disruptions, or damages arising from reliance on platform-generated content.

## 9. Contact Us
For questions about this privacy policy, contact us at: support@aseelaitrip.com',

'# سياسة الخصوصية

**آخر تحديث: أبريل 2026**

## 1. مقدمة
مرحباً بكم في أصيل AI TRIP. توضح سياسة الخصوصية هذه كيفية جمعنا لمعلوماتكم الشخصية واستخدامها وحمايتها.

## 2. المعلومات التي نجمعها
- معلومات الحساب (الاسم، البريد الإلكتروني، صورة الملف الشخصي)
- تفضيلات السفر وسجل البحث
- بيانات الجهاز والاستخدام
- بيانات الموقع (بموافقتك)

## 3. كيف نستخدم معلوماتك
- لتقديم وتحسين خدمات تخطيط السفر المدعومة بالذكاء الاصطناعي
- لتخصيص تجربتك
- لإرسال الإشعارات والتحديثات (بموافقتك)
- لضمان أمان المنصة

## 4. مشاركة البيانات
نحن لا نبيع بياناتك الشخصية. قد نشارك البيانات مع:
- مزودي الخدمات الذين يساعدوننا في تشغيل المنصة
- السلطات القانونية عند الاقتضاء بموجب القانون

## 5. أمان البيانات
نطبق إجراءات أمان متوافقة مع المعايير الصناعية لحماية بياناتك.

## 6. حقوقك
لديك الحق في الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها في أي وقت.

## 7. ملفات تعريف الارتباط
نستخدم ملفات تعريف الارتباط لتحسين تجربتك. يمكنك إدارة تفضيلات ملفات تعريف الارتباط في إعدادات المتصفح.

## 8. إخلاء المسؤولية
- أصيل AI TRIP **غير مسؤول** عن أي استخدام خاطئ للمنصة من قبل المستخدمين.
- المنصة **غير مسؤولة** عن خطط السفر أو الجداول الزمنية أو التوصيات المولدة بالذكاء الاصطناعي والتي قد تكون غير دقيقة أو ناقصة أو قديمة.
- نحن **غير مسؤولين** عن أي حجوزات أو حجوزات فندقية أو معاملات تتم من خلال خدمات الطرف الثالث المرتبطة بمنصتنا.
- جميع المحتويات المولدة بالذكاء الاصطناعي هي لأغراض إعلامية فقط ويجب التحقق منها بشكل مستقل قبل اتخاذ قرارات السفر.
- لا تتحمل المنصة **أي مسؤولية** عن أي خسائر مالية أو اضطرابات في السفر أو أضرار ناتجة عن الاعتماد على المحتوى المولد من المنصة.

## 9. اتصل بنا
للأسئلة حول سياسة الخصوصية هذه، تواصل معنا على: support@aseelaitrip.com'
);

-- Also update terms_conditions with disclaimer content if empty
UPDATE public.terms_conditions SET content_en = 
'# Terms & Conditions

**Last updated: April 2026**

## 1. Acceptance of Terms
By accessing and using ASEEL AI TRIP, you agree to be bound by these Terms and Conditions.

## 2. Service Description
ASEEL AI TRIP is an AI-powered travel planning platform that provides travel itineraries, recommendations, and booking assistance.

## 3. User Responsibilities
- You are responsible for the accuracy of information you provide.
- You must not misuse the platform or use it for illegal activities.
- You must not attempt to manipulate or abuse the AI systems.

## 4. AI-Generated Content Disclaimer
- All travel plans, itineraries, and recommendations are **generated by artificial intelligence** and may not be 100% accurate.
- The platform is **not responsible** for any inaccurate, incomplete, or outdated AI-generated content.
- Users should **independently verify** all travel information before making decisions.
- AI suggestions are for **informational purposes only** and do not constitute professional travel advice.

## 5. Bookings & Third-Party Services
- ASEEL AI TRIP is **not responsible** for any bookings, reservations, or transactions made through third-party services.
- We do not guarantee the availability, pricing, or quality of third-party services displayed on the platform.
- Any disputes regarding bookings should be resolved directly with the respective service provider.

## 6. Limitation of Liability
- The platform bears **no responsibility** for any financial losses, travel disruptions, or damages arising from the use of our services.
- We are **not liable** for any misuse of the platform by users.
- ASEEL AI TRIP provides its services "as is" without warranties of any kind.

## 7. Subscription & Payment Policy
- All subscription purchases are final. **No refunds** will be issued.
- Subscription benefits are subject to change with prior notice.

## 8. Intellectual Property
All content, designs, and AI models on the platform are the intellectual property of ASEEL AI TRIP.

## 9. Privacy
Your use of the platform is also governed by our Privacy Policy.

## 10. Changes to Terms
We reserve the right to modify these terms at any time. Continued use of the platform constitutes acceptance of modified terms.

## 11. Contact
For questions about these terms, contact us at: support@aseelaitrip.com'
WHERE content_en = '' OR content_en IS NULL;

UPDATE public.terms_conditions SET content_ar = 
'# الشروط والأحكام

**آخر تحديث: أبريل 2026**

## 1. قبول الشروط
باستخدامك لمنصة أصيل AI TRIP، فإنك توافق على الالتزام بهذه الشروط والأحكام.

## 2. وصف الخدمة
أصيل AI TRIP هي منصة تخطيط سفر مدعومة بالذكاء الاصطناعي توفر جداول رحلات وتوصيات ومساعدة في الحجز.

## 3. مسؤوليات المستخدم
- أنت مسؤول عن دقة المعلومات التي تقدمها.
- يجب عدم إساءة استخدام المنصة أو استخدامها لأنشطة غير قانونية.
- يجب عدم محاولة التلاعب بأنظمة الذكاء الاصطناعي أو إساءة استخدامها.

## 4. إخلاء مسؤولية المحتوى المولد بالذكاء الاصطناعي
- جميع خطط السفر والجداول الزمنية والتوصيات **مولدة بالذكاء الاصطناعي** وقد لا تكون دقيقة بنسبة 100%.
- المنصة **غير مسؤولة** عن أي محتوى مولد بالذكاء الاصطناعي غير دقيق أو ناقص أو قديم.
- يجب على المستخدمين **التحقق بشكل مستقل** من جميع معلومات السفر قبل اتخاذ القرارات.
- اقتراحات الذكاء الاصطناعي هي **لأغراض إعلامية فقط** ولا تشكل نصيحة سفر مهنية.

## 5. الحجوزات وخدمات الطرف الثالث
- أصيل AI TRIP **غير مسؤول** عن أي حجوزات أو معاملات تتم من خلال خدمات الطرف الثالث.
- لا نضمن توفر أو تسعير أو جودة خدمات الطرف الثالث المعروضة على المنصة.
- أي نزاعات تتعلق بالحجوزات يجب حلها مباشرة مع مزود الخدمة المعني.

## 6. حدود المسؤولية
- لا تتحمل المنصة **أي مسؤولية** عن أي خسائر مالية أو اضطرابات في السفر أو أضرار ناتجة عن استخدام خدماتنا.
- نحن **غير مسؤولين** عن أي إساءة استخدام للمنصة من قبل المستخدمين.
- تقدم أصيل AI TRIP خدماتها "كما هي" بدون ضمانات من أي نوع.

## 7. سياسة الاشتراك والدفع
- جميع مشتريات الاشتراك نهائية. **لا يتم استرداد المبالغ المدفوعة**.
- مزايا الاشتراك قابلة للتغيير مع إشعار مسبق.

## 8. الملكية الفكرية
جميع المحتويات والتصاميم ونماذج الذكاء الاصطناعي في المنصة هي ملكية فكرية لأصيل AI TRIP.

## 9. الخصوصية
يخضع استخدامك للمنصة أيضاً لسياسة الخصوصية الخاصة بنا.

## 10. تعديل الشروط
نحتفظ بالحق في تعديل هذه الشروط في أي وقت. يعتبر الاستمرار في استخدام المنصة قبولاً للشروط المعدلة.

## 11. التواصل
للأسئلة حول هذه الشروط، تواصل معنا على: support@aseelaitrip.com'
WHERE content_ar = '' OR content_ar IS NULL;
