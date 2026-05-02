export function getCurrentDateContext(lang: string = 'en'): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    const today = now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', options);

    // Calculate next month
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthName = nextMonthDate.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'long' });

    // Calculate next week (Monday)
    const nextWeekDate = new Date(now);
    nextWeekDate.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
    const nextWeekDay = nextWeekDate.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'long' });

    if (lang === 'ar') {
        return `سياق التاريخ الحالي:
- تاريخ اليوم هو: ${today}
- الشهر القادم هو: ${nextMonthName}
- الأسبوع القادم يبدأ من: ${nextWeekDay}
- عطلة نهاية الأسبوع الحالية تبدأ يوم الجمعة القادم.
يرجى استخدام هذه المعلومات عند الرد على استفسارات المستخدم المتعلقة بالمواعيد مثل "الشهر القادم" أو "الأسبوع القادم".`;
    }

    return `Current date context:
- Today is: ${today}
- Next month is: ${nextMonthName}
- Next week starts on: ${nextWeekDay}
- This weekend starts on the upcoming Friday/Saturday.
Please use this information when resolving user queries like "next month", "next week", or "this weekend".`;
}
