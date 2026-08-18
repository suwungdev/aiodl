export const CHROME_UA =
  process.env.AIODL_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const SAFARI_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function getUserAgent() {
  return CHROME_UA;
}

export function getCookiesFromHeaders(headers = {}) {
  const raw =
    headers["Set-Cookie"] ||
    headers["set-cookie"] ||
    headers["Set-Cookie2"] ||
    headers["set-cookie2"] ||
    "";
  if (!raw) return "";
  if (Array.isArray(raw)) return raw.map((c) => c.split(";")[0]).join("; ");
  return String(raw)
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.trim().split(";")[0])
    .join("; ");
}

export function serializeData(obj) {
  return Object.keys(obj)
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(obj[key] ?? ""))
    .join("&");
}

export function decodeSnapSave(data) {
  try {
    const regex =
      /eval\(function\(h,u,n,t,e,r\)\{.*?\}\("(.*?)",(\d+),"(.*?)",(\d+),(\d+),(\d+)\)\)/;
    const match = String(data).match(regex);
    if (match) {
      const h = match[1], u = parseInt(match[2]), n = match[3], t = parseInt(match[4]), e = parseInt(match[5]);
      const delimiter = n[e], parts = h.split(delimiter);
      let decoded = "";
      for (const s of parts) {
        if (s === "") continue;
        let val = 0;
        for (let j = 0; j < s.length; j++) val += n.indexOf(s[j]) * Math.pow(e, s.length - 1 - j);
        decoded += String.fromCharCode(val - t);
      }
      return decodeURIComponent(escape(decoded));
    }
    return data;
  } catch {
    return data;
  }
}

export function extractFinalUrl(input) {
  if (!input) return null;
  let raw = String(input).trim().replace(/^["'\\]+|["'\\]+$/g, "");
  let isRender = false;
  if (raw.includes("get_progressApi")) {
    isRender = true;
    const tokenMatch = raw.match(/token=([^&'"]+)/);
    if (tokenMatch) raw = tokenMatch[1];
  }
  if (raw.includes(".") && !raw.startsWith("http")) {
    try {
      const payloadPart = raw.split(".")[1];
      if (payloadPart) {
        const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
        if (payload.video_url) return { url: payload.video_url, isRender: true };
        if (payload.url) return { url: payload.url, isRender: false };
      }
    } catch {}
  }
  if (raw.startsWith("//")) return { url: "https:" + raw, isRender };
  if (raw.startsWith("/")) return { url: "https://snapsave.app" + raw, isRender };
  return { url: raw, isRender };
}

export { cleanUrl, extractCleanUrl, getCleanUrl } from "./urlUtils.js";
