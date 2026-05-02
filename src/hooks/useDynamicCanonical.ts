import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://aseelaitrip.com';
const PRIMARY_HOST = 'aseelaitrip.com';

/**
 * Dynamically updates the canonical URL and OG URL meta tags
 * to match the current page path on the correct domain.
 * Also injects noindex on non-primary domains to prevent duplicate indexing.
 */
export const useDynamicCanonical = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname === '/index' ? '/' : location.pathname;
    const canonicalUrl = `${SITE_URL}${path === '/' ? '' : path}`;

    // Update canonical link
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) {
      link.href = canonicalUrl;
    } else {
      link = document.createElement('link');
      link.rel = 'canonical';
      link.href = canonicalUrl;
      document.head.appendChild(link);
    }

    // Update og:url
    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.content = canonicalUrl;
    }

    // If served from a non-primary domain, inject noindex to prevent duplicate indexing
    const host = window.location.hostname;
    const isNonPrimary = host !== PRIMARY_HOST && host !== `www.${PRIMARY_HOST}` && !host.includes('localhost');
    
    let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (isNonPrimary) {
      if (robotsMeta) {
        robotsMeta.content = 'noindex, nofollow';
      }
      // Also set googlebot
      let googlebotMeta = document.querySelector<HTMLMetaElement>('meta[name="googlebot"]');
      if (googlebotMeta) {
        googlebotMeta.content = 'noindex, nofollow';
      }
    }
  }, [location.pathname]);
};
