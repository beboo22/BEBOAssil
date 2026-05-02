export function getFriendlyGenerationError(rawError: unknown, isArabic: boolean) {
  const fallback = isArabic
    ? 'تعذر إكمال التوليد الآن. عدّل الطلب أو أعد المحاولة بعد قليل.'
    : 'We could not complete the generation right now. Please refine the request or try again shortly.';

  const rawMessage = typeof rawError === 'string'
    ? rawError
    : rawError instanceof Error
      ? rawError.message
      : '';

  const message = rawMessage.trim();
  const normalized = message.toLowerCase();

  if (!message) return fallback;

  if (normalized.includes('activity quota exhausted') || normalized.includes('exhausted all activities')) {
    return isArabic
      ? 'لقد استنفدت الأنشطة المتاحة في باقتك. يمكنك الترقية أو المحاولة لاحقًا.'
      : 'You have used all activities available in your plan. Please upgrade or try again later.';
  }

  if (normalized.includes('daily credits exhausted') || normalized.includes('daily limit')) {
    return isArabic
      ? 'لقد وصلت إلى الحد اليومي للتوليد. حاول مرة أخرى لاحقًا.'
      : 'You have reached your daily generation limit. Please try again later.';
  }

  if (
    normalized.includes('edge function returned a non-2xx status code') ||
    normalized.includes('failed to send a request to the edge function') ||
    normalized.includes('functionshttperror') ||
    normalized.includes('fetch failed') ||
    normalized.includes('networkerror') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('gateway') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborterror')
  ) {
    return isArabic
      ? 'الخدمة كانت مشغولة ولم تكتمل عملية التوليد. حاول مرة أخرى بعد قليل أو اجعل الطلب أكثر تحديدًا.'
      : 'The generation service was busy and could not finish your request. Please try again shortly or make the request more specific.';
  }

  if (normalized.includes('no ai api keys configured')) {
    return isArabic
      ? 'خدمة التوليد غير جاهزة حاليًا. حاول مرة أخرى بعد قليل.'
      : 'The generation service is not ready right now. Please try again shortly.';
  }

  if (normalized.includes('no data returned') || normalized.includes('returned no days')) {
    return isArabic
      ? 'لم نتمكن من بناء خطة مناسبة من هذا الطلب. جرّب تفاصيل أوضح.'
      : 'We could not build a suitable plan from this request. Please try with clearer details.';
  }

  if (normalized.includes('could not find a same-type replacement')) {
    return isArabic
      ? 'لم نجد بديلاً مناسبًا بنفس المواصفات. جرّب وصفًا أدق.'
      : 'We could not find a suitable replacement with the same requirements. Try a more specific description.';
  }

  if (normalized.includes('auto-generation failed') || normalized.includes('regeneration failed') || normalized.includes('failed to generate trip')) {
    return fallback;
  }

  return message.length > 180 ? fallback : message;
}