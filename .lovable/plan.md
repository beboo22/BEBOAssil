
الهدف: إصلاح الأعطال الحالية في القصص/المكالمة/النشر، ثم إكمال تجربة Reels وربطها فعليًا مع "شارك مغامرتك" بدون كسر المسارات الحالية.

1) إصلاح خطأ الانهيار عند زر المكالمة (Blank screen)
- السبب المؤكد: في `VoiceCallOverlay.tsx` يتم استدعاء `getSignalInfo()` قبل تهيئة `isArabic` (Temporal Dead Zone).
- التنفيذ:
  - نقل تعريف `isArabic` أعلى أي دالة تعتمد عليه.
  - جعل `getSignalInfo` دالة نقية تستقبل `isArabic` كمعامل (أو حساب `signalInfo` بعد تعريف `isArabic`).
  - مراجعة نفس النمط في أي دوال داخلية مشابهة لتجنب تكرار نفس الخطأ.

2) إصلاح أزرار الفيد/الاستكشاف/الخريطة/الهاشتاقات التي “تغير الرابط لكن لا تغيّر المحتوى”
- الأسباب الحالية:
  - `search/tab/topic` تُقرأ مرة واحدة فقط عند mount في `StoriesPage.tsx` ولا تتم مزامنتها عند تغير `location.search`.
  - في وضع الفيد الكامل، أزرار Map/Explore تستخدم `navigate` فقط بينما `showFeedView` يبقى `true`.
  - مسار ملف المستخدم داخل الفيد يستخدم `/user/:id` بينما المسار الفعلي في التطبيق هو `/profile/:userId`.
- التنفيذ:
  - إضافة effect لمزامنة `searchTerm`, `activeTab`, `activeTopicFilter`, `showFeedView` مع `location.search` في كل تغير.
  - تعديل أزرار الفيد السفلية/العلوية لتضبط الحالة مباشرة (`setShowFeedView(false)`, `setActiveTab(...)`) ثم تحديث URL.
  - توحيد كل انتقالات الملف الشخصي إلى `/profile/${id}` في `StoryFeed.tsx` و`StoryViewer.tsx`.
  - التأكد أن النقر على:
    - hashtag → `?search=#...`
    - topic → `?topic=...`
    - city/location → `?search=...`
    يفعّل الفلترة فورًا داخل نفس الصفحة.

3) إصلاح فشل نشر القصة (Failed to publish)
- السبب المرجح والمؤكد من البيانات: جدول `travel_stories.user_id` مرتبط بـ `profiles.id` بينما جدول `profiles` فارغ حاليًا، فيفشل الإدخال لمستخدمين بلا profile.
- التنفيذ:
  - إضافة `ensureProfile()` في طبقة المصادقة (`useAuth`) عند تسجيل الدخول/استعادة الجلسة لعمل `upsert` لصف المستخدم.
  - استدعاء `ensureProfile()` احتياطيًا قبل `insert` في `CreateStoryForm`.
  - تحسين رسائل الخطأ: عرض نص الخطأ الحقيقي من قاعدة البيانات في toast أثناء التطوير بدل رسالة عامة فقط.
  - إبقاء شرط “لا نشر بدون تسجيل دخول” واضحًا في UI مع تحويل مباشر لصفحة الدخول عند الحاجة.

4) إصلاح ربط الرحلات/الفعاليات/وسائط الفعاليات داخل "From Trip"
- المشكلة الحالية: إدراج `activity_media.trip_id` يتم غالبًا بالقيمة `destination` داخل `ItinerarySchedule.tsx`، بينما الاستيراد في `CreateStoryForm` يبحث بـ `trip.tripId`؛ هذا يسبب فقدان وسائط/تفاصيل عند الاستيراد.
- التنفيذ:
  - تمرير `tripId` الحقيقي من `ItineraryPage` → `ItinerarySchedule` → `ActivityCard`.
  - تعديل كل عمليات insert/replace في `activity_media` لاستخدام `trip_id` الحقيقي بدل `destination`.
  - في `CreateStoryForm` إضافة fallback مؤقت للبيانات القديمة (مطابقة إضافية على الوجهة/اسم النشاط) حتى لا تختفي الوسائط القديمة.
  - تحسين عرض الوسائط في الاستيراد:
    - دعم فيديو وصورة بشكل صحيح في المعاينات (ليس `img` فقط).
    - عدّاد وسائط لكل فعالية + توسعة/طي التفاصيل.

5) إكمال صفحة Reels بشكل فعلي وربطها بالنشر
- الوضع الحالي: `ReelsPage` يعتمد Demo أكثر من سير عمل حقيقي.
- التنفيذ:
  - تطوير `ReelsPage.tsx` ليشمل:
    - اختيار صور من الجهاز.
    - استيراد صور من رحلة/فعاليات محفوظة.
    - ترتيب الصور + حذف/استبدال + معاينة فورية.
  - توسيع `ReelsExport.tsx` بخيارات أوضح (مدة الشريحة، نمط الانتقال، الموسيقى، جودة الإخراج) مع إبقاء التصدير مناسب للجوال.
  - إضافة زر “استخدم في القصة”:
    - بعد التصدير/الاختيار، يرسل الوسائط إلى `/stories` عبر state.
    - `CreateStoryForm` يلتقط هذه الحالة ويملأ المعاينات تلقائيًا.
  - الحفاظ على المسار المخصص `/stories/reels` وإبقائه جزءًا رئيسيًا من تدفق إنشاء القصة.

6) تدقيق المسارات وتوحيد تجربة القصص
- إزالة أي ازدواجية مربكة في routes الخاصة بالقصص وتأكيد أن الصفحة الموحدة `/stories` هي المصدر الأساسي.
- الحفاظ على الوصول السريع من الرئيسية للفيد/Reels مع انتقالات شغالة فعليًا.

7) اختبار شامل End-to-End (إلزامي قبل الإغلاق)
- سيناريو 1: فتح الشات > زر المكالمة > لا يوجد crash.
- سيناريو 2: في الفيد، النقر على hashtag/topic/city ينقل ويفلتر فورًا.
- سيناريو 3: أزرار Feed/Explore/Map داخل الفيد تغيّر التبويب فعليًا.
- سيناريو 4: من My Trips > نشر قصة يفتح "From Trip" مع نفس الرحلة المحددة.
- سيناريو 5: نشر قصة ينجح بدون “Failed to publish”.
- سيناريو 6: إضافة صور/فيديو لفعالية ثم استيراد نفس الرحلة في القصة تظهر الوسائط تحت الفعالية.
- سيناريو 7: من `/stories/reels` إنشاء Reel ثم إدراجه في "شارك مغامرتك" ثم نشر القصة بنجاح.

تفاصيل تقنية (الملفات المتأثرة)
- Crash voice:
  - `src/components/VoiceCallOverlay.tsx`
- قصص/ملاحة/فلترة:
  - `src/pages/StoriesPage.tsx`
  - `src/components/stories/StoryFeed.tsx`
  - `src/components/stories/StoryViewer.tsx`
  - `src/components/stories/HashtagSystem.tsx` (تحقق سلوك التنقل فقط)
- النشر وملف المستخدم:
  - `src/hooks/useAuth.tsx`
  - `src/components/stories/CreateStoryForm.tsx`
- ربط وسائط الفعاليات بالرحلات:
  - `src/components/ItinerarySchedule.tsx`
  - `src/pages/ItineraryPage.tsx` (تمرير `tripId`)
  - `src/components/stories/CreateStoryForm.tsx`
- Reels:
  - `src/pages/ReelsPage.tsx`
  - `src/components/stories/ReelsExport.tsx`
