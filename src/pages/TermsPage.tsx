import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const TermsPage = () => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("terms_conditions")
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
            <FileText className="text-primary" size={28} />
            <h1 className="text-2xl font-extrabold gradient-text">
              {isArabic ? "الشروط والأحكام" : "Terms & Conditions"}
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
                <ReactMarkdown>{content || (isArabic ? "لا توجد شروط وأحكام بعد." : "No terms and conditions yet.")}</ReactMarkdown>
              </div>
              <div
                dir={isArabic ? "rtl" : "ltr"}
                className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 text-sm leading-relaxed"
              >
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  ⚖️ {isArabic ? "موافقة ضمنية ومسؤولية المحتوى" : "Implied Consent & Content Responsibility"}
                </h3>
                <p className="text-foreground/90">
                  {isArabic
                    ? "تُطبَّق هذه الشروط والأحكام تلقائياً بمجرد دخولك أو استخدامك للمنصة، حتى وإن لم تقرأها أو لم تكن تُجيد لغتها. يُعدّ مجرد التصفح أو إنشاء حساب أو استخدام أي خدمة موافقةً قانونية كاملة وملزمة على جميع البنود."
                    : "These Terms & Conditions apply automatically the moment you access or use the platform, even if you have not read them or do not understand their language. Mere browsing, account creation, or use of any service constitutes full and legally binding consent to all provisions."}
                </p>
                <p className="text-foreground/90">
                  {isArabic
                    ? "أي محتوى يقوم المستخدم بنشره أو مشاركته (نصوص، صور، فيديو، تعليقات، قصص، مراجعات) يكون على مسؤوليته الشخصية الكاملة. أي نشر لمحتوى مسيء أو مخالف للقوانين أو الآداب العامة أو حقوق الملكية الفكرية أو حقوق الغير يُعدّ مسؤولية الشخص الناشر وحده، ولن تتحمّل المنصة أي مسؤولية قانونية أو مدنية أو جنائية حياله، ويحق لها حذف المحتوى وإيقاف الحساب نهائياً دون إشعار مسبق."
                    : "Any content posted or shared by the user (text, images, video, comments, stories, reviews) is published under the user's sole and full responsibility. Posting any offensive, illegal, or rights-infringing content is the publisher's sole responsibility; the platform shall bear no legal, civil, or criminal liability and reserves the right to remove content and permanently suspend accounts without prior notice."}
                </p>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default TermsPage;
