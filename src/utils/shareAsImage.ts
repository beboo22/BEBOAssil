import { toast } from "sonner";

export interface ShareAsImageOptions {
  /** DOM element to capture */
  node: HTMLElement;
  /** Filename (without extension) */
  fileName: string;
  /** Plain-text caption used for the native share sheet */
  shareText?: string;
  /** Show logo + aseelaitrip.com watermark at the bottom */
  watermark?: boolean;
  /** Toast text in Arabic */
  isArabic?: boolean;
  /** Use html-to-image (preserves Arabic shaping) instead of html2canvas */
  preserveArabic?: boolean;
  /** Lower rendering cost for faster mobile sharing */
  preferFast?: boolean;
}

export type SocialSharePlatform = "whatsapp" | "twitter" | "facebook" | "telegram" | "copy";

/**
 * Render a DOM node into a JPEG blob using the same Arabic-safe pipeline as
 * `shareNodeAsImage`. Used by the social share sheet so we can attach the image
 * to native Web Share AND fall back to a download + social link in one tap.
 */
export async function renderNodeToImageBlob({
  node,
  watermark = false,
  isArabic = false,
  preserveArabic = false,
  preferFast = true,
}: Omit<ShareAsImageOptions, "fileName" | "shareText"> & { watermark?: boolean }): Promise<Blob | null> {
  try {
    let canvas: HTMLCanvasElement | null = null;
    const renderScale = preserveArabic || isArabic
      ? preferFast ? 1 : 1.4
      : preferFast ? 1.15 : 1.6;
    const jpegQuality = preserveArabic || isArabic
      ? preferFast ? 0.78 : 0.86
      : preferFast ? 0.82 : 0.9;
    const maxOutputDimension = preferFast ? 1500 : 2200;

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))]);

    if (preserveArabic || isArabic) {
      try {
        const { getFontEmbedCSS, toCanvas } = await import("html-to-image");
        const fontEmbedCSS = await withTimeout(
          getFontEmbedCSS(node).catch(() => ""), 6000, "font-embed-css",
        ).catch(() => "");
        canvas = await withTimeout(
          toCanvas(node, {
            pixelRatio: renderScale,
            backgroundColor: "#ffffff",
            cacheBust: false,
            skipFonts: false,
            preferredFontFormat: "woff2",
            fontEmbedCSS,
          }),
          12000,
          "html-to-image",
        );
      } catch {
        const html2canvas = (await import("html2canvas")).default;
        canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: renderScale, useCORS: true, logging: false, allowTaint: true });
      }
    } else {
      const html2canvas = (await import("html2canvas")).default;
      canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: renderScale, useCORS: true, logging: false });
    }
    if (!canvas) return null;
    const finalCanvas = constrainCanvasSize(watermark ? await appendWatermark(canvas) : canvas, maxOutputDimension);
    return await canvasToBlob(finalCanvas, "image/jpeg", jpegQuality);
  } catch (err) {
    console.error("renderNodeToImageBlob failed", err);
    return null;
  }
}

/**
 * Share an image+text combo to a specific social platform.
 *
 * Strategy:
 * 1. Try the native Web Share API with the file attached (modern mobile
 *    browsers route this to the chosen app along with the image).
 * 2. If unsupported / cancelled / fails, download the image so the user has
 *    it ready, then open the platform's web composer pre-filled with text+url
 *    so they can attach the just-downloaded image.
 */
export async function shareImageToSocial({
  platform,
  blob,
  fileName,
  text,
  url,
  isArabic = false,
}: {
  platform: SocialSharePlatform;
  blob: Blob | null;
  fileName: string;
  text: string;
  url?: string;
  isArabic?: boolean;
}): Promise<void> {
  const safeName = fileName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  if (platform === "copy") {
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      toast.success(isArabic ? "تم نسخ النص والرابط" : "Text and link copied");
    } catch {
      toast.error(isArabic ? "تعذر النسخ" : "Copy failed");
    }
    if (blob) downloadBlob(blob, `${safeName}.jpg`);
    return;
  }

  // 1) Try native share with the actual image attached
  if (blob) {
    const file = new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });
    const navAny = navigator as any;
    if (navAny?.canShare && navAny.canShare({ files: [file] })) {
      try {
        await navAny.share({ files: [file], text: `${text}\n${shareUrl}`, title: text });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
  }

  // 2) Fallback: download image so the user can attach it, then open social composer
  if (blob) {
    downloadBlob(blob, `${safeName}.jpg`);
    toast.success(
      isArabic
        ? "تم تنزيل الصورة. أرفقها في المنشور بعد فتح التطبيق"
        : "Image downloaded — attach it after the app opens",
    );
  }

  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(shareUrl);
  const links: Record<Exclude<SocialSharePlatform, "copy">, string> = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  };
  window.open(links[platform], "_blank", "noopener,noreferrer");
}

/**
 * Render any DOM node as a PNG, append the Aseel watermark, then share via the
 * Web Share API (mobile) or download (desktop).
 *
 * For Arabic / RTL content we use `html-to-image` which renders via native
 * foreignObject + SVG — this preserves proper Arabic glyph shaping (joined
 * letters) instead of the broken / disconnected output that html2canvas
 * produces for complex scripts.
 */
export async function shareNodeAsImage({
  node,
  fileName,
  shareText,
  watermark = true,
  isArabic = false,
  preserveArabic = false,
  preferFast = false,
}: ShareAsImageOptions): Promise<void> {
  try {
    let canvas: HTMLCanvasElement | null = null;
    const renderScale = preserveArabic || isArabic
      ? preferFast ? 1 : 1.4
      : preferFast ? 1.15 : 1.6;
    const jpegQuality = preserveArabic || isArabic
      ? preferFast ? 0.78 : 0.86
      : preferFast ? 0.82 : 0.9;
    const maxOutputDimension = preferFast ? 1500 : 2200;

    // Helper: race a promise against a timeout
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
      ]);

    if (preserveArabic || isArabic) {
      // html-to-image preserves Arabic glyph shaping (SVG foreignObject)
      try {
        const { getFontEmbedCSS, toCanvas } = await import("html-to-image");
        const fontEmbedCSS = await withTimeout(
          getFontEmbedCSS(node).catch(() => ""),
          6000,
          "font-embed-css",
        ).catch(() => "");
        canvas = await withTimeout(
          toCanvas(node, {
            pixelRatio: renderScale,
            backgroundColor: "#ffffff",
            cacheBust: false,
            skipFonts: false,
            preferredFontFormat: "woff2",
            fontEmbedCSS,
          }),
          12000,
          "html-to-image",
        );
      } catch (htiErr) {
        console.warn("html-to-image failed, falling back to html2canvas", htiErr);
        const html2canvas = (await import("html2canvas")).default;
        canvas = await html2canvas(node, {
          backgroundColor: "#ffffff",
          scale: renderScale,
          useCORS: true,
          logging: false,
          allowTaint: true,
        });
      }
    } else {
      const html2canvas = (await import("html2canvas")).default;
      canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: renderScale,
        useCORS: true,
        logging: false,
      });
    }

    if (!canvas) throw new Error("Canvas render failed");

    const finalCanvas = constrainCanvasSize(
      watermark ? await appendWatermark(canvas) : canvas,
      maxOutputDimension,
    );

    const blob = await canvasToBlob(finalCanvas, "image/jpeg", jpegQuality);
    if (!blob) throw new Error("Failed to create image blob");

    const safeName = fileName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
    const file = new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });

    const navAny = navigator as any;
    if (navAny?.canShare && navAny.canShare({ files: [file] })) {
      try {
        await navAny.share({
          files: [file],
          text: shareText,
          title: shareText,
        });
        toast.success(isArabic ? "تم فتح خيارات المشاركة" : "Share opened");
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") return;
        console.warn("Native file share failed, falling back to download", shareErr);
      }
    }

    downloadBlob(blob, `${safeName}.jpg`);
    toast.success(
      isArabic ? "تم تنزيل الصورة لمشاركتها بسرعة" : "Image downloaded for quick sharing",
    );
  } catch (err: any) {
    console.error("shareNodeAsImage failed", err);
    if (err?.name === "AbortError") return;
    toast.error(isArabic ? "تعذرت مشاركة الصورة" : "Failed to share image");
  }
}

