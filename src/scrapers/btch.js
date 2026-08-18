import {
  igdl,
  ttdl,
  fbdown,
  twitter,
  youtube,
  mediafire,
  capcut,
  gdrive,
  pinterest,
  douyin,
  xiaohongshu,
  xiaohongshuProfile,
  snackvideo,
  cocofun,
  spotify,
  soundcloud,
  threads,
  kuaishou,
  aio,
} from 'btch-downloader';

import { createScraperResult } from './httpHelper.js';

const handlers = {
  instagram: igdl,
  tiktok: ttdl,
  facebook: fbdown,
  twitter,
  youtube,
  mediafire,
  capcut,
  gdrive,
  pinterest,
  douyin,
  xiaohongshu,
  xiaohongshuProfile,
  snackvideo,
  cocofun,
  spotify,
  soundcloud,
  threads,
  kuaishou,
  aio,
};

const URL_KEYS = new Set([
  'url', 'download', 'downloadurl', 'download_url', 'downloadlink',
  'download_link', 'video', 'videourl', 'video_url', 'audio', 'audiourl',
  'audio_url', 'image', 'imageurl', 'image_url', 'media', 'mediaurl',
  'media_url', 'playurl', 'play_url', 'src', 'source', 'link', 'href',
  'nowatermark', 'nowatermarkurl', 'nowatermark_url', 'hd', 'hdurl', 'hd_url',
]);

const THUMB_KEYS = new Set([
  'thumbnail', 'thumb', 'cover', 'coverurl', 'cover_url', 'preview',
  'previewurl', 'preview_url', 'avatar', 'poster', 'image', 'imageurl', 'image_url',
]);

function isUrl(v) {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}

function keyNorm(k) {
  return String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessType(url, key = '', value = '') {
  const s = `${url} ${key} ${value}`.toLowerCase();
  if (s.includes('audio') || s.includes('music') || s.includes('mp3') || /\.(mp3|m4a|aac|wav|ogg)(?:[?#]|$)/i.test(url)) return 'AUDIO';
  if (s.includes('image') || s.includes('photo') || /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(url)) return 'IMAGE';
  return 'VIDEO';
}

function collectUrls(value, out = [], seen = new Set(), parentKey = '') {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out, seen, parentKey);
    return out;
  }
  if (typeof value !== 'object') return out;

  for (const [rawKey, child] of Object.entries(value)) {
    const key = keyNorm(rawKey);

    if (isUrl(child)) {
      const thumbnail = THUMB_KEYS.has(key) || key.includes('thumbnail') || key.includes('cover') || key.includes('preview') || key.includes('avatar') || key === 'poster';
      const likelyMedia = URL_KEYS.has(key) || key.includes('download') || key.includes('video') || key.includes('audio') || key.includes('media') || key.includes('playurl') || key.includes('nowatermark') || /\.(mp4|mov|m4v|webm|mp3|m4a|aac|wav|jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(child);

      if (!thumbnail && likelyMedia && !seen.has(child)) {
        seen.add(child);
        out.push({
          type: guessType(child, `${parentKey} ${key}`, child),
          url: child,
          quality: key.includes('hd') ? 'HD' : key.includes('sd') ? 'SD' : undefined,
        });
      }
      continue;
    }

    if (child && typeof child === 'object') collectUrls(child, out, seen, key);
  }

  return out;
}

function findString(value, keys, depth = 0) {
  if (!value || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  for (const [rawKey, child] of Object.entries(value)) {
    const key = keyNorm(rawKey);
    if (keys.has(key) && typeof child === 'string' && child.trim()) return child.trim();
    if (child && typeof child === 'object') {
      const found = findString(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function normalizeResult(raw, platform, sourceUrl) {
  let data = raw;
  if (data && typeof data === 'object' && 'data' in data && data.data && typeof data.data === 'object') {
    data = data.data;
  }

  const downloads = collectUrls(data);

  if (!downloads.length && isUrl(raw?.url)) {
    downloads.push({ type: guessType(raw.url), url: raw.url });
  }

  if (!downloads.length) {
    throw new Error(`btch-downloader returned no media links for ${platform}.`);
  }

  const title = findString(data, new Set(['title', 'name', 'filename', 'file_name', 'caption'])) || `${platform} Media`;
  const thumbnail = findString(data, THUMB_KEYS) || downloads[0].url;

  return createScraperResult(true, {
    title,
    thumbnail,
    downloads,
    sourceUrl,
  });
}

export async function scrapeBtch(url, platform) {
  const handler = handlers[platform];
  if (!handler) return createScraperResult(false, `btch-downloader does not expose a handler for ${platform}.`);

  try {
    const raw = await handler(url);
    return normalizeResult(raw, platform, url);
  } catch (err) {
    console.warn(`[btch:${platform}]`, err?.message || err);
    return createScraperResult(false, err?.message || `${platform} btch fallback failed.`);
  }
}
