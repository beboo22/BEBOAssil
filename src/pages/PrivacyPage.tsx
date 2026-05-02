import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const PrivacyPage = () => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("privacy_policy")
      .select("content_en, content_ar")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setContent(isArabic ? data.content_ar : data.content_en);
        }
        setLoading(false);
      });
  }, [isArabic]);

  return (
    <div className="min-h-screen bg-background pt-20 pb-10 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <ShieldCheck className="text-primary" size={28} />
            <h1 className="text-2xl font-extrabold gradient-text">
              {isArabic ? "سياسة الخصوصية" : "Privacy Policy"}
            </h1>
          </div>
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-4 bg-muted rounded w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="prose prose-sm dark:prose-invert max-w-none" dir={isArabic ? "rtl" : "ltr"}>
                <ReactMarkdown>{content || (isArabic ? "لا توجد سياسة خصوصية بعد." : "No privacy policy yet.")}</ReactMarkdown>
              </div>
              <div
                dir={isArabic ? "rtl" : "ltr"}
                className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 text-sm leading-relaxed"
              >
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  ⚖️ {isArabic ? "إخلاء مسؤولية وموافقة ضمنية" : "Disclaimer & Implied Consent"}
                </h3>
                <p className="text-foreground/90">
                  {isArabic
                    ? "بمجرد دخولك أو استخدامك لهذه المنصة فإنك تُقرّ بقبولك الكامل لسياسة الخصوصية وشروط الاستخدام، حتى وإن لم تقرأها أو لم تكن تُجيد لغتها — يُعدّ الاستخدام موافقةً قانونية ملزمة."
                    : "By accessing or using this platform you acknowledge full acceptance of this Privacy Policy and the Terms & Conditions, even if you have not read them or do not understand their language — usage constitutes a legally binding agreement."}
                </p>
                <p className="text-foreground/90">
                  {isArabic
                    ? "أي محتوى يقوم المستخدم بنشره أو مشاركته (نصوص، صور، فيديو، تعليقات، قصص) يكون على مسؤوليته الشخصية الكاملة. وفي حال نشر أي محتوى مسيء أو مخالف للقوانين أو الآداب العامة أو حقوق الغير، فإن المسؤولية القانونية تقع بالكامل على ناشره، ولا تتحمّل المنصة أي مسؤولية مدنية أو جنائية حيال ذلك، ويحق لها حذف المحتوى وإيقاف الحساب فوراً دون إشعار."
                    : "Any content posted or shared by the user (text, images, video, comments, stories) is published under the user's sole and full responsibility. Should any offensive, illegal, or rights-infringing content be published, full legal liability rests entirely with the publisher, and the platform bears no civil or criminal responsibility, reserving the right to remove content and suspend accounts immediately without notice."}
                </p>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPage;