/** Cache the loaded logo so we don't re-decode on every export. */
let cachedLogo: HTMLImageElement | null = null;
async function loadLogo(): Promise<HTMLImageElement | null> {
  if (cachedLogo) return cachedLogo;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cachedLogo = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = "/logo.png";
  });
}

/** Adds a slim brand strip with the actual logo.png + aseelaitrip.com to the bottom. */
async function appendWatermark(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const stripHeight = Math.max(80, Math.round(source.height * 0.06));
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height + stripHeight;

  const ctx = out.getContext("2d");
  if (!ctx) return source;

  // Original artwork
  ctx.drawImage(source, 0, 0);

  // Brand strip background (teal gradient → matches brand)
  const grad = ctx.createLinearGradient(0, source.height, out.width, out.height);
  grad.addColorStop(0, "#0d9488");
  grad.addColorStop(1, "#0f766e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, source.height, out.width, stripHeight);

  const padding = Math.round(stripHeight * 0.25);
  const stripCenterY = source.height + stripHeight / 2;

  // Try to draw the actual logo on the left
  const logo = await loadLogo();
  let textStartX = padding;
  if (logo) {
    const logoSize = Math.round(stripHeight * 0.7);
    const ratio = logo.width && logo.height ? logo.width / logo.height : 1;
    const drawW = Math.round(logoSize * ratio);
    const drawH = logoSize;
    const logoY = source.height + (stripHeight - drawH) / 2;

    // White rounded background behind logo for contrast
    const bgPad = Math.round(logoSize * 0.12);
    const bgX = padding - bgPad;
    const bgY = logoY - bgPad;
    const bgW = drawW + bgPad * 2;
    const bgH = drawH + bgPad * 2;
    const r = Math.round(bgH * 0.18);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, bgX, bgY, bgW, bgH, r);
    ctx.fill();

    ctx.drawImage(logo, padding, logoY, drawW, drawH);
    textStartX = padding + drawW + bgPad * 2 + Math.round(padding * 0.6);
  }

  // Brand name
  const titlePx = Math.round(stripHeight * 0.32);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 ${titlePx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("ASEEL AI TRIP", textStartX, stripCenterY - titlePx * 0.35);

  ctx.font = `500 ${Math.round(titlePx * 0.7)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("aseelaitrip.com", textStartX, stripCenterY + titlePx * 0.55);

  // Tagline on the right
  ctx.textAlign = "right";
  ctx.font = `500 ${Math.round(titlePx * 0.65)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("AI-Powered Travel Planner", out.width - padding, stripCenterY);

  return out;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function constrainCanvasSize(source: HTMLCanvasElement, maxDimension: number): HTMLCanvasElement {
  const longestSide = Math.max(source.width, source.height);
  if (!longestSide || longestSide <= maxDimension) return source;

  const scale = maxDimension / longestSide;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));

  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), type, quality);
  });
  if (blob) return blob;

  try {
    const dataUrl = canvas.toDataURL(type, quality);
    const response = await fetch(dataUrl);
    return await response.blob();
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function shareToSocialPlatform(
  platform: SocialSharePlatform,
  {
    text,
    url,
    isArabic = false,
  }: {
    text: string;
    url?: string;
    isArabic?: boolean;
  },
) {
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(shareUrl);

  if (platform === "copy") {
    navigator.clipboard.writeText(shareUrl);
    toast.success(isArabic ? "تم نسخ رابط المشاركة" : "Share link copied");
    return;
  }

  const links: Record<Exclude<SocialSharePlatform, "copy">, string> = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  };

  window.open(links[platform], "_blank", "noopener,noreferrer");
}

async function waitForShareRender() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise((resolve) => setTimeout(resolve, 90));
}

/**
 * Build a long, off-screen image of the entire trip (all days as a vertical
 * stack of branded summary cards) and share/download it. Returns when the
 * share sheet closes or the file finishes downloading.
 */
