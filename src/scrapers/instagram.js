import { igdl } from "btch-downloader";
import { getCleanUrl } from "../utils/urlUtils.js";
import { createScraperResult } from "./httpHelper.js";

export let _igSource = null;

export function setInstagramSource(source) {
  _igSource = source;
}

function isInstagramVideoUrl(url) {
  const value = String(url || "").toLowerCase();

  return (
    value.includes("/reel/") ||
    value.includes("/reels/") ||
    value.includes("/tv/")
  );
}

function detectFromObject(item) {
  const values = [
    item?.type,
    item?.mediaType,
    item?.mime,
    item?.mimeType,
    item?.format,
  ];

  for (const value of values) {
    if (!value) continue;

    const type = String(value).toLowerCase();

    if (
      type.includes("video") ||
      type.includes("mp4")
    ) {
      return "VIDEO";
    }

    if (
      type.includes("image") ||
      type.includes("photo") ||
      type.includes("jpg") ||
      type.includes("jpeg") ||
      type.includes("png")
    ) {
      return "IMAGE";
    }
  }

  return null;
}

async function detectFromContentType(url) {
  try {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      5000,
    );

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType =
      response.headers.get("content-type") || "";

    if (contentType.startsWith("video/")) {
      return "VIDEO";
    }

    if (contentType.startsWith("image/")) {
      return "IMAGE";
    }
  } catch (error) {
    // Ignore HEAD errors.
  }

  return null;
}

async function detectMediaType(
  item,
  mediaUrl,
  sourceUrl,
) {
  // 1. Kalau module memberikan type, prioritaskan.
  const objectType = detectFromObject(item);

  if (objectType) {
    return objectType;
  }

  // 2. Reel / Reels / IGTV pasti video.
  if (isInstagramVideoUrl(sourceUrl)) {
    return "VIDEO";
  }

  // 3. Cek ekstensi URL.
  const media = String(mediaUrl || "").toLowerCase();

  if (
    /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(media) ||
    media.includes(".mp4")
  ) {
    return "VIDEO";
  }

  if (
    /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(media)
  ) {
    return "IMAGE";
  }

  // 4. Kalau masih ambigu, cek Content-Type CDN.
  const contentType =
    await detectFromContentType(mediaUrl);

  if (contentType) {
    return contentType;
  }

  // 5. Default terakhir.
  return "IMAGE";
}

export async function scrapeInstagram(url, source) {
  try {
    const cleanUrl = getCleanUrl(url).split("?")[0];

    console.log(
      `[Instagram] btch-downloader: ${cleanUrl}`,
    );

    const result = await igdl(cleanUrl);

    console.log(
      "[Instagram] Result status:",
      result?.status,
      "items:",
      Array.isArray(result?.result)
        ? result.result.length
        : 0,
    );

    if (!result || result.status !== true) {
      throw new Error(
        result?.message ||
          result?.error ||
          "Instagram downloader failed.",
      );
    }

    if (
      !Array.isArray(result.result) ||
      result.result.length === 0
    ) {
      throw new Error(
        "No downloadable Instagram media found.",
      );
    }

    const downloads = [];
    const seen = new Set();

    for (const item of result.result) {
      if (!item?.url) continue;

      const mediaUrl = String(item.url);

      if (!/^https?:\/\//i.test(mediaUrl)) {
        continue;
      }

      if (seen.has(mediaUrl)) {
        continue;
      }

      seen.add(mediaUrl);

      const thumbnail =
        item.thumbnail ||
        item.thumb ||
        null;

      const type = await detectMediaType(
        item,
        mediaUrl,
        cleanUrl,
      );

      downloads.push({
        url: mediaUrl,
        type,
        quality:
          type === "VIDEO"
            ? "HD Video"
            : "HD Photo",
        thumbnail,
      });
    }

    if (downloads.length === 0) {
      throw new Error(
        "Instagram returned media, but no valid download URL was found.",
      );
    }

    _igSource = null;

    return createScraperResult(true, {
      title:
        downloads.length > 1
          ? `Instagram Media (${downloads.length})`
          : "Instagram Media",

      thumbnail:
        downloads[0].thumbnail ||
        downloads[0].url,

      downloads,

      sourceUrl: url,
    });
  } catch (error) {
    console.error(
      "[Instagram] Error:",
      error,
    );

    _igSource = null;

    return createScraperResult(
      false,
      error?.message ||
        "Instagram download failed.",
    );
  }
}
