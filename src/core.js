import './bootstrap.js';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPlatform, listPlatforms, scrape } from './platforms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AIODL_RATE_LIMIT || 30),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { status: false, message: 'Too many requests. Please wait a moment and try again.' },
});

app.get('/api/health', (_req, res) => res.json({ status: true, service: 'AIODL', uptime: Math.round(process.uptime()) }));
app.get('/api/platforms', (_req, res) => res.json({ status: true, platforms: listPlatforms() }));

app.post('/api/scrape', scrapeLimiter, async (req, res) => {
  const input = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!input || input.length > 2048) return res.status(400).json({ status: false, message: 'Please enter a valid URL.' });
  let url;
  try { url = new URL(input).href; } catch { return res.status(400).json({ status: false, message: 'That URL is not valid.' }); }
  if (!/^https?:$/.test(new URL(url).protocol)) return res.status(400).json({ status: false, message: 'Only HTTP and HTTPS links are supported.' });

  const platform = detectPlatform(url);
  if (!platform) return res.status(400).json({ status: false, message: 'This platform is not supported yet.' });

  const started = Date.now();
  try {
    const response = await scrape(url);
    const result = response.result || {};
    const safeDownloads = Array.isArray(result.downloads)
      ? result.downloads.filter(d => d?.url && /^https?:\/\//i.test(d.url)).map((d, i) => ({
          id: i + 1,
          type: String(d.type || d.quality || 'Download').slice(0, 80),
          quality: d.quality ? String(d.quality).slice(0, 50) : null,
          url: d.url,
          thumbnail: d.thumbnail || null,
        }))
      : [];
    if (!safeDownloads.length) throw new Error('No downloadable media was found.');
    res.json({ status: true, platform: { id: platform.id, name: platform.name, icon: platform.icon }, result: { title: result.title || `${platform.name} Media`, author: result.author || null, thumbnail: result.thumbnail || null, downloads: safeDownloads, sourceUrl: url }, tookMs: Date.now() - started });
  } catch (err) {
    console.error(`[${platform.id}]`, err);
    res.status(502).json({ status: false, message: err?.message || 'Unable to process this link right now.', platform: platform.id });
  }
});

app.use(express.static(publicDir, { maxAge: '1d', etag: true, extensions: ['html'] }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

export default app;

