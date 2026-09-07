require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ROOT = __dirname;
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

app.use(express.json());

/** Canonical site origin for absolute URLs (sitemap). No trailing slash. */
function publicSiteOrigin() {
  const explicit = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = (process.env.VERCEL_URL || '').trim();
  if (vercel) return 'https://' + vercel.replace(/^https?:\/\//, '');
  const port = process.env.PORT || 3000;
  return 'http://localhost:' + port;
}

/** Public HTML routes to surface for search engines. */
const SITEMAP_ENTRIES = [
  { locPath: '/', file: 'index.html' },
  { locPath: '/portfolio.html', file: 'portfolio.html' },
  { locPath: '/blog.html', file: 'blog.html' },
  { locPath: '/blog-post-1.html', file: 'blog-post-1.html' },
  { locPath: '/blog-post-2.html', file: 'blog-post-2.html' },
  { locPath: '/blog-post-3.html', file: 'blog-post-3.html' },
  { locPath: '/blog-post-4.html', file: 'blog-post-4.html' },
  { locPath: '/blog-post-5.html', file: 'blog-post-5.html' },
  { locPath: '/blog-post-6.html', file: 'blog-post-6.html' },
];

function formatSitemapLastMod(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

app.get('/sitemap.xml', function sitemapXml(_req, res) {
  const origin = publicSiteOrigin();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (let i = 0; i < SITEMAP_ENTRIES.length; i++) {
    const entry = SITEMAP_ENTRIES[i];
    const fullUrl = origin + entry.locPath;
    lines.push('  <url>');
    lines.push('    <loc>' + fullUrl.replace(/&/g, '&amp;') + '</loc>');
    if (fs.existsSync(PUBLIC_DIR)) {
      const fp = path.join(PUBLIC_DIR, entry.file);
      try {
        const st = fs.statSync(fp);
        const lm = formatSitemapLastMod(st.mtime);
        if (lm) lines.push('    <lastmod>' + lm + '</lastmod>');
      } catch (_) {}
    }
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>' + (entry.locPath === '/' ? '1.0' : '0.8') + '</priority>');
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  res.type('application/xml').send(lines.join('\n'));
});

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

function startServer() {
  app.listen(PORT, () => {
    console.log(`SN Web Design server running on http://localhost:${PORT}`);
  });
}

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;
