export const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aiml-stt`;

const speechLangMap: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  zh: "zh-CN",
  ja: "ja-JP",
  it: "it-IT",
  tr: "tr-TR",
  hi: "hi-IN",
};

export function getSpeechLang(language: string): string {
  const base = (language || "en").split("-")[0].toLowerCase();
  return speechLangMap[base] || "en-US";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert audio blob"));
      }
    };
    reader.onerror = () => reject(new Error("Audio read error"));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudioBlob(blob: Blob, language?: string): Promise<string> {
  if (!blob || blob.size < 500) return "";

  const audioBase64 = await blobToDataUrl(blob);

  const langCode = (language && language !== 'auto') ? language.split("-")[0].toLowerCase() : undefined;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 22000);

    const response = await fetch(STT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        audioBase64,
        ...(langCode ? { language: langCode } : {}),
      }),
    }).finally(() => window.clearTimeout(timeoutId));

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      let errMsg = err?.error || String(response.status);
      if (typeof errMsg === 'string' && errMsg.includes('<!DOCTYPE html>')) {
        errMsg = 'External STT Service Timeout (524)';
      }
      console.warn("STT error:", errMsg);
      return "";
    }

    const data = await response.json();
    return (data?.text || data?.result?.text || "").trim();
  } catch (err: any) {
    // Network errors, aborts, etc. — don't crash the voice loop
    if (err?.name === 'AbortError') {
      console.warn("STT fetch timeout");
      return "";
    }
    console.warn("STT fetch error:", err?.message || err);
    return "";
  }
}
