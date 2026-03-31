require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('@clerk/backend');
const store = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;

/** Vercel lambdas use a read-only filesystem; mkdir/write outside /tmp throws at boot. */
const IS_VERCEL = process.env.VERCEL === '1';

/** Project root (where server.js lives). Pages and static UI must live in public/ on Vercel (CDN); express.static there is ignored in prod but keeps local dev working. */
const PROJECT_ROOT = __dirname;
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads', 'contracts');

function ensureLocalUploadsDir() {
  if (IS_VERCEL || store.useRedis()) return;
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const DATA_DIR = path.join(PROJECT_ROOT, 'data');
if (!IS_VERCEL && !store.useRedis() && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureLocalUploadsDir();

function contractPublicUrl(contract) {
  if (!contract || !contract.path) return null;
  if (/^https?:\/\//i.test(contract.path)) return contract.path;
  return '/uploads/contracts/' + path.basename(contract.path);
}

async function getAuthUser(req) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'No token sent' };
  const secretKey = (process.env.CLERK_SECRET_KEY || '').trim();
  if (!secretKey) return { error: 'CLERK_SECRET_KEY is not set in .env' };
  try {
    const result = await verifyToken(token, { secretKey });
    const data = result.data ?? result;
    if (!data || !data.sub) return { error: 'Token verification failed' };
    return data;
  } catch (err) {
    return { error: 'Invalid secret key or token. Copy the full CLERK_SECRET_KEY from dashboard.clerk.com → API Keys.' };
  }
}

function isOwner(clerkUserId) {
  const ownerId = (process.env.OWNER_CLERK_USER_ID || '').trim().replace(/^\uFEFF/, '');
  const userId = (clerkUserId || '').trim();
  return ownerId && userId && ownerId === userId;
}

const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (_req, file, cb) {
      cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9.-]/g, '_'));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF and Word documents are allowed'));
  },
});

const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF and Word documents are allowed'));
  },
});

function uploadContractMiddleware(req, res, next) {
  const handler = store.useRedis() ? uploadMem.single('contract') : uploadDisk.single('contract');
  handler(req, res, function (err) {
    if (err) return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    next();
  });
}

app.use(cors());
app.use(express.json());

