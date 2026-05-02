type SupportedLocale = 'en' | 'ar' | 'ur' | 'de' | 'fr' | 'es' | 'zh' | 'ru';

type LocalizedCopy = {
  viewPlans: string;
  chatLocked: string;
  voiceLocked: string;
  callLocked: string;
  featureLockedTitle: string;
  featureLockedDescription: string;
  chatLimitReached: string;
  exportSignInRequired: string;
  exportFailed: string;
  exportReady: string;
  shareVideo: string;
  shareSuccess: string;
  shareNotSupported: string;
  shareFailed: string;
  gettingLocation: string;
  geolocationUnsupported: string;
  locationAutoDetected: string;
  locationApproximate: string;
  locationFailed: string;
};

const COPY: Record<SupportedLocale, LocalizedCopy> = {
  en: {
    viewPlans: 'View Plans',
    chatLocked: 'Chatbot is not enabled until you subscribe.',
    voiceLocked: 'Voice recording is not enabled until you subscribe.',
    callLocked: 'Voice calls are not enabled until you subscribe.',
    featureLockedTitle: 'Available after subscription',
    featureLockedDescription: 'This feature is not enabled until you subscribe.',
    chatLimitReached: 'You have reached the chat limit for your current plan.',
    exportSignInRequired: 'Please sign in first to export MP4 videos.',
    exportFailed: 'Failed to export MP4 video. Please try again.',
    exportReady: 'Your MP4 video is ready.',
    shareVideo: 'Share Video',
    shareSuccess: 'The video is ready to share.',
    shareNotSupported: 'Sharing is not supported on this device. The MP4 file has been downloaded instead.',
    shareFailed: 'Unable to share the video right now.',
    gettingLocation: 'Detecting location...',
    geolocationUnsupported: 'Automatic location is not supported on this device.',
    locationAutoDetected: 'Location added automatically ✅',
    locationApproximate: 'Approximate location added automatically ✅',
    locationFailed: 'Could not add the location automatically.',
  },
  ar: {
    viewPlans: 'عرض الباقات',
    chatLocked: 'الشات بوت غير مفعل إلا بعد الاشتراك.',
    voiceLocked: 'التسجيل الصوتي غير مفعل إلا بعد الاشتراك.',
    callLocked: 'المكالمات الصوتية غير مفعلة إلا بعد الاشتراك.',
    featureLockedTitle: 'متاح بعد الاشتراك',
    featureLockedDescription: 'هذه الميزة غير مفعلة إلا بعد الاشتراك.',
    chatLimitReached: 'لقد وصلت إلى حد المحادثات في باقتك الحالية.',
    exportSignInRequired: 'يرجى تسجيل الدخول أولاً لتصدير فيديو MP4.',
    exportFailed: 'فشل تصدير فيديو MP4. حاول مرة أخرى.',
    exportReady: 'تم تجهيز فيديو MP4 بنجاح.',
    shareVideo: 'مشاركة الفيديو',
    shareSuccess: 'الفيديو جاهز للمشاركة.',
    shareNotSupported: 'المشاركة غير مدعومة على هذا الجهاز، لذلك تم تنزيل ملف MP4 بدلاً من ذلك.',
    shareFailed: 'تعذر مشاركة الفيديو حالياً.',
    gettingLocation: 'جارٍ تحديد الموقع...',
    geolocationUnsupported: 'الإضافة التلقائية للموقع غير مدعومة على هذا الجهاز.',
    locationAutoDetected: 'تمت إضافة الموقع تلقائياً ✅',
    locationApproximate: 'تمت إضافة موقع تقريبي تلقائياً ✅',
    locationFailed: 'تعذر إضافة الموقع تلقائياً.',
  },
  ur: {
    viewPlans: 'پلانز دیکھیں',
    chatLocked: 'چیٹ بوٹ صرف سبسکرپشن کے بعد فعال ہوگا۔',
    voiceLocked: 'وائس ریکارڈنگ صرف سبسکرپشن کے بعد فعال ہوگی۔',
    callLocked: 'وائس کالز صرف سبسکرپشن کے بعد فعال ہوں گی۔',
    featureLockedTitle: 'سبسکرپشن کے بعد دستیاب',
    featureLockedDescription: 'یہ فیچر صرف سبسکرپشن کے بعد فعال ہوگا۔',
    chatLimitReached: 'آپ اپنے موجودہ پلان کی چیٹ حد تک پہنچ چکے ہیں۔',
    exportSignInRequired: 'MP4 ویڈیو ایکسپورٹ کرنے کے لیے پہلے لاگ اِن کریں۔',
    exportFailed: 'MP4 ویڈیو ایکسپورٹ نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
    exportReady: 'آپ کی MP4 ویڈیو تیار ہے۔',
    shareVideo: 'ویڈیو شیئر کریں',
    shareSuccess: 'ویڈیو شیئر کرنے کے لیے تیار ہے۔',
    shareNotSupported: 'اس ڈیوائس پر شیئرنگ سپورٹ نہیں ہے، اس لیے MP4 فائل ڈاؤن لوڈ کر دی گئی ہے۔',
    shareFailed: 'ویڈیو اس وقت شیئر نہیں ہو سکی۔',
    gettingLocation: 'مقام معلوم کیا جا رہا ہے...',
    geolocationUnsupported: 'اس ڈیوائس پر خودکار مقام دستیاب نہیں۔',
    locationAutoDetected: 'مقام خودکار طور پر شامل کر دیا گیا ✅',
    locationApproximate: 'تقریبی مقام خودکار طور پر شامل کر دیا گیا ✅',
    locationFailed: 'مقام خودکار طور پر شامل نہیں ہو سکا۔',
  },
  de: {
    viewPlans: 'Pläne ansehen',
    chatLocked: 'Der Chatbot ist erst nach einem Abonnement aktiviert.',
    voiceLocked: 'Die Sprachaufnahme ist erst nach einem Abonnement aktiviert.',
    callLocked: 'Sprachanrufe sind erst nach einem Abonnement aktiviert.',
    featureLockedTitle: 'Nach dem Abonnement verfügbar',
    featureLockedDescription: 'Diese Funktion ist erst nach einem Abonnement aktiviert.',
    chatLimitReached: 'Sie haben das Chat-Limit Ihres aktuellen Plans erreicht.',
    exportSignInRequired: 'Bitte melden Sie sich zuerst an, um MP4-Videos zu exportieren.',
    exportFailed: 'MP4-Video konnte nicht exportiert werden. Bitte erneut versuchen.',
    exportReady: 'Ihr MP4-Video ist fertig.',
    shareVideo: 'Video teilen',
    shareSuccess: 'Das Video ist bereit zum Teilen.',
    shareNotSupported: 'Teilen wird auf diesem Gerät nicht unterstützt. Die MP4-Datei wurde stattdessen heruntergeladen.',
    shareFailed: 'Das Video kann derzeit nicht geteilt werden.',
    gettingLocation: 'Standort wird ermittelt...',
    geolocationUnsupported: 'Automatische Standorterkennung wird auf diesem Gerät nicht unterstützt.',
    locationAutoDetected: 'Standort automatisch hinzugefügt ✅',
    locationApproximate: 'Ungefährer Standort automatisch hinzugefügt ✅',
    locationFailed: 'Der Standort konnte nicht automatisch hinzugefügt werden.',
  },
  fr: {
    viewPlans: 'Voir les offres',
    chatLocked: 'Le chatbot n\'est activé qu\'après abonnement.',
    voiceLocked: 'L\'enregistrement vocal n\'est activé qu\'après abonnement.',
    callLocked: 'Les appels vocaux ne sont activés qu\'après abonnement.',
    featureLockedTitle: 'Disponible après abonnement',
    featureLockedDescription: 'Cette fonctionnalité n\'est activée qu\'après abonnement.',
    chatLimitReached: 'Vous avez atteint la limite de chat de votre offre actuelle.',
    exportSignInRequired: 'Veuillez vous connecter d\'abord pour exporter des vidéos MP4.',
    exportFailed: 'Échec de l\'export MP4. Veuillez réessayer.',
    exportReady: 'Votre vidéo MP4 est prête.',
    shareVideo: 'Partager la vidéo',
    shareSuccess: 'La vidéo est prête à être partagée.',
    shareNotSupported: 'Le partage n\'est pas pris en charge sur cet appareil. Le fichier MP4 a été téléchargé à la place.',
    shareFailed: 'Impossible de partager la vidéo pour le moment.',
    gettingLocation: 'Détection de la localisation...',
    geolocationUnsupported: 'La localisation automatique n\'est pas prise en charge sur cet appareil.',
    locationAutoDetected: 'Localisation ajoutée automatiquement ✅',
    locationApproximate: 'Localisation approximative ajoutée automatiquement ✅',
    locationFailed: 'Impossible d\'ajouter la localisation automatiquement.',
  },
  es: {
    viewPlans: 'Ver planes',
    chatLocked: 'El chatbot no se activa hasta después de suscribirte.',
    voiceLocked: 'La grabación de voz no se activa hasta después de suscribirte.',
    callLocked: 'Las llamadas de voz no se activan hasta después de suscribirte.',
    featureLockedTitle: 'Disponible después de suscribirte',
    featureLockedDescription: 'Esta función no se activa hasta después de suscribirte.',
    chatLimitReached: 'Has alcanzado el límite de chat de tu plan actual.',
    exportSignInRequired: 'Inicia sesión primero para exportar videos MP4.',
    exportFailed: 'No se pudo exportar el video MP4. Inténtalo de nuevo.',
    exportReady: 'Tu video MP4 está listo.',
    shareVideo: 'Compartir video',
    shareSuccess: 'El video está listo para compartirse.',
    shareNotSupported: 'Compartir no está disponible en este dispositivo. En su lugar se descargó el archivo MP4.',
    shareFailed: 'No se puede compartir el video ahora mismo.',
    gettingLocation: 'Detectando ubicación...',
    geolocationUnsupported: 'La ubicación automática no es compatible con este dispositivo.',
    locationAutoDetected: 'Ubicación agregada automáticamente ✅',
    locationApproximate: 'Ubicación aproximada agregada automáticamente ✅',
    locationFailed: 'No se pudo agregar la ubicación automáticamente.',
  },
  zh: {
    viewPlans: '查看套餐',
    chatLocked: '聊天机器人仅在订阅后启用。',
    voiceLocked: '语音录制仅在订阅后启用。',
    callLocked: '语音通话仅在订阅后启用。',
    featureLockedTitle: '订阅后可用',
    featureLockedDescription: '此功能仅在订阅后启用。',
    chatLimitReached: '您已达到当前套餐的聊天上限。',
    exportSignInRequired: '请先登录后再导出 MP4 视频。',
    exportFailed: 'MP4 视频导出失败，请重试。',
    exportReady: '您的 MP4 视频已准备好。',
    shareVideo: '分享视频',
    shareSuccess: '视频已可分享。',
    shareNotSupported: '此设备不支持分享，因此已改为下载 MP4 文件。',
    shareFailed: '暂时无法分享该视频。',
    gettingLocation: '正在检测位置...',
    geolocationUnsupported: '此设备不支持自动定位。',
    locationAutoDetected: '已自动添加位置 ✅',
    locationApproximate: '已自动添加近似位置 ✅',
    locationFailed: '无法自动添加位置。',
  },
  ru: {
    viewPlans: 'Посмотреть тарифы',
    chatLocked: 'Чат-бот активируется только после подписки.',
    voiceLocked: 'Запись голоса активируется только после подписки.',
    callLocked: 'Голосовые звонки активируются только после подписки.',
    featureLockedTitle: 'Доступно после подписки',
    featureLockedDescription: 'Эта функция активируется только после подписки.',
    chatLimitReached: 'Вы достигли лимита чата в текущем тарифе.',
    exportSignInRequired: 'Сначала войдите, чтобы экспортировать MP4-видео.',
    exportFailed: 'Не удалось экспортировать MP4-видео. Попробуйте снова.',
    exportReady: 'Ваше MP4-видео готово.',
    shareVideo: 'Поделиться видео',
    shareSuccess: 'Видео готово к отправке.',
    shareNotSupported: 'Поделиться с этого устройства нельзя, поэтому MP4-файл был скачан.',
    shareFailed: 'Сейчас не удаётся поделиться видео.',
    gettingLocation: 'Определяем местоположение...',
    geolocationUnsupported: 'Автоопределение местоположения не поддерживается на этом устройстве.',
    locationAutoDetected: 'Местоположение добавлено автоматически ✅',
    locationApproximate: 'Примерное местоположение добавлено автоматически ✅',
    locationFailed: 'Не удалось автоматически добавить местоположение.',
  },
};

export const resolveSupportedLocale = (language?: string): SupportedLocale => {
  const normalized = language?.toLowerCase().split('-')[0] as SupportedLocale | undefined;
  return normalized && normalized in COPY ? normalized : 'en';
};

export const getLocalizedCopy = (language?: string): LocalizedCopy => COPY[resolveSupportedLocale(language)];