export async function shareFullPlanAsImage({
  itinerary,
  isArabic = false,
}: {
  itinerary: any;
  isArabic?: boolean;
}): Promise<void> {
  const days: any[] = itinerary?.days || [];
  if (!days.length) {
    toast.error(isArabic ? "لا توجد خطة لمشاركتها" : "No plan to share");
    return;
  }

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: -10000px;
    width: 800px;
    background: #ffffff;
    color: #0f172a;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 32px;
    box-sizing: border-box;
    direction: ${isArabic ? "rtl" : "ltr"};
  `;

  const dest = itinerary.destination || "";
  const start = itinerary.startDate ? new Date(itinerary.startDate) : null;
  const end = itinerary.endDate ? new Date(itinerary.endDate) : null;
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString(isArabic ? "ar" : "en-GB") : "");

  container.innerHTML = `
    <div style="text-align:center;border-bottom:3px solid #0d9488;padding-bottom:18px;margin-bottom:24px;">
      <div style="font-size:32px;font-weight:800;color:#0f766e;letter-spacing:-0.5px;">
        ${isArabic ? "خطة رحلتي إلى" : "My Trip to"} ${escapeHtml(dest)}
      </div>
      <div style="font-size:16px;color:#475569;margin-top:8px;">
        ${fmt(start)} ${start && end ? "→" : ""} ${fmt(end)} · ${days.length} ${isArabic ? "يوم" : "days"}
      </div>
    </div>
    ${days
      .map((day: any, i: number) => {
        const dayDate = day.date ? new Date(day.date) : null;
        const acts = (day.activities || []) as any[];
        return `
          <div style="background:linear-gradient(135deg,#f0fdfa 0%,#ffffff 100%);border:1px solid #ccfbf1;border-radius:18px;padding:20px;margin-bottom:18px;page-break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px dashed #5eead4;padding-bottom:10px;">
              <div style="font-size:22px;font-weight:700;color:#0f766e;">
                ${isArabic ? "اليوم" : "Day"} ${i + 1}${day.city ? ` · ${escapeHtml(day.city)}` : ""}
              </div>
              <div style="font-size:14px;color:#64748b;font-weight:500;">${fmt(dayDate)}</div>
            </div>
            ${
              acts.length
                ? acts
                    .map(
                      (a: any) => `
                  <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f1f5f9;">
                    <div style="min-width:62px;font-size:13px;font-weight:600;color:#0d9488;background:#ccfbf1;padding:4px 8px;border-radius:8px;text-align:center;">
                      ${escapeHtml(a.time || "—")}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:15px;font-weight:600;color:#0f172a;line-height:1.4;">
                        ${escapeHtml(a.name || a.title || "")}
                      </div>
                      ${
                        a.location || a.address
                          ? `<div style="font-size:12px;color:#64748b;margin-top:3px;">📍 ${escapeHtml(a.location || a.address)}</div>`
                          : ""
                      }
                      ${
                        a.description
                          ? `<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.5;">${escapeHtml(String(a.description).slice(0, 160))}${String(a.description).length > 160 ? "…" : ""}</div>`
                          : ""
                      }
                    </div>
                  </div>
                `,
                    )
                    .join("")
                : `<div style="font-size:13px;color:#94a3b8;text-align:center;padding:12px;">${isArabic ? "لا توجد أنشطة" : "No activities"}</div>`
            }
          </div>
        `;
      })
      .join("")}
  `;

  document.body.appendChild(container);
  try {
    const containsArabic = /[\u0600-\u06FF]/.test(container.textContent || "");
    await waitForShareRender();
    await shareNodeAsImage({
      node: container,
      fileName: `aseel-full-plan-${(dest || "trip").replace(/\s+/g, "-")}`,
      shareText: isArabic
        ? `خطة رحلتي إلى ${dest} عبر ASEEL AI TRIP`
        : `My ${dest} trip plan via ASEEL AI TRIP`,
      watermark: true,
      isArabic,
      preserveArabic: isArabic || containsArabic,
      preferFast: true,
    });
  } finally {
    document.body.removeChild(container);
  }
}

/** Localized strings for share card across all supported languages. */
type ShareLocale = {
  badge: string;
  day: string;
  of: string;
  myTripTo: string;
  schedule: string;
  items: (n: number) => string;
  noActivities: string;
  ctaFooter: string;
  via: string;
  locale: string;
  rtl: boolean;
  tip: string;
  genericAction: (name: string) => string;
  entertainmentAction: (name: string) => string;
  mealAction: (name: string) => string;
  genericTip: string;
  foodTip: string;
};

const SHARE_I18N: Record<string, ShareLocale> = {
  en: { badge: "AI-Powered Travel Plan", day: "Day", of: "of", myTripTo: "of my trip to", schedule: "Day Schedule", items: (n) => `${n} ${n === 1 ? "item" : "items"}`,
    noActivities: "No activities scheduled", ctaFooter: "Create your own plan at", via: "via", locale: "en-GB", rtl: false,
    tip: "Tip", genericAction: (name) => `Explore ${name}`, entertainmentAction: (name) => `Enjoy ${name}`, mealAction: (name) => `Meal at ${name}`,
    genericTip: "Check opening hours before visiting", foodTip: "Book in advance especially during peak hours" },
  ar: { badge: "خطة سفر بالذكاء الاصطناعي", day: "اليوم", of: "من", myTripTo: "من رحلتي إلى", schedule: "جدول اليوم", items: (n) => `${n} ${n === 1 ? "عنصر" : n === 2 ? "عنصران" : "عناصر"}`,
    noActivities: "لا توجد أنشطة في هذا اليوم", ctaFooter: "أنشئ خطتك الخاصة على", via: "عبر", locale: "ar", rtl: true,
    tip: "نصيحة", genericAction: (name) => `استكشاف ${name}`, entertainmentAction: (name) => `الاستمتاع بـ ${name}`, mealAction: (name) => `وجبة في ${name}`,
    genericTip: "تحقق من ساعات العمل قبل الزيارة", foodTip: "احجز مسبقاً خاصة في أوقات الذروة" },
  fr: { badge: "Plan de Voyage par IA", day: "Jour", of: "sur", myTripTo: "de mon voyage à", schedule: "Programme du Jour", items: (n) => `${n} ${n === 1 ? "élément" : "éléments"}`,
    noActivities: "Aucune activité prévue", ctaFooter: "Créez votre propre plan sur", via: "via", locale: "fr-FR", rtl: false,
    tip: "Conseil", genericAction: (name) => `Découvrir ${name}`, entertainmentAction: (name) => `Profiter de ${name}`, mealAction: (name) => `Repas à ${name}`,
    genericTip: "Vérifiez les horaires d'ouverture avant la visite", foodTip: "Réservez à l'avance surtout aux heures de pointe" },
  es: { badge: "Plan de Viaje con IA", day: "Día", of: "de", myTripTo: "de mi viaje a", schedule: "Programa del Día", items: (n) => `${n} ${n === 1 ? "actividad" : "actividades"}`,
    noActivities: "Sin actividades programadas", ctaFooter: "Crea tu propio plan en", via: "vía", locale: "es-ES", rtl: false,
    tip: "Consejo", genericAction: (name) => `Explorar ${name}`, entertainmentAction: (name) => `Disfrutar de ${name}`, mealAction: (name) => `Comida en ${name}`,
    genericTip: "Verifica el horario antes de visitar", foodTip: "Reserva con antelación, especialmente en horas punta" },
  de: { badge: "KI-gestützter Reiseplan", day: "Tag", of: "von", myTripTo: "meiner Reise nach", schedule: "Tagesablauf", items: (n) => `${n} ${n === 1 ? "Eintrag" : "Einträge"}`,
    noActivities: "Keine Aktivitäten geplant", ctaFooter: "Erstelle deinen eigenen Plan auf", via: "über", locale: "de-DE", rtl: false,
    tip: "Tipp", genericAction: (name) => `${name} entdecken`, entertainmentAction: (name) => `${name} genießen`, mealAction: (name) => `Essen bei ${name}`,
    genericTip: "Öffnungszeiten vor dem Besuch prüfen", foodTip: "Besonders zu Stoßzeiten im Voraus reservieren" },
  ru: { badge: "План поездки с ИИ", day: "День", of: "из", myTripTo: "моей поездки в", schedule: "Программа дня", items: (n) => `${n} ${n === 1 ? "пункт" : n < 5 ? "пункта" : "пунктов"}`,
    noActivities: "Нет запланированных активностей", ctaFooter: "Создайте свой план на", via: "через", locale: "ru-RU", rtl: false,
    tip: "Совет", genericAction: (name) => `Исследуйте ${name}`, entertainmentAction: (name) => `Насладитесь ${name}`, mealAction: (name) => `Поесть в ${name}`,
    genericTip: "Проверьте часы работы перед посещением", foodTip: "Лучше бронировать заранее, особенно в часы пик" },
  zh: { badge: "AI 智能旅行计划", day: "第", of: "/", myTripTo: "我的旅程", schedule: "当日行程", items: (n) => `${n} 项`,
    noActivities: "暂无活动安排", ctaFooter: "在以下网站创建您的计划", via: "通过", locale: "zh-CN", rtl: false,
    tip: "提示", genericAction: (name) => `探索 ${name}`, entertainmentAction: (name) => `畅玩 ${name}`, mealAction: (name) => `在 ${name} 用餐`,
    genericTip: "前往前请确认营业时间", foodTip: "高峰时段建议提前预订" },
};

function getShareLocale(lang?: string) {
  const code = (lang || "en").slice(0, 2).toLowerCase();
  return SHARE_I18N[code] || SHARE_I18N.en;
}

function hasArabicText(value?: string | null) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function shouldUseRawLocalizedText(value: string, lang: string) {
  if (!value) return false;
  const code = (lang || "en").slice(0, 2).toLowerCase();
  return code === "ar" ? hasArabicText(value) : !hasArabicText(value);
}

const SHARE_CATEGORY_LABELS: Record<string, Record<string, string>> = {
  attraction: { en: "Attraction", ar: "معلم", fr: "Attraction", es: "Atracción", de: "Sehenswürdigkeit", ru: "Достопримечательность", zh: "景点" },
  activity: { en: "Activity", ar: "نشاط", fr: "Activité", es: "Actividad", de: "Aktivität", ru: "Активность", zh: "活动" },
  entertainment: { en: "Entertainment", ar: "ترفيه", fr: "Divertissement", es: "Entretenimiento", de: "Unterhaltung", ru: "Развлечение", zh: "娱乐" },
  nature: { en: "Nature", ar: "طبيعة", fr: "Nature", es: "Naturaleza", de: "Natur", ru: "Природа", zh: "自然" },
  food: { en: "Food", ar: "طعام", fr: "Restauration", es: "Comida", de: "Essen", ru: "Еда", zh: "餐饮" },
  restaurant: { en: "Restaurant", ar: "مطعم", fr: "Restaurant", es: "Restaurante", de: "Restaurant", ru: "Ресторан", zh: "餐厅" },
  cafe: { en: "Cafe", ar: "مقهى", fr: "Café", es: "Café", de: "Café", ru: "Кафе", zh: "咖啡馆" },
  breakfast: { en: "Breakfast", ar: "فطور", fr: "Petit-déjeuner", es: "Desayuno", de: "Frühstück", ru: "Завтрак", zh: "早餐" },
  lunch: { en: "Lunch", ar: "غداء", fr: "Déjeuner", es: "Almuerzo", de: "Mittagessen", ru: "Обед", zh: "午餐" },
  dinner: { en: "Dinner", ar: "عشاء", fr: "Dîner", es: "Cena", de: "Abendessen", ru: "Ужин", zh: "晚餐" },
  museum: { en: "Museum", ar: "متحف", fr: "Musée", es: "Museo", de: "Museum", ru: "Музей", zh: "博物馆" },
  shopping: { en: "Shopping", ar: "تسوق", fr: "Shopping", es: "Compras", de: "Shopping", ru: "Покупки", zh: "购物" },
};

function localizeCategory(category: string, lang: string) {
  const code = (lang || "en").slice(0, 2).toLowerCase();
  const key = String(category || "").toLowerCase();
  return SHARE_CATEGORY_LABELS[key]?.[code] || category;
}

const SHARE_TEAM_FLAGS: Record<string, string> = {
  "czech republic": "🇨🇿", "czechia": "🇨🇿", "south africa": "🇿🇦", "usa": "🇺🇸", "united states": "🇺🇸",
  "mexico": "🇲🇽", "canada": "🇨🇦", "argentina": "🇦🇷", "brazil": "🇧🇷", "france": "🇫🇷", "germany": "🇩🇪",
  "spain": "🇪🇸", "portugal": "🇵🇹", "england": "🏴", "italy": "🇮🇹", "netherlands": "🇳🇱", "croatia": "🇭🇷",
  "japan": "🇯🇵", "south korea": "🇰🇷", "saudi arabia": "🇸🇦", "morocco": "🇲🇦", "egypt": "🇪🇬",
};

function getShareTeamFlag(name: string) {
  return SHARE_TEAM_FLAGS[String(name || "").trim().toLowerCase()] || "⚽";
}

function inferSharedMatch(activity: any): {
  teams?: { a: string; b: string; flagA: string; flagB: string };
  venue?: string;
  kickoff?: string;
} {
  const explicitTeams = activity?.matchTeams?.a && activity?.matchTeams?.b
    ? {
        a: String(activity.matchTeams.a),
        b: String(activity.matchTeams.b),
        flagA: String(activity.matchTeams.flagA || getShareTeamFlag(activity.matchTeams.a)),
        flagB: String(activity.matchTeams.flagB || getShareTeamFlag(activity.matchTeams.b)),
      }
    : undefined;

  const blob = [activity?.matchReason, activity?.description, activity?.name, activity?.title, activity?.aiSourceQuery]
    .filter(Boolean)
    .join(" \n ");

  let inferredTeams = explicitTeams;
  if (!inferredTeams && blob) {
    const vs = blob.match(/([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)\s+(?:vs\.?|v\.?|ضد)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)(?=\s+(?:at|@|في|on|بتاريخ|،|,|-|—|\(|$))/i);
    if (vs) {
      const a = vs[1].trim().replace(/[.,;:]+$/, "");
      const b = vs[2].trim().replace(/[.,;:]+$/, "");
      inferredTeams = { a, b, flagA: getShareTeamFlag(a), flagB: getShareTeamFlag(b) };
    }
  }

  const inferredVenue = activity?.matchVenue || (blob.match(/(?:\bat\s+|@\s*|\bفي\s+)([A-Za-z\u0600-\u06FF][^\n,–—]{2,80}?)(?=\s+(?:on|بتاريخ|at\s+\d|في\s+\d|—|–|\(|$))/i)?.[1]?.trim().replace(/[.,;:]+$/, ""));
  const inferredKickoff = activity?.matchKickoff || activity?.startTime || activity?.time || (blob.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*UTC[+-]?\d{0,2})?)\b/)?.[1]?.trim());

  return { teams: inferredTeams, venue: inferredVenue, kickoff: inferredKickoff };
}

function isSharedMatchActivity(activity: any) {
  if (activity?.isMatchAnchor || activity?.matchTeams?.a) return true;
  const blob = `${activity?.matchReason || ""} ${activity?.description || ""} ${activity?.name || ""} ${activity?.title || ""}`.toLowerCase();
  return /\b(?:vs\.?|v\.?)\b|\bmatch schedule\b|\bمباراة\b|\bضد\b|\bkickoff\b|\bworld cup\b/i.test(blob);
}

function renderSharedMatchBanner(activity: any) {
  const inferred = inferSharedMatch(activity);
  const teams = inferred.teams;
  const venue = inferred.venue;
  const kickoff = inferred.kickoff;
  if (!teams || !isSharedMatchActivity(activity)) return "";

  return `
    <div style="margin-top:12px;border:1px solid #fbbf24;border-radius:18px;background:linear-gradient(135deg,#fffbeb 0%,#fff7ed 55%,#fff1f2 100%);padding:14px 16px;box-shadow:0 10px 30px -20px rgba(234,88,12,0.4);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="flex:1;min-width:0;text-align:center;">
          <div style="font-size:30px;line-height:1;">${escapeHtml(teams.flagA)}</div>
          <div style="font-size:14px;font-weight:800;color:#111827;margin-top:6px;line-height:1.3;">${formatShareSegmentHtml(teams.a, false)}</div>
        </div>
        <div style="flex-shrink:0;text-align:center;padding:0 6px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:1.5px;color:#ea580c;">VS</div>
          ${kickoff ? `<div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;background:#ffffff;border:1px solid #fed7aa;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;color:#111827;white-space:nowrap;">🕐 ${escapeHtml(String(kickoff))}</div>` : ""}
        </div>
        <div style="flex:1;min-width:0;text-align:center;">
          <div style="font-size:30px;line-height:1;">${escapeHtml(teams.flagB)}</div>
          <div style="font-size:14px;font-weight:800;color:#111827;margin-top:6px;line-height:1.3;">${formatShareSegmentHtml(teams.b, false)}</div>
        </div>
      </div>
      ${venue ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #fde68a;text-align:center;font-size:12px;color:#475569;font-weight:700;line-height:1.5;">📍 ${formatShareSegmentHtml(String(venue), false)}</div>` : ""}
    </div>
  `;
}

function buildActivityDescription(activity: any, lang: string, t: ShareLocale) {
  const raw = String(activity?.description || "").trim();
  const name = String(activity?.name || activity?.title || "").trim();
  if (raw && shouldUseRawLocalizedText(raw, lang)) return raw;
  const matchReason = String(activity?.matchReason || "").trim();
  if (matchReason && shouldUseRawLocalizedText(matchReason, lang)) return matchReason;
  const cat = String(activity?.category || activity?.type || "").toLowerCase();
  if (["food", "restaurant", "cafe", "breakfast", "lunch", "dinner", "snack"].includes(cat)) return t.mealAction(name);
  if (["entertainment"].includes(cat)) return t.entertainmentAction(name);
  return t.genericAction(name);
}

function buildActivityTip(activity: any, lang: string, t: ShareLocale) {
  const raw = Array.isArray(activity?.tips) ? String(activity.tips[0] || "").trim() : String(activity?.tip || activity?.tips || "").trim();
  if (raw && shouldUseRawLocalizedText(raw, lang)) return raw;
  const cat = String(activity?.category || activity?.type || "").toLowerCase();
  return ["food", "restaurant", "cafe", "breakfast", "lunch", "dinner", "snack"].includes(cat) ? t.foodTip : t.genericTip;
}

/**
 * Inject Google Fonts (Noto Sans / Noto Sans Arabic / Noto Sans SC / Inter) and
 * wait until they are decoded so html2canvas renders Arabic + Latin glyphs
 * cleanly (instead of the broken / disconnected glyphs we'd get otherwise).
 */
let fontsReady: Promise<void> | null = null;
function ensureShareFontsLoaded(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    try {
      const FONT_HREF =
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Kufi+Arabic:wght@400;500;600;700;800;900&family=Noto+Sans+Arabic:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700;900&display=swap";
      if (!document.querySelector(`link[data-share-fonts=\"1\"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = FONT_HREF;
        link.setAttribute("data-share-fonts", "1");
        document.head.appendChild(link);
      }
      if ((document as any).fonts?.load) {
        await Promise.all([
          (document as any).fonts.load('800 38px "Noto Kufi Arabic"'),
          (document as any).fonts.load('700 17px "Noto Kufi Arabic"'),
          (document as any).fonts.load('500 14px "Noto Sans Arabic"'),
          (document as any).fonts.load('800 38px "Inter"'),
          (document as any).fonts.load('700 17px "Inter"'),
          (document as any).fonts.load('700 17px "Noto Sans SC"'),
        ]).catch(() => {});
        await (document as any).fonts.ready?.catch?.(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
    }
  })();
  return fontsReady;
}

