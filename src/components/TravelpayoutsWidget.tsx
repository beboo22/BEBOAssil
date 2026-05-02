import { useState, useRef, useEffect } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface TravelpayoutsWidgetProps {
  scriptUrl: string;
  containerId: string;
  className?: string;
  /** Minimum height for the widget container (px) */
  minHeight?: number;
  /** Timeout in ms before marking as loaded regardless (default: 12000) */
  loadTimeout?: number;
}

/**
 * Embeds a Travelpayouts widget inside an isolated iframe to avoid
 * conflicts with React's lifecycle (StrictMode double-mount, cleanup, etc.).
 *
 * The tpscr.com/content scripts expect a static page context with
 * iFrameResizer — wrapping them in our own iframe gives them that.
 */
const TravelpayoutsWidget = ({
  scriptUrl,
  containerId,
  className = "",
  minHeight = 300,
  loadTimeout = 12000,
}: TravelpayoutsWidgetProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [key, setKey] = useState(0); // for retry

  // Build a self-contained HTML document that loads the widget script
  const buildSrcDoc = (url: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; overflow-x: hidden; }
    /* Allow the widget to fill the iframe */
    body > div, body > iframe, body > section { width: 100% !important; }
  </style>
</head>
<body>
  <script async src="${url}" charset="utf-8"><\/script>
</body>
</html>`;

  useEffect(() => {
    setStatus("loading");
    const t = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "loaded" : prev));
    }, loadTimeout);
    return () => clearTimeout(t);
  }, [key, scriptUrl, loadTimeout]);

  const handleLoad = () => {
    // Widget scripts take some time after iframe load to render
    setTimeout(() => setStatus("loaded"), 1500);
  };

  const handleError = () => setStatus("error");

  const handleRetry = () => {
    setKey((k) => k + 1);
  };

  return (
    <div
      className={`tp-widget-container relative ${className}`}
      style={{ minHeight }}
      id={containerId}
    >
      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10 rounded-xl">
          <Loader2 className="animate-spin text-primary mb-2" size={28} />
          <p className="text-sm text-muted-foreground">جارٍ تحميل العروض...</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10 rounded-xl">
          <AlertCircle className="text-destructive mb-2" size={28} />
          <p className="text-sm text-destructive font-medium">تعذر تحميل الأداة</p>
          <button
            onClick={handleRetry}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* Isolated iframe */}
      <iframe
        key={key}
        ref={iframeRef}
        srcDoc={buildSrcDoc(scriptUrl)}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          width: "100%",
          minHeight,
          height: minHeight + 200,
          border: "none",
          display: "block",
        }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation allow-top-navigation-by-user-activation allow-modals"
        title="Travelpayouts Widget"
        loading="lazy"
      />
    </div>
  );
};

export default TravelpayoutsWidget;
