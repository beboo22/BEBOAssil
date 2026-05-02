const SITE_URL = 'https://aseelaitrip.com';

export const sitemapRoutes = [
  { path: '/', changefreq: 'daily', priority: 1.0 },
  { path: '/destinations', changefreq: 'weekly', priority: 0.9 },
  { path: '/planner', changefreq: 'weekly', priority: 0.9 },
  { path: '/flights', changefreq: 'daily', priority: 0.9 },
  { path: '/hotels', changefreq: 'daily', priority: 0.9 },
  { path: '/cars', changefreq: 'weekly', priority: 0.8 },
  { path: '/events', changefreq: 'daily', priority: 0.8 },
  { path: '/promotions', changefreq: 'daily', priority: 0.8 },
  { path: '/bookings', changefreq: 'weekly', priority: 0.7 },
  { path: '/stories', changefreq: 'daily', priority: 0.7 },
  { path: '/stories/discover', changefreq: 'daily', priority: 0.7 },
  { path: '/adventure-map', changefreq: 'weekly', priority: 0.7 },
  { path: '/memories', changefreq: 'weekly', priority: 0.7 },
  { path: '/stories/reels', changefreq: 'daily', priority: 0.7 },
  { path: '/my-trips', changefreq: 'weekly', priority: 0.7 },
  { path: '/wallet', changefreq: 'weekly', priority: 0.6 },
  { path: '/pricing', changefreq: 'monthly', priority: 0.8 },
  { path: '/saved-bookings', changefreq: 'weekly', priority: 0.6 },
  { path: '/terms', changefreq: 'monthly', priority: 0.4 },
  { path: '/privacy', changefreq: 'monthly', priority: 0.4 },
  { path: '/auth', changefreq: 'monthly', priority: 0.5 },
];

export function generateSitemapXml(): string {
  const urls = sitemapRoutes
    .map(
      (r) => `\n<url>\n<loc>${SITE_URL}${r.path}</loc>\n<changefreq>${r.changefreq}</changefreq>\n<priority>${r.priority.toFixed(1)}</priority>\n</url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n\n</urlset>`;
}