const FONT_STACK_LATIN = `"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", "Noto Sans Arabic", "Noto Kufi Arabic", "Noto Sans SC", Roboto, Arial, sans-serif`;
const FONT_STACK_RTL = `"Noto Kufi Arabic", "Noto Sans Arabic", "SF Arabic", "Geeza Pro", "Tahoma", "Inter", system-ui, sans-serif`;
const BRAND_SHARE_TEXT = "ASEEL AI TRIP • aseelaitrip.com";

function isolateLtrText(value: string) {
  return `\u2066${String(value || "")}\u2069`;
}

function formatShareSegmentText(value: string, rtl: boolean) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return rtl && /[A-Za-z0-9]/.test(normalized) ? isolateLtrText(normalized) : normalized;
}

function formatShareSegmentHtml(value: string, rtl: boolean) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (rtl && /[A-Za-z0-9]/.test(normalized)) {
    return `<bdi dir="ltr" style="unicode-bidi:isolate;display:inline-block;white-space:nowrap;">${escapeHtml(normalized)}</bdi>`;
  }
  // Wrap any text containing Arabic in a nowrap inline-block so html-to-image
  // doesn't fragment glyphs across line boxes (which causes the "broken"
  // disconnected Arabic letters in the rendered share image).
  if (hasArabicText(normalized)) {
    return `<span style="display:inline-block;white-space:nowrap;unicode-bidi:plaintext;">${escapeHtml(normalized)}</span>`;
  }
  return escapeHtml(normalized);
}