/** Canonical site origin for absolute URLs (sitemap, links). No trailing slash. */
function publicSiteOrigin() {
  const explicit = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = (process.env.VERCEL_URL || '').trim();
  if (vercel) return 'https://' + vercel.replace(/^https?:\/\//, '');
  const port = process.env.PORT || 3000;
  return 'http://localhost:' + port;
}

/** Public HTML routes to surface for search engines (exclude auth / client / admin). */
const SITEMAP_ENTRIES = [
  { locPath: '/', file: 'index.html' },
  { locPath: '/start.html', file: 'start.html' },
  { locPath: '/portfolio.html', file: 'portfolio.html' },
  { locPath: '/blog.html', file: 'blog.html' },
  { locPath: '/project-brief.html', file: 'project-brief.html' },
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
app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')));

app.get('/api/config', (req, res) => {
  const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  let clerkFrontendApi = process.env.CLERK_FRONTEND_API || '';
  if (!clerkFrontendApi && clerkPublishableKey) {
    const match = clerkPublishableKey.match(/^pk_(?:test|live)_(.+)$/);
    if (match) {
      try {
        clerkFrontendApi = Buffer.from(match[1].replace(/[^A-Za-z0-9+/=]/, ''), 'base64').toString('utf8');
      } catch (_) {}
    }
  }
  res.json({ clerkPublishableKey, clerkFrontendApi });
});

app.post('/api/send-email', async (req, res) => {
  const { name, email, company, details } = req.body || {};

  if (!name || !email || !details) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const toAddress = process.env.SMTP_TO || 'snwebdesignco@gmail.com';
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@snwebdesign.local';

    const lines = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company || '—'}`,
      '',
      'Project details:',
      details,
    ];

    await transporter.sendMail({
      from: fromAddress,
      to: toAddress,
      subject: `New project inquiry from ${name}`,
      text: lines.join('\n'),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Email error', err);
    res.status(500).json({ ok: false, error: 'Email failed' });
  }
});

app.get('/api/admin/check', async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ isOwner: false, debug: user.error });
  }
  if (!user || !user.sub) {
    return res.status(401).json({ isOwner: false, debug: 'Could not verify your session. Try signing out and back in.' });
  }
  const ok = isOwner(user.sub);
  const payload = { isOwner: ok };
  if (!ok) {
    payload.debug = { yourUserId: user.sub, expectedEnvVar: 'OWNER_CLERK_USER_ID' };
  }
  res.json(payload);
});

app.post('/api/contract/upload', uploadContractMiddleware, async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ ok: false, error: user.error });
  }
  if (!user || !isOwner(user.sub)) {
    return res.status(403).json({ ok: false, error: 'Owner access required' });
  }
  const clientEmail = (req.body.clientEmail || '').trim().toLowerCase();
  if (!clientEmail) {
    return res.status(400).json({ ok: false, error: 'clientEmail is required' });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No contract file uploaded' });
  }

  if (store.useRedis()) {
    const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
    if (!blobToken) {
      return res.status(500).json({
        ok: false,
        error: 'BLOB_READ_WRITE_TOKEN is not set. Add Vercel Blob to this project and set the token in Environment Variables.',
      });
    }
  }

  const contracts = await store.loadContracts();
  if (contracts[clientEmail]) {
    await store.removeContractFile(contracts[clientEmail]);
  }

  if (store.useRedis()) {
    const safeKey = clientEmail.replace(/[^a-z0-9@._-]/gi, '_');
    const ext = path.extname(req.file.originalname) || '.pdf';
    const { put } = require('@vercel/blob');
    const blob = await put(
      `contracts/${safeKey}/${Date.now()}${ext}`,
      req.file.buffer,
      { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN }
    );
    contracts[clientEmail] = {
      filename: req.file.originalname,
      path: blob.url,
      uploadedAt: new Date().toISOString(),
    };
  } else {
    const relativePath = path.relative(__dirname, req.file.path).replace(/\\/g, '/');
    contracts[clientEmail] = {
      filename: req.file.originalname,
      path: relativePath,
      uploadedAt: new Date().toISOString(),
    };
  }

  await store.saveContracts(contracts);
  res.json({ ok: true, clientEmail });
});

app.get('/api/admin/contracts', async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ ok: false, error: user.error });
  }
  if (!user || !isOwner(user.sub)) {
    return res.status(403).json({ ok: false, error: 'Owner access required' });
  }
  const contracts = await store.loadContracts();
  const signed = await store.loadSigned();
  const list = Object.keys(contracts).map(function (email) {
    const c = contracts[email];
    return {
      clientEmail: email,
      filename: c.filename,
      uploadedAt: c.uploadedAt,
      signedAt: signed[email] || null,
    };
  });
  res.json({ ok: true, contracts: list });
});

app.delete('/api/contract', async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ ok: false, error: user.error });
  }
  if (!user || !isOwner(user.sub)) {
    return res.status(403).json({ ok: false, error: 'Owner access required' });
  }
  const clientEmail = (req.body?.clientEmail || req.query.clientEmail || '').trim().toLowerCase();
  if (!clientEmail) {
    return res.status(400).json({ ok: false, error: 'clientEmail is required' });
  }
  const contracts = await store.loadContracts();
  const contract = contracts[clientEmail];
  if (!contract) {
    return res.status(404).json({ ok: false, error: 'No contract found for this client' });
  }
  await store.removeContractFile(contract);
  delete contracts[clientEmail];
  await store.saveContracts(contracts);
  const signed = await store.loadSigned();
  delete signed[clientEmail];
  await store.saveSigned(signed);
  res.json({ ok: true, clientEmail });
});

app.get('/api/contract', async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ ok: false, error: user.error });
  }
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Sign in required' });
  }
  let clientEmail = (req.query.email || '').trim().toLowerCase();
  if (clientEmail && !isOwner(user.sub)) {
    return res.status(403).json({ ok: false, error: 'Only owner can view other clients' });
  }
  if (!clientEmail) {
    const resp = await fetch(`https://api.clerk.com/v1/users/${user.sub}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (!resp.ok) {
      return res.status(500).json({ ok: false, error: 'Could not fetch user' });
    }
    const clerkUser = await resp.json();
    const primary = clerkUser.email_addresses?.find(function (e) { return e.id === clerkUser.primary_email_address_id; });
    clientEmail = (primary?.email_address || '').toLowerCase();
  }
  if (!clientEmail) {
    return res.status(400).json({ ok: false, error: 'No email found for user' });
  }
  const contracts = await store.loadContracts();
  const contract = contracts[clientEmail];
  if (!contract || !contract.path) {
    return res.status(404).json({ ok: false, error: 'No contract assigned for this client' });
  }
  const signed = await store.loadSigned();
  res.json({
    ok: true,
    url: contractPublicUrl(contract),
    filename: contract.filename,
    signedAt: signed[clientEmail] || null,
  });
});

app.post('/api/contract/sign', async (req, res) => {
  const user = await getAuthUser(req);
  if (user && user.error) {
    return res.status(401).json({ ok: false, error: user.error });
  }
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Sign in required' });
  }
  if (isOwner(user.sub)) {
    return res.status(400).json({ ok: false, error: 'Owner cannot sign as client' });
  }
  const resp = await fetch(`https://api.clerk.com/v1/users/${user.sub}`, {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!resp.ok) {
    return res.status(500).json({ ok: false, error: 'Could not fetch user' });
  }
  const clerkUser = await resp.json();
  const primary = clerkUser.email_addresses?.find(function (e) { return e.id === clerkUser.primary_email_address_id; });
  const clientEmail = (primary?.email_address || '').toLowerCase();
  if (!clientEmail) {
    return res.status(400).json({ ok: false, error: 'No email found' });
  }
  const contracts = await store.loadContracts();
  if (!contracts[clientEmail]) {
    return res.status(404).json({ ok: false, error: 'No contract assigned' });
  }
  const signed = await store.loadSigned();
  signed[clientEmail] = new Date().toISOString();
  await store.saveSigned(signed);
  res.json({ ok: true, signedAt: signed[clientEmail] });
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`SN Web Design server running on http://localhost:${PORT}`);
    const sk = (process.env.CLERK_SECRET_KEY || '').trim();
    if (!sk) {
      console.warn('Warning: CLERK_SECRET_KEY is not set. Admin and contract APIs will not work.');
    } else if (sk.length < 50) {
      console.warn('Warning: CLERK_SECRET_KEY seems too short (' + sk.length + ' chars). Copy the full key from dashboard.clerk.com');
    }
  });
}

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;
