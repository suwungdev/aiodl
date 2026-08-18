import { scrapeAppleMusic } from './scrapers/applemusic.js';
import { scrapeBandcamp } from './scrapers/bandcamp.js';
import { scrapeBilibili } from './scrapers/bilibili.js';
import { scrapeDouyin } from './scrapers/douyin.js';
import { scrapeFacebook } from './scrapers/facebook.js';
import { scrapeInstagram } from './scrapers/instagram.js';
import { scrapePinterest } from './scrapers/pinterest.js';
import { scrapePixiv } from './scrapers/pixiv.js';
import { scrapeRedNote } from './scrapers/rednote.js';
import { scrapeSpotify } from './scrapers/spotify.js';
import { scrapeThreads } from './scrapers/threads.js';
import { scrapeTikTok } from './scrapers/tiktok.js';
import { scrapeTwitter } from './scrapers/twitter.js';
import { scrapeYouTube } from './scrapers/youtube.js';

const host = (url) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

const definitions = [
  { id: 'youtube', name: 'YouTube', icon: '▶', match: h => h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be', run: scrapeYouTube, sources: ['gg'] },
  { id: 'tiktok', name: 'TikTok', icon: '♪', match: h => h === 'tiktok.com' || h.endsWith('.tiktok.com'), run: scrapeTikTok, sources: ['snaptik', 'tiktokio'] },
  { id: 'instagram', name: 'Instagram', icon: '◎', match: h => h === 'instagram.com' || h.endsWith('.instagram.com'), run: scrapeInstagram, sources: ['downreels', 'indown'] },
  { id: 'facebook', name: 'Facebook', icon: 'f', match: h => h === 'facebook.com' || h.endsWith('.facebook.com') || h === 'fb.watch', run: scrapeFacebook },
  { id: 'twitter', name: 'X / Twitter', icon: '𝕏', match: h => h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com'), run: scrapeTwitter, sources: ['tvd', 'tweeload'] },
  { id: 'pinterest', name: 'Pinterest', icon: 'P', match: h => h === 'pinterest.com' || h.endsWith('.pinterest.com') || h === 'pin.it', run: scrapePinterest },
  { id: 'spotify', name: 'Spotify', icon: '●', match: h => h === 'spotify.com' || h.endsWith('.spotify.com'), run: scrapeSpotify, sources: ['soundloaders'] },
  { id: 'applemusic', name: 'Apple Music', icon: '♫', match: h => h === 'music.apple.com' || h.endsWith('.music.apple.com'), run: scrapeAppleMusic },
  { id: 'pixiv', name: 'Pixiv', icon: 'P', match: h => h === 'pixiv.net' || h.endsWith('.pixiv.net'), run: scrapePixiv },
  { id: 'rednote', name: 'RedNote', icon: 'X', match: h => h === 'rednote.com' || h.endsWith('.rednote.com') || h === 'xiaohongshu.com' || h.endsWith('.xiaohongshu.com') || h === 'xhslink.com' || h.endsWith('.xhslink.com'), run: scrapeRedNote },
  { id: 'bilibili', name: 'Bilibili', icon: 'B', match: h => h === 'bilibili.com' || h.endsWith('.bilibili.com') || h === 'bilibili.tv' || h.endsWith('.bilibili.tv') || h === 'b23.tv' || h.endsWith('.b23.tv') || h === 'bili.im' || h.endsWith('.bili.im'), run: scrapeBilibili },
  { id: 'douyin', name: 'Douyin', icon: '♪', match: h => h === 'douyin.com' || h.endsWith('.douyin.com'), run: scrapeDouyin },
  { id: 'threads', name: 'Threads', icon: '@', match: h => h === 'threads.net' || h.endsWith('.threads.net'), run: scrapeThreads },
  { id: 'bandcamp', name: 'Bandcamp', icon: 'B', match: h => h === 'bandcamp.com' || h.endsWith('.bandcamp.com'), run: scrapeBandcamp },
];

export function detectPlatform(url) {
  const h = host(url);
  return definitions.find(p => p.match(h)) || null;
}

export function listPlatforms() {
  return definitions.map(({ id, name, icon }) => ({ id, name, icon }));
}

export async function scrape(url) {
  const platform = detectPlatform(url);
  if (!platform) throw new Error('Unsupported link. Try a supported social, video, music, or image URL.');

  let last = null;
  const sources = platform.sources || [null];
  for (const source of sources) {
    try {
      const result = source === null ? await platform.run(url) : await platform.run(url, source);
      if (result?.status) return { platform, ...result };
      last = result;
    } catch (err) {
      last = { status: false, message: err.message };
    }
  }
  throw new Error(last?.message || `${platform.name} scraper failed.`);
}