/** Wrap Arabic text so html-to-image preserves glyph shaping (no broken letters). */
function wrapArabicSafe(value: string): string {
  const normalized = String(value || "");
  if (!normalized.trim()) return "";
  if (hasArabicText(normalized)) {
    return `<span style="display:inline-block;unicode-bidi:plaintext;">${escapeHtml(normalized)}</span>`;
  }
  return escapeHtml(normalized);
}

function buildDayShareCaption({
  dayNum,
  destination,
  t,
  isArabic,
}: {
  dayNum: number;
  destination: string;
  t: ShareLocale;
  isArabic: boolean;
}) {
  if (isArabic) {
    return `${t.day} ${dayNum} ${t.myTripTo} ${formatShareSegmentText(destination, true)} ${t.via} ${isolateLtrText(BRAND_SHARE_TEXT)}`;
  }
  return `${t.day} ${dayNum} ${t.myTripTo} ${destination} ${t.via} ${BRAND_SHARE_TEXT}`;
}

function buildDayHeroTitleHtml({
  dayNum,
  totalDays,
  destination,
  t,
  lang,
}: {
  dayNum: number;
  totalDays: number;
  destination: string;
  t: ShareLocale;
  lang: string;
}) {
  if (lang.startsWith("zh")) {
    return `${escapeHtml(t.day)} ${dayNum}${totalDays ? ` / ${totalDays} 天` : ""} · ${formatShareSegmentHtml(destination, false)}`;
  }
  if (t.rtl) {
    // Build each Arabic phrase as a single nowrap inline-block so html-to-image
    // can't split glyphs apart. Destination (usually Latin) stays isolated LTR.
    const dayLabel = `<span style="display:inline-block;white-space:nowrap;">${escapeHtml(t.day)} ${dayNum}${totalDays ? ` ${escapeHtml(t.of)} ${totalDays}` : ""}</span>`;
    const phrase = `<span style="display:inline-block;white-space:nowrap;unicode-bidi:plaintext;">${escapeHtml(t.myTripTo)}</span>`;
    return `${dayLabel} ${phrase} ${formatShareSegmentHtml(destination, true)}`;
  }
  return `${escapeHtml(t.day)} ${dayNum}${totalDays ? ` ${escapeHtml(t.of)} ${totalDays}` : ""} ${escapeHtml(t.myTripTo)} ${escapeHtml(destination)}`;
}

