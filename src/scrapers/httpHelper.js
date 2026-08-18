import { getUserAgent } from "../utils/index.js";

export function getRequestTimeout() {
  const customSec = Number.parseInt(process.env.AIODL_REQUEST_TIMEOUT || "30", 10);
  return Number.isFinite(customSec) ? Math.min(180, Math.max(5, customSec)) * 1000 : 30000;
}

export function parseJsonResponse(data, serverName = "Server") {
  if (typeof data === "object" && data !== null) return data;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("<") || trimmed.startsWith("<!DOCTYPE")) {
      throw new Error(`${serverName} returned an HTML error page (blocked or rate-limited).`);
    }
    try { return JSON.parse(trimmed); }
    catch { throw new Error(`${serverName} returned an invalid response format.`); }
  }
  throw new Error(`${serverName} returned an empty response.`);
}

export async function scraperFetch(options, serverName = "Server") {
  const method = (options.method || (options.data ? "POST" : "GET")).toUpperCase();
  const headers = { ...options.headers };
  if (!headers["User-Agent"] && !headers["user-agent"]) headers["User-Agent"] = getUserAgent();
  if (!headers.Accept && !headers.accept) headers.Accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
  if (!headers["Accept-Language"] && !headers["accept-language"]) headers["Accept-Language"] = "en-US,en;q=0.9,id;q=0.8";
  try {
    const parsed = new URL(options.url);
    if (!headers.Referer && !headers.referer) headers.Referer = `${parsed.protocol}//${parsed.hostname}/`;
  } catch {}

  let fetchUrl = options.url;
  if (options.params) {
    const q = new URLSearchParams(options.params).toString();
    if (q) fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + q;
  }

  let body;
  if (options.data !== undefined) {
    if (typeof options.data === "string" || options.data instanceof URLSearchParams || options.data instanceof FormData) {
      body = options.data;
    } else if (headers["Content-Type"]?.includes("application/x-www-form-urlencoded")) {
      body = new URLSearchParams(options.data).toString();
    } else {
      body = JSON.stringify(options.data);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getRequestTimeout());
  let res;
  try {
    res = await fetch(fetchUrl, { method, headers, body, signal: controller.signal, redirect: "follow" });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`${serverName} timed out.`);
    throw new Error(`${serverName} request failed: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const resData = options.responseType === "arraybuffer" ? await res.arrayBuffer() : await res.text();
  const responseHeaders = Object.fromEntries(res.headers.entries());
  if (typeof res.headers.getSetCookie === "function") responseHeaders["set-cookie"] = res.headers.getSetCookie();
  const response = { status: res.status, headers: responseHeaders, data: resData, url: res.url };
  if (options.rawResponse) return response;
  if (options.parseJson !== false) return parseJsonResponse(response.data, serverName);
  return response.data;
}

export function createScraperResult(success, payload, statusCode = null) {
  if (success) return { status: true, result: payload };
  const res = { status: false, message: typeof payload === "string" ? payload : payload?.message || "Scraping failed." };
  if (statusCode !== null && statusCode !== undefined) res.statusCode = statusCode;
  return res;
}
