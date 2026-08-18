const CACHE_MS = 5000;

let cache = null;
let cacheAt = 0;

function configured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function baseUrl() {
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
}

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Record one request.
 *
 * This intentionally fails silently so statistics
 * can NEVER break the downloader itself.
 */
export async function recordPlatformRequest(platform, success) {
  if (!configured() || !platform) return;

  try {
    const response = await fetch(
      `${baseUrl()}/rpc/increment_platform_request`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          p_platform: String(platform),
          p_success: Boolean(success),
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        "[request-stats] failed to record:",
        response.status,
        body.slice(0, 200)
      );
    }

    cache = null;
  } catch (error) {
    console.warn(
      "[request-stats] unavailable:",
      error?.message || error
    );
  }
}

/**
 * Get statistics for admin dashboard.
 */
export async function getRequestStats({ force = false } = {}) {
  if (
    !force &&
    cache &&
    Date.now() - cacheAt < CACHE_MS
  ) {
    return cache;
  }

  const empty = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    successRate: 0,
    platforms: [],
  };

  if (!configured()) {
    return empty;
  }

  try {
    const response = await fetch(
      `${baseUrl()}/platform_request_stats?select=platform,total_requests,success_requests,failed_requests,updated_at&order=total_requests.desc`,
      {
        headers: headers(),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Stats database returned ${response.status}.`
      );
    }

    const rows = await response.json();

    const totalRequests = rows.reduce(
      (sum, row) =>
        sum + Number(row.total_requests || 0),
      0
    );

    const successRequests = rows.reduce(
      (sum, row) =>
        sum + Number(row.success_requests || 0),
      0
    );

    const failedRequests = rows.reduce(
      (sum, row) =>
        sum + Number(row.failed_requests || 0),
      0
    );

    const successRate =
      totalRequests > 0
        ? Math.round(
            (successRequests / totalRequests) * 10000
          ) / 100
        : 0;

    const platforms = rows.map((row) => ({
      platform: row.platform,
      total: Number(row.total_requests || 0),
      success: Number(row.success_requests || 0),
      failed: Number(row.failed_requests || 0),
      successRate:
        Number(row.total_requests || 0) > 0
          ? Math.round(
              (Number(row.success_requests || 0) /
                Number(row.total_requests || 0)) *
                10000
            ) / 100
          : 0,
      updatedAt: row.updated_at,
    }));

    cache = {
      totalRequests,
      successRequests,
      failedRequests,
      successRate,
      platforms,
    };

    cacheAt = Date.now();

    return cache;
  } catch (error) {
    console.warn(
      "[request-stats] read failed:",
      error?.message || error
    );

    return cache || empty;
  }
}

export function clearRequestStatsCache() {
  cache = null;
  cacheAt = 0;
}