function buildActivityShareCaption({
  name,
  place,
  t,
  isArabic,
}: {
  name: string;
  place: string;
  t: ShareLocale;
  isArabic: boolean;
}) {
  const safeName = formatShareSegmentText(name, false);
  const safePlace = formatShareSegmentText(place, isArabic);
  if (isArabic) {
    return `${safeName}${safePlace ? ` · ${safePlace}` : ""} ${t.via} ${isolateLtrText(BRAND_SHARE_TEXT)}`;
  }
  return `${name}${place ? ` · ${place}` : ""} ${t.via} ${BRAND_SHARE_TEXT}`;
}

/**
 * Build a dedicated, branded share image for a single day of the trip.
 * Premium design with large clear logo, full multi-language support, proper
 * Arabic glyph shaping (via Noto Kufi Arabic), and clean typography.
 */
export async function shareDayAsImage({
  day,
  dayIndex,
  destination,
  itinerary,
  isArabic = false,
  language,
}: {
  day: any;
  dayIndex: number;
  destination?: string;
  itinerary?: any;
  isArabic?: boolean;
  language?: string;
}): Promise<void> {
  const built = await buildDayShareNode({ day, dayIndex, destination, itinerary, isArabic, language });
  await waitForShareRender();
  const containsArabic = /[\u0600-\u06FF]/.test(built.node.textContent || "");
  try {
    await shareNodeAsImage({
      node: built.node,
      fileName: built.fileName,
      shareText: built.shareText,
      watermark: false,
      isArabic: built.isArabic,
      preserveArabic: built.preserveArabic ?? (built.isArabic || containsArabic),
      preferFast: true,
    });
  } finally {
    built.cleanup();
  }
}

