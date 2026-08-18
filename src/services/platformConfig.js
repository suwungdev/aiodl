import { listPlatforms } from '../platforms.js';

const CACHE_MS = 5000;
let cache = null;
let cacheAt = 0;

const DEFAULT_OVERRIDES = {
  bilibili: {
    enabled: false,
    maintenance: true,
    maintenance_message: 'Bilibili sedang dalam maintenance. Silakan coba lagi nanti.',
  },
};

function defaults() {
  const out = {};
  for (const p of listPlatforms()) {
    out[p.id] = {
      platform: p.id,
      enabled: true,
      maintenance: false,
      maintenance_message: `${p.name} sedang dalam maintenance. Silakan coba lagi nanti.`,
      updated_at: null,
      ...DEFAULT_OVERRIDES[p.id],
    };
  }
  return out;
}

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function endpoint() {
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/platform_settings`;
}

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function dbRows() {
  if (!configured()) return [];
  const res = await fetch(`${endpoint()}?select=platform,enabled,maintenance,maintenance_message,updated_at`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Platform config database returned ${res.status}.`);
  return await res.json();
}

export async function getPlatformConfigs({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const base = defaults();
  if (configured()) {
    try {
      for (const row of await dbRows()) {
        if (base[row.platform]) base[row.platform] = { ...base[row.platform], ...row };
      }
    } catch (err) {
      console.warn('[platform-config] DB read failed, using safe defaults:', err?.message || err);
    }
  }
  cache = base;
  cacheAt = Date.now();
  return cache;
}

export async function getPlatformConfig(id) {
  const configs = await getPlatformConfigs();
  return configs[id] || null;
}

export async function savePlatformConfig(id, patch) {
  if (!configured()) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const known = (await getPlatformConfigs({ force: true }))[id];
  if (!known) throw new Error('Unknown platform.');

  const row = {
    platform: id,
    enabled: patch.enabled === undefined ? known.enabled : Boolean(patch.enabled),
    maintenance: patch.maintenance === undefined ? known.maintenance : Boolean(patch.maintenance),
    maintenance_message: patch.maintenance_message === undefined
      ? known.maintenance_message
      : String(patch.maintenance_message).slice(0, 300),
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Could not save platform config (${res.status})${body ? `: ${body.slice(0, 180)}` : ''}`);
  }
  cache = null;
  return row;
}

export function isAdminConfigured() {
  return Boolean(process.env.AIODL_ADMIN_TOKEN);
}

export function clearPlatformConfigCache() {
  cache = null;
  cacheAt = 0;
}
