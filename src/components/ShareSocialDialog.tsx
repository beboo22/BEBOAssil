import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Facebook, Send, Link2, Download } from "lucide-react";
import {
  renderNodeToImageBlob,
  shareImageToSocial,
  type SocialSharePlatform,
} from "@/utils/shareAsImage";

interface BuildResult {
  node: HTMLElement;
  cleanup: () => void;
  shareText: string;
  fileName: string;
  isArabic: boolean;
  preserveArabic?: boolean;
}

interface ShareSocialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  isArabic?: boolean;
  /** Async builder that creates the off-screen DOM node + share metadata. */
  build: () => Promise<BuildResult>;
}

// Inline X (Twitter) logo as proper SVG so we ship the new branding.
const XIcon: React.ComponentType<any> = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2H21l-6.52 7.45L22 22h-6.797l-4.77-6.24L4.8 22H2.04l6.978-7.97L2 2h6.914l4.31 5.7L18.244 2zm-1.193 18h1.83L7.04 4H5.09l11.96 16z" />
  </svg>
);

const PLATFORMS: { id: SocialSharePlatform; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-green-500" },
  { id: "twitter", label: "X", icon: XIcon, color: "text-foreground" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600" },
  { id: "telegram", label: "Telegram", icon: Send, color: "text-blue-400" },
  { id: "copy", label: "Copy", icon: Link2, color: "text-muted-foreground" },
];

export const ShareSocialDialog = ({ open, onOpenChange, title, isArabic, build }: ShareSocialDialogProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [meta, setMeta] = useState<{ shareText: string; fileName: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setBlob(null);
      setMeta(null);
      return;
    }
    let cancelled = false;
    let cleanupFn: (() => void) | null = null;
    setLoading(true);
    (async () => {
      try {
        const res = await build();
        cleanupFn = res.cleanup;
        const imgBlob = await renderNodeToImageBlob({
          node: res.node,
          watermark: false,
          isArabic: res.isArabic,
          preserveArabic: res.preserveArabic ?? res.isArabic,
          preferFast: true,
        });
        cleanupFn?.();
        cleanupFn = null;
        if (cancelled) return;
        setBlob(imgBlob);
        setMeta({ shareText: res.shareText, fileName: res.fileName });
        if (imgBlob) setPreviewUrl(URL.createObjectURL(imgBlob));
      } catch (err) {
        console.error("ShareSocialDialog build failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanupFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePick = async (platform: SocialSharePlatform) => {
    if (!meta) return;
    await shareImageToSocial({
      platform,
      blob,
      fileName: meta.fileName,
      text: meta.shareText,
      isArabic,
    });
    if (platform !== "copy") onOpenChange(false);
  };

  const handleDownload = () => {
    if (!blob || !meta) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.fileName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-")}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">{title || (isArabic ? "مشاركة" : "Share")}</DialogTitle>
        <div className="bg-gradient-to-br from-primary/10 via-background to-background p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            {title || (isArabic ? "مشاركة" : "Share")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isArabic ? "اختر منصة لمشاركة الصورة مباشرة" : "Pick a platform to share the image"}
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 overflow-hidden flex items-center justify-center min-h-[180px] aspect-video">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">{isArabic ? "جارِ تجهيز الصورة..." : "Preparing image..."}</span>
              </div>
            ) : previewUrl ? (
              <img src={previewUrl} alt="share preview" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">{isArabic ? "تعذّر تجهيز الصورة" : "Could not prepare image"}</span>
            )}
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {PLATFORMS.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                disabled={loading}
                onClick={() => handlePick(id)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={label}
              >
                <Icon className={`h-5 w-5 ${color}`} />
                <span className="text-[10px] font-medium text-foreground/80 leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleDownload} disabled={!blob}>
            <Download size={14} />
            {isArabic ? "تنزيل الصورة" : "Download Image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};