/** Build the off-screen DOM node that represents a day's branded share card. */
export async function buildDayShareNode({
  day,
  dayIndex,
  destination,
  itinerary,
  isArabic = false,
  language,
}: {
  day: any;
  dayIndex: number;
  destination?: string;
  itinerary?: any;
  isArabic?: boolean;
  language?: string;
}) {
  // Arabic share images had glyph issues; render the IMAGE in English ONLY for Arabic,
  // but keep the share CAPTION in Arabic so the user-facing text matches their language.
  const requestedLang = language || (isArabic ? "ar" : "en");
  const isAr = isArabic || requestedLang === "ar";
  const lang = isAr ? "en" : requestedLang;
  if (isAr) { isArabic = false; language = "en"; }
  const t = getShareLocale(lang);
  const captionLocale = isAr ? getShareLocale("ar") : t;
  const dayNum = day?.dayNumber || dayIndex + 1;
  const dayDate = day?.date ? new Date(day.date) : null;
  const dest = destination || itinerary?.destination || day?.city || "";
  const acts = (day?.activities || []) as any[];
  const fmtDate = (d: Date | null) => {
    if (!d) return "";
    try {
      return d.toLocaleDateString(t.locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    } catch {
      return d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }
  };

  const totalDays = itinerary?.days?.length || 0;
  const tripBlurb = buildDayHeroTitleHtml({ dayNum, totalDays, destination: dest, t, lang });
  const shareText = buildDayShareCaption({ dayNum, destination: dest, t: captionLocale, isArabic: captionLocale.rtl });

  const [logoDataUrl] = await Promise.all([loadLogoDataUrl(), ensureShareFontsLoaded()]);

  const fontStack = t.rtl ? FONT_STACK_RTL : FONT_STACK_LATIN;

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: -10000px;
    width: 900px;
    background: #ffffff;
    color: #0f172a;
    font-family: ${fontStack};
    padding: 0;
    box-sizing: border-box;
    direction: ${t.rtl ? "rtl" : "ltr"};
    overflow: hidden;
    border-radius: 28px;
    box-shadow: 0 30px 80px -30px rgba(15, 118, 110, 0.4);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  `;

  const logoBlock = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="ASEEL AI TRIP" style="height:60px;width:auto;display:block;object-fit:contain;" />`
    : `<div style="height:60px;display:flex;align-items:center;font-size:24px;font-weight:900;color:#0f766e;letter-spacing:-0.5px;">ASEEL AI TRIP</div>`;

  container.innerHTML = `
    <!-- HERO -->
    <div style="position:relative;background:linear-gradient(135deg,#0d9488 0%,#0f766e 50%,#134e4a 100%);padding:44px 48px 48px;color:#ffffff;overflow:hidden;">
      <div style="position:absolute;top:-80px;${t.rtl ? "left" : "right"}:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(94,234,212,0.4) 0%,transparent 70%);"></div>
      <div style="position:absolute;bottom:-100px;${t.rtl ? "right" : "left"}:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(20,184,166,0.3) 0%,transparent 70%);"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:36px;position:relative;z-index:2;">
        <div style="display:flex;align-items:center;gap:14px;background:#ffffff;border-radius:20px;padding:14px 22px;box-shadow:0 14px 36px -10px rgba(0,0,0,0.3);">
          ${logoBlock}
          <div style="display:flex;flex-direction:column;line-height:1.1;${t.rtl ? "font-family:" + FONT_STACK_LATIN + ";" : ""}">
            <span style="font-size:22px;font-weight:900;color:#0f766e;letter-spacing:-0.5px;">ASEEL AI TRIP</span>
            <span style="font-size:13px;font-weight:600;color:#14b8a6;margin-top:3px;">aseelaitrip.com</span>
          </div>
        </div>
        <div style="font-size:13px;font-weight:700;background:rgba(255,255,255,0.22);padding:9px 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);white-space:nowrap;">
          ✨ ${wrapArabicSafe(t.badge)}
        </div>
      </div>

      <div style="position:relative;z-index:2;">
        <div style="font-size:13px;font-weight:700;text-transform:${t.rtl ? "none" : "uppercase"};letter-spacing:${t.rtl ? "0" : "2px"};opacity:0.9;margin-bottom:12px;">
          ${wrapArabicSafe(t.day)} ${dayNum}${day?.city ? ` · ${formatShareSegmentHtml(day.city, t.rtl)}` : dest && !lang.startsWith("zh") ? ` · ${formatShareSegmentHtml(dest, t.rtl)}` : ""}
        </div>
        <div style="font-size:${t.rtl ? "32px" : "40px"};font-weight:900;line-height:1.35;margin-bottom:18px;letter-spacing:-0.4px;max-width:780px;">
          ${tripBlurb}
        </div>
        ${dayDate ? `<div style="font-size:15px;font-weight:600;display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.22);padding:10px 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.25);">📅 <span style="display:inline-block;white-space:nowrap;unicode-bidi:plaintext;">${escapeHtml(fmtDate(dayDate))}</span></div>` : ""}
      </div>
    </div>

    <!-- ACTIVITIES -->
    <div style="background:#ffffff;padding:34px 38px 30px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:6px;height:30px;background:linear-gradient(180deg,#14b8a6,#0f766e);border-radius:3px;"></div>
          <div style="font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.4px;">
            ${wrapArabicSafe(t.schedule)}
          </div>
        </div>
        <div style="font-size:13px;color:#0f766e;font-weight:700;background:#ccfbf1;padding:8px 16px;border-radius:999px;border:1px solid #5eead4;">
          ${wrapArabicSafe(t.items(acts.length))}
        </div>
      </div>

      ${
        acts.length
          ? acts
              .map((a: any, idx: number) => {
                const time = (a.time || "").trim();
                const hasTime = !!time && time !== "—" && time !== "-";
                const name = a.name || a.title || "";
                const place = a.location || a.address || "";
                const desc = buildActivityDescription(a, lang, t);
                const matchBanner = renderSharedMatchBanner(a);
                return `
            <div style="display:flex;gap:18px;align-items:flex-start;padding:18px 18px;background:linear-gradient(135deg,#f0fdfa 0%,#ffffff 100%);border:1px solid #ccfbf1;border-radius:18px;margin-bottom:12px;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:64px;">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#14b8a6,#0d9488);color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;font-family:${FONT_STACK_LATIN};box-shadow:0 6px 16px -4px rgba(13,148,136,0.5);">${idx + 1}</div>
                ${hasTime ? `<div style="font-size:12px;font-weight:700;color:#0f766e;background:#ccfbf1;padding:4px 8px;border-radius:8px;font-family:${FONT_STACK_LATIN};white-space:nowrap;">${escapeHtml(time)}</div>` : ""}
              </div>
              <div style="flex:1;min-width:0;padding-top:2px;">
                <div style="font-size:18px;font-weight:700;color:#0f172a;line-height:1.35;letter-spacing:-0.2px;">
                  ${formatShareSegmentHtml(name, t.rtl)}
                </div>
                ${
                  place
                    ? `<div style="font-size:13px;color:#475569;margin-top:8px;font-weight:500;">📍 ${formatShareSegmentHtml(place, t.rtl)}</div>`
                    : ""
                }
                ${
                  desc && desc !== name
                    ? `<div style="font-size:13.5px;color:#475569;margin-top:8px;line-height:1.65;">${wrapArabicSafe(desc.slice(0, 220))}${desc.length > 220 ? "…" : ""}</div>`
                    : ""
                }
                ${matchBanner}
              </div>
            </div>
          `;
              })
              .join("")
          : `<div style="font-size:14px;color:#94a3b8;text-align:center;padding:36px;background:#f8fafc;border-radius:16px;">${wrapArabicSafe(t.noActivities)}</div>`
      }
    </div>

    <!-- FOOTER -->
    <div style="background:linear-gradient(180deg,#f8fafc,#f1f5f9);padding:20px 38px;text-align:center;border-top:1px solid #e2e8f0;">
      <div style="font-size:13px;color:#475569;font-weight:600;">
        ${wrapArabicSafe(t.ctaFooter)} <span style="color:#0f766e;font-weight:800;font-family:${FONT_STACK_LATIN};">aseelaitrip.com</span>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  return {
    node: container,
    cleanup: () => container.parentNode && container.parentNode.removeChild(container),
    shareText,
    fileName: `aseel-day-${dayNum}-${(dest || "trip").replace(/\s+/g, "-")}`,
    isArabic: t.rtl,
    preserveArabic: t.rtl,
  };
}

/**
 * Build a dedicated, branded share image for a single activity / event.
 */
export async function shareActivityAsImage({
  activity,
  dayIndex,
  destination,
  isArabic = false,
  language,
}: {
  activity: any;
  dayIndex?: number;
  destination?: string;
  isArabic?: boolean;
  language?: string;
}): Promise<void> {
  const built = await buildActivityShareNode({ activity, dayIndex, destination, isArabic, language });
  await waitForShareRender();
  const containsArabic = /[\u0600-\u06FF]/.test(built.node.textContent || "");
  try {
    await shareNodeAsImage({
      node: built.node,
      fileName: built.fileName,
      shareText: built.shareText,
      watermark: false,
      isArabic: built.isArabic,
      preserveArabic: built.preserveArabic ?? (built.isArabic || containsArabic),
      preferFast: true,
    });
  } finally {
    built.cleanup();
  }
}

/** Build the off-screen DOM node that represents a single activity share card. */
export async function buildActivityShareNode({
  activity,
  dayIndex,
  destination,
  isArabic = false,
  language,
}: {
  activity: any;
  dayIndex?: number;
  destination?: string;
  isArabic?: boolean;
  language?: string;
}) {
  // Arabic share images had glyph issues; render the IMAGE in English ONLY for Arabic,
  // but keep the share CAPTION in Arabic so the user-facing text matches their language.
  const requestedLang = language || (isArabic ? "ar" : "en");
  const isAr = isArabic || requestedLang === "ar";
  const lang = isAr ? "en" : requestedLang;
  if (isAr) { isArabic = false; language = "en"; }
  const t = getShareLocale(lang);
  const captionLocale = isAr ? getShareLocale("ar") : t;
  const time = (activity?.time || "").trim();
  const hasTime = !!time && time !== "—" && time !== "-";
  const name = activity?.name || activity?.title || "";
  const place = activity?.location || activity?.address || "";
  const dest = destination || activity?.city || "";

  const [logoDataUrl] = await Promise.all([loadLogoDataUrl(), ensureShareFontsLoaded()]);
  const fontStack = t.rtl ? FONT_STACK_RTL : FONT_STACK_LATIN;

  const logoBlock = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="ASEEL AI TRIP" style="height:52px;width:auto;display:block;object-fit:contain;" />`
    : `<div style="height:52px;display:flex;align-items:center;font-size:22px;font-weight:900;color:#0f766e;">ASEEL AI TRIP</div>`;

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed; top: 0; left: -10000px;
    width: 820px; background:#ffffff; color:#0f172a;
    font-family: ${fontStack}; box-sizing: border-box;
    direction: ${t.rtl ? "rtl" : "ltr"};
    overflow:hidden; border-radius:28px;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  `;

  const rating = activity?.rating ?? activity?.stars;
  const category = activity?.category || activity?.type || "";
  const localizedCategory = localizeCategory(String(category || ""), lang);
  const duration = activity?.duration || activity?.estimated_duration || "";
  const price = activity?.price || activity?.cost || activity?.estimated_cost || "";
  let desc = buildActivityDescription(activity, lang, t);
  let tipText = buildActivityTip(activity, lang, t);
  const matchBanner = renderSharedMatchBanner(activity);
  // Defensive: in Arabic→English fallback, strip any Arabic that slipped through raw fields.
  if (isAr) {
    if (desc && /[\u0600-\u06FF]/.test(desc)) desc = t.genericAction(name);
    if (tipText && /[\u0600-\u06FF]/.test(tipText)) tipText = t.genericTip;
  }
  const shareText = buildActivityShareCaption({ name, place, t: captionLocale, isArabic: captionLocale.rtl });

  const metaPills: string[] = [];
  if (hasTime) metaPills.push(`<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.22);padding:9px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);font-family:${FONT_STACK_LATIN};font-weight:800;font-size:14px;">⏰ ${escapeHtml(time)}</span>`);
  if (duration) metaPills.push(`<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.22);padding:9px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);font-weight:700;font-size:13px;">⏱️ ${escapeHtml(String(duration))}</span>`);
  if (rating) metaPills.push(`<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.22);padding:9px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);font-family:${FONT_STACK_LATIN};font-weight:800;font-size:13px;">⭐ ${escapeHtml(String(rating))}</span>`);
  if (price) metaPills.push(`<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.22);padding:9px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);font-weight:700;font-size:13px;">💰 ${escapeHtml(String(price))}</span>`);

  container.innerHTML = `
    <div style="position:relative;background:linear-gradient(135deg,#0d9488 0%,#0f766e 50%,#134e4a 100%);padding:40px 44px 36px;color:#fff;overflow:hidden;">
      <div style="position:absolute;top:-80px;${t.rtl ? "left" : "right"}:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(94,234,212,0.4) 0%,transparent 70%);"></div>
      <div style="position:absolute;bottom:-90px;${t.rtl ? "right" : "left"}:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(20,184,166,0.3) 0%,transparent 70%);"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;position:relative;z-index:2;margin-bottom:28px;">
        <div style="display:flex;align-items:center;gap:12px;background:#fff;border-radius:18px;padding:12px 20px;box-shadow:0 12px 28px -8px rgba(0,0,0,0.25);">
          ${logoBlock}
          <div style="display:flex;flex-direction:column;line-height:1.1;font-family:${FONT_STACK_LATIN};">
            <span style="font-size:20px;font-weight:900;color:#0f766e;letter-spacing:-0.4px;">ASEEL AI TRIP</span>
            <span style="font-size:12px;font-weight:600;color:#14b8a6;margin-top:2px;">aseelaitrip.com</span>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;background:rgba(255,255,255,0.22);padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);white-space:nowrap;">
          ✨ ${wrapArabicSafe(t.badge)}
        </div>
      </div>

      <div style="position:relative;z-index:2;">
        <div style="font-size:12px;font-weight:700;text-transform:${t.rtl ? "none" : "uppercase"};letter-spacing:${t.rtl ? "0" : "2px"};opacity:0.92;margin-bottom:14px;">
          ${dest ? formatShareSegmentHtml(dest, t.rtl) : ""}${dest && typeof dayIndex === "number" ? " · " : ""}${typeof dayIndex === "number" ? `${wrapArabicSafe(t.day)} ${dayIndex + 1}` : ""}${localizedCategory ? ` · ${wrapArabicSafe(String(localizedCategory))}` : ""}
        </div>
        <div style="font-size:${t.rtl ? "30px" : "36px"};font-weight:900;line-height:1.35;letter-spacing:-0.4px;margin-bottom:18px;max-width:720px;">
          ${formatShareSegmentHtml(name, t.rtl)}
        </div>
        ${metaPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;">${metaPills.join("")}</div>` : ""}
      </div>
    </div>

    <div style="padding:32px 44px 28px;background:#ffffff;">
      ${place ? `<div style="display:flex;align-items:flex-start;gap:12px;font-size:15px;color:#0f172a;margin-bottom:20px;font-weight:600;background:linear-gradient(135deg,#f0fdfa,#ffffff);padding:16px 18px;border-radius:16px;border:1px solid #ccfbf1;">
        <span style="font-size:20px;line-height:1;">📍</span>
        <span style="flex:1;line-height:1.5;">${formatShareSegmentHtml(place, t.rtl)}</span>
      </div>` : ""}
      ${matchBanner}
      ${desc && desc !== name ? `<div style="font-size:15.5px;color:#334155;line-height:1.75;margin-bottom:${tipText ? "18px" : "0"};">${wrapArabicSafe(desc.slice(0, 600))}${desc.length > 600 ? "…" : ""}</div>` : ""}
      ${tipText ? `<div style="font-size:14px;color:#0f766e;line-height:1.65;background:#fefce8;border:1px solid #fde68a;border-${t.rtl ? "right" : "left"}:4px solid #f59e0b;padding:14px 18px;border-radius:12px;font-weight:500;">
        <span style="font-weight:800;color:#b45309;">💡 ${wrapArabicSafe(t.tip)}:</span> ${wrapArabicSafe(String(tipText).slice(0, 240))}
      </div>` : ""}
    </div>

    <div style="background:linear-gradient(180deg,#f8fafc,#f1f5f9);padding:18px 40px;text-align:center;border-top:1px solid #e2e8f0;">
      <div style="font-size:13px;color:#475569;font-weight:600;">
        ${wrapArabicSafe(t.ctaFooter)} <span style="color:#0f766e;font-weight:800;font-family:${FONT_STACK_LATIN};">aseelaitrip.com</span>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  return {
    node: container,
    cleanup: () => container.parentNode && container.parentNode.removeChild(container),
    shareText,
    fileName: `aseel-activity-${(name || "activity").slice(0, 40).replace(/\s+/g, "-")}`,
    isArabic: t.rtl,
    preserveArabic: t.rtl,
  };
}

export function getDayShareText({
  day,
  dayIndex,
  destination,
  itinerary,
  isArabic = false,
  language,
}: {
  day: any;
  dayIndex: number;
  destination?: string;
  itinerary?: any;
  isArabic?: boolean;
  language?: string;
}) {
  // Caption follows the user's language (Arabic stays Arabic, others as-is).
  const lang = language || (isArabic ? "ar" : "en");
  const t = getShareLocale(lang);
  const dayNum = day?.dayNumber || dayIndex + 1;
  const dest = destination || itinerary?.destination || day?.city || "";
  return buildDayShareCaption({ dayNum, destination: dest, t, isArabic: t.rtl });
}


export function getActivityShareText({
  activity,
  destination,
  isArabic = false,
  language,
}: {
  activity: any;
  destination?: string;
  isArabic?: boolean;
  language?: string;
}) {
  // Caption follows the user's language (Arabic stays Arabic, others as-is).
  const lang = language || (isArabic ? "ar" : "en");
  const t = getShareLocale(lang);
  const name = activity?.name || activity?.title || "";
  const place = activity?.location || activity?.address || destination || activity?.city || "";
  return buildActivityShareCaption({ name, place, t, isArabic: t.rtl });
}

/** Load /logo.png and convert to a data URL so html2canvas captures it reliably. */
let cachedLogoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch("/logo.png", { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogoDataUrl = typeof reader.result === "string" ? reader.result : null;
        resolve(cachedLogoDataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
